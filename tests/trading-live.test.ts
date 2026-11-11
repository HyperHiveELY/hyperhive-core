import {describe,it,expect,vi} from 'vitest';
import {contentSecurityPolicy} from '../apps/api/security.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {selectedDetail,botControl,marketRelationship} from '../apps/web/src/dashboard/trading/live-state.js';
import {normalizeMarkets} from '../apps/web/src/dashboard/trading/catalog.js';
import {TradingDesk} from '../apps/web/src/dashboard/TradingDesk.js';
import {TradingLedger} from '../apps/web/src/dashboard/trading/TradingLedger.js';
import type {Crew} from '../packages/core/domain.js';
const crew={id:'crew-a',paused:true,policy:{name:'Actual HYPE crew',markets:['HYPE'],weeklyBudget:7,maxAccountValue:123,plan:'crew'}} as Crew;
const detail={crew,state:{marginSummary:{accountValue:'43.25'},withdrawable:'29.12',assetPositions:[{position:{coin:'HYPE',szi:'-0.7',entryPx:'65.2',unrealizedPnl:'1.2',leverage:{value:2}}}]},orders:[{oid:9,coin:'HYPE',reduceOnly:true,isTrigger:true,triggerPx:'68',orderType:'Stop market'}],positions:[{body:{state:{market:'HYPE',stop:68,tp:58}}}],readiness:{ready:false,checks:[{id:'tokens',label:'Tokens available',ok:false}]},cards:[{status:'killed',body:{card:{market:'HYPE',side:'short',why:'Recorded reasoning'}},verdict:{reasons:['Recorded skeptic evidence']}}]};
const [hype]=normalizeMarkets([{universe:[{name:'HYPE'}]},[{markPx:'64',dayNtlVlm:'100'}]],'Perps');
describe('production trading isolation and controls',()=>{
 it('never binds a different crew response to the selected account',()=>{expect(selectedDetail(detail,'crew-b')).toBeNull();expect(selectedDetail(detail,'')).toBeNull();expect(selectedDetail(detail,'crew-a')).toBe(detail);});
 it('requires explicit readiness before offering start',()=>{
  expect(botControl(null).action).toBe('setup');expect(botControl(detail).action).toBe('setup');
  expect(botControl({...detail,readiness:undefined}).action).toBe('setup');
  expect(botControl({...detail,readiness:{ready:true}}).action).toBe('start');
 });
 it('keeps Pause available for an enabled bot even when readiness is lost',()=>{
  expect(botControl({...detail,crew:{...crew,paused:false}})).toMatchObject({action:'pause',status:'Checks need attention'});
  expect(botControl({...detail,crew:{...crew,paused:false},readiness:{ready:true}}).status).toBe('Running');
 });
 it('uses server entry eligibility, never the public catalog flag, without altering policy',()=>{
  const m={...hype,eligible:true};expect(marketRelationship(m,crew,[],true).note).toContain('Outside');
  expect(marketRelationship({...m,eligible:false},crew,[{name:'HYPE'}],true).note).toContain('all risk checks');
  expect(marketRelationship(m,crew,[{name:'HYPE'}],false).note).toContain('unavailable');
  expect(crew.policy.markets).toEqual(['HYPE']);
 });
 it('does not confuse a spot or builder ticker with a signed native market',()=>{
  for(const kind of ['Spot','HIP-3'] as const){const relation=marketRelationship({...hype,kind},crew,[{name:'HYPE'}],true);expect(relation.matches).toBe(false);expect(relation.note).toContain('Browse only');}
  expect(marketRelationship({...hype,delisted:true},crew,[{name:'HYPE'}],true).note).toContain('Delisted');
 });
 it('renders actual balances, limits and decision evidence with all existing management controls',()=>{
  const props={markets:[],data:null,detail,selected:crew.id,onSelect:vi.fn(),onAction:vi.fn(),onOpen:vi.fn(),onCreate:vi.fn(),api:vi.fn(),busy:false};
  const html=renderToStaticMarkup(React.createElement(TradingDesk,props));
  for(const expected of ['$43.25','$29.12','7 USDC','123 USDC','Recorded skeptic evidence','Finish setup','Fund','Account &amp; policy','Withdraw funds','Unlock account','Approve agent','Renew policy &amp; agent','Revoke agent','Close all positions','Manage AI Tokens'])expect(html).toContain(expected);
  expect(html).not.toContain('simulated');expect(props.api).not.toHaveBeenCalled();expect(props.onAction).not.toHaveBeenCalled();
 });
 it('renders real positions and protection, and never shows another crew’s ledger while switching',()=>{
  const props={selected:crew.id,detail,api:vi.fn(),busy:false,onAction:vi.fn(),onOpen:vi.fn()};
  const html=renderToStaticMarkup(React.createElement(TradingLedger,props));
  for(const expected of ['Short','0.7','$65.20','+$1.20','$68.00','$58.00','2','Stop market','Close all positions'])expect(html).toContain(expected);
  const switched=renderToStaticMarkup(React.createElement(TradingLedger,{...props,selected:'crew-b'}));
  expect(switched).toContain('Loading positions');expect(switched).not.toContain('$65.20');expect(switched).not.toContain('No open positions');expect(switched).not.toContain('Close all positions');
 });
});

it('allows official coin artwork in production without widening script or API permissions',()=>{const policy=contentSecurityPolicy([]);expect(policy).toContain("img-src 'self' data: blob: https://app.hyperliquid.xyz/coins/");expect(policy).toContain("script-src-attr 'none'");expect(policy).not.toContain("img-src *");});

it('does not misrepresent an unavailable account as having no exposure',()=>{
 const html=renderToStaticMarkup(React.createElement(TradingLedger,{selected:crew.id,detail:{...detail,state:{marginSummary:{accountValue:null},assetPositions:[]}},api:vi.fn(),busy:false,onAction:vi.fn(),onOpen:vi.fn()}));
 expect(html).toContain('Account data unavailable');expect(html).not.toContain('No open positions');expect(html).not.toContain('Protective orders');
});
