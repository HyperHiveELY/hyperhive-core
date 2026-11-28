import type {Database} from '../../packages/core/db.js';
import {verifyRecord} from '../worker/auditor.js';

type Summary=Awaited<ReturnType<typeof verifyRecord>>;
/** How long a worker-written summary is served before the API recomputes it itself. */
const FRESH_MS=10*60000;
/** Recomputed summaries are shared for this long, so a burst of public requests costs one verification. */
const MEMORY_MS=60000;
const memory=new Map<string,{at:number;value:Promise<Summary>}>();

/** Public record summary. Re-checking every signature on every request would let anyone load the API with free
 *  public calls, so this serves the copy the worker stores after each audit, and otherwise one shared in-process
 *  computation per crew per minute. */
export async function cachedRecord(db:Database,id:string):Promise<Summary>{
  const stored=(await db.query<{body:Summary;updated_at:number}>('SELECT body,updated_at FROM record_summaries WHERE crew_id=$1',[id])).rows[0];
  if(stored&&Date.now()-stored.updated_at<FRESH_MS)return stored.body;
  const held=memory.get(id);
  if(held&&Date.now()-held.at<MEMORY_MS)return held.value;
  const value=verifyRecord(db,id);
  memory.set(id,{at:Date.now(),value});
  value.catch(()=>memory.delete(id));
  if(memory.size>1000)for(const [key,entry] of memory)if(Date.now()-entry.at>=MEMORY_MS)memory.delete(key);
  return value;
}
