import net, {type Server, type Socket} from 'node:net';
import tls from 'node:tls';

type Endpoint = {host: string; port: number};
type Credentials = {key: string; cert: string; ca: string};

function pipeSockets(front: Socket, back: Socket) {
  const close = () => { front.destroy(); back.destroy(); };
  front.on('error', close).on('close', close);
  back.on('error', close).on('close', close);
  front.pipe(back).pipe(front);
}

async function listen(server: Server, at: Endpoint) {
  server.maxConnections = 24;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(at.port, at.host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return server;
}

/** Forward authenticated signer connections only to the configured production database. */
export function listenForSigner(at: Endpoint, database: Endpoint, credentials: Credentials) {
  const server = tls.createServer({
    ...credentials, minVersion: 'TLSv1.3', requestCert: true, rejectUnauthorized: true,
    handshakeTimeout: 5000,
  }, client => {
    if (!client.authorized || tls.checkServerIdentity('hyperhive-signer.internal', client.getPeerCertificate())) {
      client.destroy();
      return;
    }
    pipeSockets(client, net.connect(database));
  });
  return listen(server, at);
}

/** PostgreSQL still verifies its own server certificate inside this encrypted connection. */
export function listenForDatabaseClient(port: number, ingress: Endpoint, credentials: Credentials) {
  const server = net.createServer(client => {
    const upstream = tls.connect({
      ...ingress, ...credentials, servername: 'hyperhive-ingress.internal',
      minVersion: 'TLSv1.3', rejectUnauthorized: true,
    });
    upstream.setTimeout(5000, () => upstream.destroy());
    upstream.once('secureConnect', () => upstream.setTimeout(0));
    pipeSockets(client, upstream);
  });
  return listen(server, {host: '127.0.0.1', port});
}

/** An absent setting disables the listener. Partial credentials fail startup. */
export function signerTransportConfig(raw = process.env.SIGNER_DB_TRANSPORT) {
  if (!raw) return;
  const value = JSON.parse(raw) as Partial<Credentials & Endpoint>;
  if (!value.key || !value.cert || !value.ca || !value.host ||
      !Number.isInteger(value.port) || value.port! < 1 || value.port! > 65535) {
    throw Error('Incomplete signer database transport configuration');
  }
  return {credentials: {key: value.key, cert: value.cert, ca: value.ca},
    endpoint: {host: value.host, port: value.port!}};
}
