import {it,expect,vi,afterEach} from 'vitest';
import {httpError,parseJsonText,fetchJson} from '../packages/ai/types.js';
afterEach(()=>vi.unstubAllGlobals());
it('maps retry and billing outcomes and redacts identifiers from provider text',()=>{
 for(const [status,body,code,retry] of [[401,'','auth',false],[402,'','quota',false],[429,'billing','quota',false],[429,'again','rate_limited',true],[503,'','overloaded',true],[422,'{"user_id":"private-example"}','bad_request',false],[418,'','unknown',false]] as const){
  const error=httpError('fixture',status,body,new Headers({'retry-after':'3'}));
  expect(error.code).toBe(code);expect(error.retryable).toBe(retry);expect(error.message).not.toContain('private-example');
  if(retry)expect(error.opts.retryAfterMs).toBe(3000);
 }
});
it('preserves typed transport, status and malformed response errors',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const read=()=>fetchJson('fixture','https://fixture.invalid',{},1000);
 fetch.mockRejectedValueOnce(new DOMException('expired','TimeoutError')).mockRejectedValueOnce(Error('disconnected'));
 await expect(read()).rejects.toMatchObject({code:'timeout'});await expect(read()).rejects.toMatchObject({code:'network'});
 fetch.mockResolvedValueOnce(new Response('busy',{status:503})).mockResolvedValueOnce(new Response('wat')).mockResolvedValueOnce(Response.json({value:3}));
 await expect(read()).rejects.toMatchObject({code:'overloaded'});await expect(read()).rejects.toMatchObject({code:'parse'});expect(await read()).toEqual({value:3});
 expect(parseJsonText('fixture','wrapped {"a":2}')).toEqual({a:2});expect(()=>parseJsonText('fixture','{broken}')).toThrow('valid JSON');expect(()=>parseJsonText('fixture','')).toThrow('empty');
});
it('only falls back for unsupported response formats',async()=>{
 const {formatRejected}=await import('../packages/ai/chat.js');
 for(const [status,body,expected] of [[403,'bad key',false],[404,'no endpoints found',true],[404,'model missing',false],[422,'response_format unsupported',true],[400,'model unknown',false],[400,'request rejected',true]] as const)
  expect(formatRejected(httpError('fixture',status,body,new Headers()))).toBe(expected);
});
