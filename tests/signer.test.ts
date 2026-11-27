import {it,expect,vi,afterEach} from 'vitest';
import {Signer} from '../apps/signer/engine.js';
import {Database} from '../packages/core/db.js';
import {crew,wallet} from './fixtures.js';
import {policyMessage} from '../packages/core/domain.js';
vi.mock('@phala/dstack-sdk',()=>({DstackClient:class {}}));
afterEach(()=>vi.restoreAllMocks());
it('still manages existing exits when quote refresh fails, even for an expired policy',async()=>{
 const db=await new Database('memory').init();
 try{
  const c=await crew();c.policy={...c.policy,issuedAt:Date.now()-86400000,expiresAt:Date.now()-1};c.signature=await wallet.signMessage({message:policyMessage(c.policy)});
  await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,Date.now()]);
  const signer=new Signer(db);vi.spyOn(signer,'identity').mockRejectedValue(Error('Quote service unavailable'));vi.spyOn(signer,'controls').mockResolvedValue(true);const exits=vi.spyOn(signer,'exits').mockResolvedValue();const entries=vi.spyOn(signer,'enter').mockResolvedValue();vi.spyOn(signer,'anchor').mockResolvedValue();
  await signer.tick();expect(exits).toHaveBeenCalledOnce();expect(entries).not.toHaveBeenCalled();
 }finally{await db.close();}
});
it('never executes a crew whose stored account differs from its signed policy',async()=>{
 const db=await new Database('memory').init();try{const c=await crew();await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,'0x0000000000000000000000000000000000000001',JSON.stringify(c.policy),c.signature,Date.now()]);const s=new Signer(db);const exits=vi.spyOn(s,'exits').mockResolvedValue();vi.spyOn(s,'anchor').mockResolvedValue();await s.tick();expect(exits).not.toHaveBeenCalled();expect((await db.query("SELECT * FROM events WHERE kind='signer_error'")).rows.length).toBe(1);}finally{await db.close();}
});
