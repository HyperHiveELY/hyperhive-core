import {expect,it,vi} from 'vitest';
const registered=vi.hoisted(()=>new Map<string,{annotations:any;call:Function}>());
vi.mock('@modelcontextprotocol/sdk/server/mcp.js',()=>({McpServer:class{registerTool(name:string,opts:any,call:Function){registered.set(name,{annotations:opts.annotations,call})}async connect(){}}}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js',()=>({StdioServerTransport:class{}}));
it('exposes four read-only tools with scoped public endpoints',async()=>{
 const fetch=vi.fn().mockResolvedValue(Response.json({fixture:true}));vi.stubGlobal('fetch',fetch);vi.stubEnv('HYPERHIVE_API_ORIGIN','https://fixture.invalid');
 try{
  await import('../apps/mcp/main.js');
  const paths=['/api/markets','/api/records/example','/api/records/example/slips','/api/records/example/fills'];
  expect([...registered.keys()]).toEqual(['get_markets','get_public_record','get_slip_archive','get_public_fills']);
  for(const [i,tool] of [...registered.values()].entries()){
   fetch.mockResolvedValueOnce(Response.json({path:paths[i]}));expect(tool.annotations.readOnlyHint).toBe(true);
   expect(JSON.parse((await tool.call({crewId:'example'})).content[0].text)).toEqual({path:paths[i]});expect(fetch.mock.calls[i][0].pathname).toBe(paths[i]);
  }
  fetch.mockResolvedValueOnce(new Response('',{status:404}));await expect(registered.get('get_markets')!.call()).rejects.toThrow('request failed');
 }finally{vi.unstubAllGlobals();vi.unstubAllEnvs();}
});
