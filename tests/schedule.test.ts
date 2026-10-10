import {it,expect} from 'vitest';
import {Database} from '../packages/core/db.js';
import {claimScan} from '../packages/ai/schedule.js';
it('does not repeat an abstained or failed scan until its cadence elapses',async()=>{
 const db=await new Database('memory').init();
 try{expect(await claimScan(db,'crew','trend','BTC',60000,1000)).toBe(true);expect(await claimScan(db,'crew','trend','BTC',60000,1001)).toBe(false);expect(await claimScan(db,'crew','trend','BTC',60000,61000)).toBe(true);}finally{await db.close();}
});
