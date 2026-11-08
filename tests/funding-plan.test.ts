import {describe,it,expect} from 'vitest';
import {fundingPlan,type FundingSnapshot} from '../apps/web/src/dashboard/funding-plan.js';
const state:FundingSnapshot={owner:'0xowner',account:'0xcrew',available:0,equity:0,ownerActivation:true,crewActivation:true,checkedAt:1};
describe('customer funding estimates',()=>{
 it('includes both first-use fees without counting the Token purchase twice',()=>{
  expect(fundingPlan(state,50,100,true)).toEqual({topUp:50,transfer:51,tokens:5,crewActivation:1,ownerActivation:1,required:56,shortfall:56,incoming:57});
 });
 it('credits existing funds and activation rather than requesting a full deposit again',()=>{
  const p=fundingPlan({...state,available:20,equity:30,crewActivation:false,ownerActivation:false},50,100,true);
  expect(p).toMatchObject({topUp:20,transfer:20,required:25,shortfall:5,incoming:5});
 });
 it('does not require another AI purchase or fund a target already reached',()=>{
  expect(fundingPlan({...state,equity:60},50,100,false)).toMatchObject({required:0,incoming:0,crewActivation:0,ownerActivation:0});
 });
 it('never rounds a needed transfer down below the target',()=>{
  const p=fundingPlan({...state,available:10.999999,equity:39.123456,crewActivation:false,ownerActivation:false},50,100,true);
  expect(p.transfer).toBe(10.876544);expect(p.shortfall).toBe(4.876545);
 });
 it('requires finite data and respects the signed cap',()=>{
  for(const n of [0,9,101,NaN,Infinity])expect(()=>fundingPlan(state,n,100,true)).toThrow();
  for(const bad of [{available:NaN},{available:-1},{equity:Infinity}])expect(()=>fundingPlan({...state,...bad},50,100,true)).toThrow();
 });
});

it('needs only trading funds and activation when AI testing is included',()=>{
 expect(fundingPlan(state,10,100,false)).toMatchObject({topUp:10,tokens:0,transfer:11,required:11,incoming:12});
});
