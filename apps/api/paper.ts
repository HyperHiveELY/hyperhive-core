import type {FastifyInstance,FastifyRequest} from 'fastify';
import {config} from '../../packages/core/config.js';
import {z} from 'zod';
import type {Database} from '../../packages/core/db.js';
import type {Crew} from '../../packages/core/domain.js';
import {readPaper,paperControl,totals,PAPER_FEE,PAPER_SLIPPAGE,PAPER_START} from '../../packages/paper/account.js';
import {aiCreditAccess,aiTestingExempt,meteringReady} from '../../packages/core/tokens.js';
/** Install authenticated paper-account read and control routes for the selected crew. */
export function registerPaper(app:FastifyInstance,db:Database,crew:(req:FastifyRequest,id:string)=>Promise<Crew>){
 /** Read the owned crew's simulation state and paper execution history. */
 app.get<{Params:{id:string}}>('/api/crews/:id/paper',async req=>{const c=await crew(req,req.params.id),account=await readPaper(db,c.id);return {available:config.NODE_ENV!=='production',account,totals:account?totals(account):null,testingExempt:await aiTestingExempt(db,c.owner),events:(await db.query('SELECT * FROM paper_events WHERE crew_id=$1 ORDER BY id DESC LIMIT 100',[c.id])).rows,worker:(await db.query('SELECT updated_at FROM heartbeats WHERE role=$1',['paper'])).rows[0]??null,assumptions:{initial:PAPER_START,feeBps:PAPER_FEE*10000,slippageBps:PAPER_SLIPPAGE*10000,funding:false}};});
 /** Change a local crew's simulation state subject to funding and execution interlocks. */
 app.post<{Params:{id:string}}>('/api/crews/:id/paper/control',async req=>{const c=await crew(req,req.params.id),{action}=z.strictObject({action:z.enum(['start','pause','close'])}).parse(req.body);if(config.NODE_ENV==='production')throw Object.assign(Error('Paper trading runs in the local workspace only'),{statusCode:503});if(action==='start'&&(!await aiCreditAccess(db,c.owner)||!await meteringReady(db)))throw Error('AI billing is not ready');return {account:await paperControl(db,c.id,action)};});
}
