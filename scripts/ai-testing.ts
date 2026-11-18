import {Database} from '../packages/core/db.js';
import {assertLocalConfig} from '../packages/core/local-mode.js';
import {Address} from '../packages/core/domain.js';
import {setAiTestingAccess,aiTestingExempt} from '../packages/core/tokens.js';
// Local operator command only. There is no customer-facing grant endpoint.
assertLocalConfig();
const [action,rawOwner,...extra]=process.argv.slice(2);
if(!['enable','disable','status'].includes(action)||!rawOwner||extra.length)throw Error('Usage: npm run ai:testing -- enable|disable|status OWNER_ADDRESS');
const owner=Address.parse(rawOwner),db=await new Database().init();
try{
 const access=action==='status'?{owner,testingExempt:await aiTestingExempt(db,owner)}:await setAiTestingAccess(db,owner,action==='enable');
 console.log(JSON.stringify(access));
 console.log('AI provider costs and daily limits still apply. No trading or wallet permissions changed.');
}finally{await db.close();}
