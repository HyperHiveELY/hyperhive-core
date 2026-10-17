import {it,expect,vi} from 'vitest';
import {mkdtemp,stat,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it('serializes concurrent secret updates, validates settings and preserves file permissions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hh-secrets-test-'));const path=join(dir,'private','settings.json');
 vi.stubEnv('HYPERHIVE_SECRETS_FILE',path);for(const key of ['PPQ_API_KEY','PPQ_SCOUT_MODEL','PPQ_SKEPTIC_MODEL','INTEGRATION_SETTINGS'])vi.stubEnv(key,'');
 try{
  vi.resetModules();const s=await import('../packages/core/secrets.js');
  expect(await s.secrets()).toEqual({});
  await Promise.all([s.savePpq('fixture-credential'),s.saveModels('org/scout','org/skeptic'),s.saveIntegrationSecrets({TELEGRAM_BOT_USERNAME:'testbot'})]);
  expect(await s.ppqKey()).toBe('fixture-credential');expect(await s.modelSettings()).toEqual({scout:'org/scout',skeptic:'org/skeptic'});expect((await stat(path)).mode&0o777).toBe(0o600);
  await expect(s.savePpq('bad')).rejects.toThrow();await expect(s.saveModels('same','same')).rejects.toThrow();
  await expect(s.saveIntegrationSecrets({PPQ_API_KEY:'ignored'} as any)).rejects.toThrow('Unsupported');
  await writeFile(path,'broken');await expect(s.secrets()).rejects.toThrow();
 }finally{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
});
it('keeps deployment-managed configuration immutable and requires a new terms version for changed text',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hh-integration-test-'));
 vi.stubEnv('HYPERHIVE_SECRETS_FILE',join(dir,'settings.json'));vi.stubEnv('INTEGRATION_SETTINGS',undefined);
 try{
  vi.resetModules();const i=await import('../packages/core/integration-settings.js');
  const saved=await i.saveIntegrationSettings({termsVersion:'1',termsText:'Terms A',eligibilityEnabled:true,blockedCountries:['US']});
  expect((await i.integrationSettings()).termsText).toBe('Terms A');
  await expect(i.saveIntegrationSettings({...saved,termsText:'Terms B'})).rejects.toThrow('new terms version');
  await expect(i.saveIntegrationSettings({...saved,termsText:''})).rejects.toThrow('published terms');
  vi.stubEnv('INTEGRATION_SETTINGS','{}');await expect(i.saveIntegrationSettings(saved)).rejects.toThrow('deployment environment');
 }finally{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
});
it('discards a session when acquiring or releasing an advisory lock fails',async()=>{
 const {Pool}=await import('pg');
 const {Database}=await import('../packages/core/db.js');
 const client={query:vi.fn(),release:vi.fn()};
 const connect=vi.spyOn(Pool.prototype,'connect').mockImplementation(async()=>client as any);
 const db=new Database('postgresql://localhost/disposable');
 try{
  client.query.mockRejectedValueOnce(Error('lock interrupted'));
  await expect(db.lock('monitor')).rejects.toThrow('lock interrupted');
  expect(client.release).toHaveBeenCalledWith(true);
  client.release.mockClear();
  client.query.mockResolvedValueOnce({rows:[{ok:true}]}).mockRejectedValueOnce(Error('unlock interrupted'));
  const unlock=await db.lock('monitor');
  await expect(unlock!()).rejects.toThrow('unlock interrupted');
  expect(client.release).toHaveBeenCalledWith(true);
 }finally{connect.mockRestore();await db.close();}
});
