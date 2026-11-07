import {describe,it,expect} from 'vitest';
import {nextCrewStep,type ReadinessCheck} from '../apps/web/src/dashboard/crew-journey.js';
const ids=['access','policy','ai','worker','signer','identity','funded','margin','cap','agent','journal','record','tokens','metering'];
const checks=(failed:string[]=[])=>ids.map(id=>({id,label:id,ok:!failed.includes(id)}));
describe('crew setup guidance',()=>{
 it('never offers Start for missing or incomplete readiness',()=>{
  expect(nextCrewStep([])).toBe('service');
  expect(nextCrewStep(checks().filter(c=>c.id!=='agent'))).toBe('approve');
  for(const id of ids)expect(nextCrewStep(checks([id]))).not.toBe('start');
 });
 it('keeps funding, AI credits and approval separate and ordered',()=>{
  expect(nextCrewStep(checks(['funded','margin','tokens','agent']))).toBe('fund');
  expect(nextCrewStep(checks(['tokens','agent']))).toBe('tokens');
  expect(nextCrewStep(checks(['agent']))).toBe('approve');
  expect(nextCrewStep(checks())).toBe('start');
 });
 it('routes account exceptions to account review before spending on Tokens',()=>{
  expect(nextCrewStep(checks(['cap','tokens']))).toBe('limits');
  expect(nextCrewStep(checks(['margin']))).toBe('margin');
  for(const id of ['policy','journal','record'])expect(nextCrewStep(checks([id,'tokens']))).toBe('account');
 });
 it('blocks new unknown failed checks and stale service checks',()=>{
  const future:ReadinessCheck={id:'new-requirement',label:'Future requirement',ok:false};
  expect(nextCrewStep([...checks(),future])).toBe('service');
  expect(nextCrewStep(checks(['worker']))).toBe('service');
  expect(nextCrewStep(checks(['worker','funded','tokens']))).toBe('service');
  expect(nextCrewStep(checks(['identity','agent']))).toBe('service');
 });
});
