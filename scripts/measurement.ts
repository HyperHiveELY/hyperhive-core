import {DstackClient} from '@phala/dstack-sdk';
import {hash} from '../packages/core/domain.js';
const details=await new DstackClient(process.env.DSTACK_SOCKET??'/var/run/dstack.sock').info();
const {mrtd,rtmr0,rtmr1,rtmr2,rtmr3}=details.tcb_info;
console.log(JSON.stringify({measurement:hash({mrtd,rtmr0,rtmr1,rtmr2,rtmr3,composeHash:details.compose_hash}),composeHash:details.compose_hash},null,2));
console.log('Compare the compose/image and hardware measurements independently before approval; this output is discovery, not approval.');
