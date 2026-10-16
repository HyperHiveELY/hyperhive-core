import {it,expect,vi,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
import {Database,heartbeat} from '../packages/core/db.js';
import {config} from '../packages/core/config.js';
import {assertProductionConfig} from '../packages/core/production.js';
import {runtimeHealth,serviceHealthy} from '../packages/core/runtime-health.js';
import {contentSecurityPolicy} from '../apps/api/security.js';
import {accessStatus} from '../packages/core/access.js';
import * as integration from '../packages/core/integration-settings.js';
const before={...config};afterEach(()=>{Object.assign(config,before);vi.restoreAllMocks();});
it('rejects unsafe public configurations before services start',()=>{
 const c={...config,NODE_ENV:'production',PUBLIC_ORIGIN:'https://hyperhive.example',SIGNER_MODE:'phala' as const,DATABASE_URL:'postgres://db.example/hyperhive?sslmode=verify-full'};
 expect(()=>assertProductionConfig(c)).not.toThrow();
 for(const delta of [{PUBLIC_ORIGIN:'http://hyperhive.example'},{PUBLIC_ORIGIN:'https://hyperhive.example/path'},{SIGNER_MODE:'local' as const},{DATABASE_URL:undefined},{DATABASE_URL:'postgres://db.example/hyperhive?sslmode=require'}])expect(()=>assertProductionConfig({...c,...delta})).toThrow();
});
it('hashes only the exact inline scripts and blocks arbitrary inline scripts, framing and objects',()=>{
 const script='window.example = 1;';const csp=contentSecurityPolicy([`<script>${script}</script><script src="/app.js"></script>`]);
 expect(csp).toContain("'sha256-"+createHash('sha256').update(script).digest('base64')+"'");expect(csp).toContain("script-src-attr 'none'");expect(csp).toContain("frame-ancestors 'none'");expect(csp).toContain("object-src 'none'");expect(csp.split('; ').find(s=>s.startsWith('script-src '))).not.toMatch(/unsafe-inline|unsafe-eval/);
});
it('requires fresh worker/signer activity and no metering circuit breaker',async()=>{
 const db=await new Database('memory').init();try{
  config.SIGNER_MODE='local';expect((await runtimeHealth(db)).ok).toBe(false);
  await heartbeat(db,'worker',{cycleStartedAt:Date.now()});await heartbeat(db,'signer',{mode:'local',liveEnabled:true});expect((await runtimeHealth(db)).ok).toBe(true);
  expect(serviceHealthy({role:'worker',updated_at:Date.now(),details:{cycleStartedAt:Date.now()-1000000}})).toBe(false);
  await db.query("INSERT INTO ai_metering_alerts VALUES('test','Needs review',$1,NULL)",[Date.now()]);expect((await runtimeHealth(db)).ok).toBe(false);
  await db.query('DELETE FROM ai_metering_alerts');await db.query("UPDATE heartbeats SET updated_at=0 WHERE role='signer'");expect((await runtimeHealth(db)).ok).toBe(false);
 }finally{await db.close();}
});
it('does not allow new production entries when operator eligibility has not been published',async()=>{
 const db=await new Database('memory').init();try{vi.spyOn(integration,'integrationSettings').mockResolvedValue({aiMarkupBps:2500,tokenThreshold:'10000',termsText:'',blockedCountries:[],eligibilityEnabled:false});config.NODE_ENV='production';expect((await accessStatus(db,'0x'+'11'.repeat(20))).eligible).toBe(false);config.NODE_ENV='test';expect((await accessStatus(db,'0x'+'11'.repeat(20))).eligible).toBe(true);}finally{await db.close();}
});

it('treats observation mode as a live process and keeps trading readiness disabled',async()=>{
 const {serviceAlive}=await import('../packages/core/runtime-health.js');
 const signer={role:'signer',updated_at:Date.now(),details:{mode:config.SIGNER_MODE,liveEnabled:false}};
 expect(serviceAlive(signer)).toBe(true);
 expect(serviceHealthy(signer)).toBe(false);
 expect(contentSecurityPolicy([]).split('; ').find(s=>s.startsWith('connect-src'))).toContain(new URL((await import('../packages/core/chain.js')).contractRpc).origin);
});
