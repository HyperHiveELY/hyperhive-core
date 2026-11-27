import {afterAll, beforeAll, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net, {type AddressInfo, type Server} from 'node:net';
import tls from 'node:tls';
import {once} from 'node:events';
import {listenForDatabaseClient, listenForSigner, signerTransportConfig} from '../packages/core/signer-db-transport.js';

const dir = mkdtempSync(join(tmpdir(), 'hh-test-certs-'));
const host = '127.0.0.1';
const servers: Server[] = [];
const port = (s: Server) => (s.address() as AddressInfo).port;
function openssl(...args: string[]) {
  execFileSync('openssl', args, {cwd: dir, stdio: 'ignore'});
}
function read(name: string) { return readFileSync(join(dir, name), 'utf8'); }
function issue(name: string, usage: string) {
  openssl('req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes',
    '-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name);
  writeFileSync(join(dir,name+'.ext'),'extendedKeyUsage='+usage+'\nsubjectAltName=DNS:'+name+'\n');
  openssl('x509','-req','-in',name+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial',
    '-days','1','-extfile',name+'.ext','-out',name+'.crt');
  return {cert:read(name+'.crt'),key:read(name+'.key'),ca:read('ca.crt')};
}
let ingress: Server, client: Server, wrong: ReturnType<typeof issue>;
let upstreamConnections = 0;
beforeAll(async () => {
  openssl('req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes',
    '-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=Test CA','-addext','basicConstraints=critical,CA:TRUE');
  const backend = net.createServer(socket => {upstreamConnections++; socket.pipe(socket);});
  backend.listen(0,host); await once(backend,'listening'); servers.push(backend);
  ingress = await listenForSigner({host,port:0},{host,port:port(backend)},issue('hyperhive-ingress.internal','serverAuth'));
  servers.push(ingress);
  client = await listenForDatabaseClient(0,{host,port:port(ingress)},issue('hyperhive-signer.internal','clientAuth'));
  servers.push(client); wrong = issue('other.internal','clientAuth');
});
afterAll(async () => {
  await Promise.all(servers.map(s => new Promise<void>(resolve => s.close(() => resolve()))));
  rmSync(dir,{recursive:true,force:true});
});
it('transports database bytes for the paired signer', async () => {
  const socket=net.connect(port(client),host);
  try {
    socket.write('database payload');
    const [reply]=await once(socket,'data');
    expect(reply.toString()).toBe('database payload');
  } finally {socket.destroy();}
});
it('refuses both uncredentialed clients and other identities signed by the same CA', async () => {
  const start=upstreamConnections;
  for(const creds of [{ca:read('ca.crt')},wrong]){
    const socket=tls.connect({host,port:port(ingress),servername:'hyperhive-ingress.internal',...creds});
    await new Promise<void>(resolve=>{socket.on('error',()=>{});socket.once('close',()=>resolve());});
  }
  expect(upstreamConnections).toBe(start);
});
it('requires a complete configuration to enable forwarding', () => {
  expect(signerTransportConfig('')).toBeUndefined();
  expect(()=>signerTransportConfig('{}')).toThrow('Incomplete');
  expect(signerTransportConfig(JSON.stringify({...wrong,host,port:443}))?.endpoint).toEqual({host,port:443});
});
