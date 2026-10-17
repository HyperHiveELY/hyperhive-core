import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import {Database,type Sql,heartbeat} from './db.js';
import {telegramToken} from './integration-settings.js';
import {secrets,saveIntegrationSecrets} from './secrets.js';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const TelegramPreferences=z.strictObject({fills:z.boolean(),brackets:z.boolean(),standDown:z.boolean(),broken:z.boolean(),expiry:z.boolean()});
export type TelegramPreferences=z.infer<typeof TelegramPreferences>;
export const defaultPreferences:TelegramPreferences={fills:true,brackets:true,standDown:true,broken:true,expiry:true};
/** Call an allowed Telegram bot method with the configured credential and check its response. */
export async function telegramCall(method:'getMe'|'getWebhookInfo'|'getUpdates'|'sendMessage',body:unknown={},token?:string){
 const key=token??await telegramToken();if(!key)throw Error('Configure a Telegram bot token first');
 let response:Response;try{response=await fetch('https://api.telegram.org/bot'+key+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw Error('Telegram connection failed');}
 const result=await response.json() as any;if(!response.ok||!result.ok)throw Error('Telegram request failed ('+response.status+'): '+String(result.description??'Request rejected').replaceAll(key,'[redacted]').slice(0,180));return result.result;
}
/** Validate bot identity and polling compatibility before persisting its configuration. */
export async function configureTelegram(token:string){
 if(!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token))throw Error('Invalid Telegram bot token');
 const me=await telegramCall('getMe',{},token);if(!me.is_bot||!me.username)throw Error('Telegram token does not identify a bot');
 const hook=await telegramCall('getWebhookInfo',{},token);if(hook.url)throw Error('This bot already uses a webhook. Use a dedicated HyperHive bot or remove its webhook first.');
 await saveIntegrationSecrets({TELEGRAM_BOT_TOKEN:token,TELEGRAM_BOT_USERNAME:me.username});return {username:me.username};
}
/** Report private link and preference state for the authenticated owner. */
export async function telegramStatus(db:Sql,owner:string){
 const data=(await db.query<any>('SELECT chat_label,linked_at,preferences,chat_id IS NOT NULL AS linked FROM telegram_links WHERE owner=$1',[owner])).rows[0];
 const pending=(await db.query<{n:string}>("SELECT count(*)::text n FROM notification_outbox WHERE owner=$1 AND status='PENDING'",[owner])).rows[0];
 return {configured:Boolean(await telegramToken()),username:(await secrets()).TELEGRAM_BOT_USERNAME??null,linked:Boolean(data?.linked),chatLabel:data?.chat_label??null,preferences:data?.preferences??defaultPreferences,pending:Number(pending?.n??0)};
}
/** Issue a short-lived owner-bound code for linking a Telegram chat. */
export async function beginTelegramLink(db:Database,owner:string){
 const token=await telegramToken();if(!token)throw Error('Configure the Telegram bot first');
 const me=await telegramCall('getMe');const code=randomBytes(24).toString('base64url');
 await db.transaction(async q=>{await q.query('DELETE FROM telegram_pairings WHERE owner=$1 OR expires_at<$2',[owner,Date.now()]);await q.query('INSERT INTO telegram_pairings VALUES($1,$2,$3)',[digest(code),owner,Date.now()+600000]);});
 return {url:'https://t.me/'+me.username+'?start='+code,expiresAt:Date.now()+600000};
}
/** Remove the owner's chat link and associated pending linking state. */
export async function disconnectTelegram(db:Database,owner:string){await db.transaction(async q=>{await q.query('DELETE FROM telegram_links WHERE owner=$1',[owner]);await q.query('DELETE FROM telegram_pairings WHERE owner=$1',[owner]);await q.query("UPDATE notification_outbox SET status='CANCELLED' WHERE owner=$1 AND status='PENDING'",[owner]);});}
/** Consume bot updates and associate valid linking codes with their owners. */
export async function pollTelegram(db:Database){
 if(!await telegramToken())return;
 const previous=(await db.query<{value:string}>("SELECT value FROM integration_cursors WHERE name='telegram'" )).rows[0];
 const updates=await telegramCall('getUpdates',{offset:Number(previous?.value??0),timeout:0,limit:100,allowed_updates:['message']});
 for(const update of updates){
  const m=update.message,match=typeof m?.text==='string'?/^\/start(?:@\w+)? ([\w-]{32})$/.exec(m.text):null;
  await db.transaction(async q=>{
   if(match&&m.chat?.type==='private'&&m.from?.id===m.chat.id){
    const pair=(await q.query<{owner:string}>('DELETE FROM telegram_pairings WHERE digest=$1 AND expires_at>$2 RETURNING owner',[digest(match[1]),Date.now()])).rows[0];
    if(pair){await q.query("UPDATE notification_outbox SET status='CANCELLED' WHERE owner=$1 AND status='PENDING'",[pair.owner]);await q.query('INSERT INTO telegram_links(owner,chat_id,chat_label,linked_at) VALUES($1,$2,$3,$4) ON CONFLICT(owner) DO UPDATE SET chat_id=excluded.chat_id,chat_label=excluded.chat_label,linked_at=excluded.linked_at',[pair.owner,String(m.chat.id),String(m.chat.username?'@'+m.chat.username:m.chat.first_name??'Private chat').slice(0,100),Date.now()]);}
   }
   await q.query("INSERT INTO integration_cursors VALUES('telegram',$1) ON CONFLICT(name) DO UPDATE SET value=excluded.value",[String(update.update_id+1)]);
  });
 }
}
/** Insert a deduplicated notification into the durable owner outbox. */
export async function enqueueNotification(db:Sql,owner:string,id:string,category:string,message:string){await db.query("INSERT INTO notification_outbox(id,owner,category,message,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",[owner+':'+id,owner,category,message.slice(0,3500),Date.now()]);}
/** Translate eligible crew events into preference-aware outbound messages. */
export async function collectNotifications(db:Database){
 const links=(await db.query<any>('SELECT * FROM telegram_links WHERE chat_id IS NOT NULL')).rows;
 for(const link of links){
  const crews=(await db.query<any>('SELECT * FROM crews WHERE owner=$1',[link.owner])).rows;
  for(const c of crews){
   const prefix='HyperHive · '+c.policy.name+'\n\n';
   if(link.preferences.fills){const rows=(await db.query<any>("SELECT tid,body FROM fills f WHERE crew_id=$1 AND created_at>$2 AND NOT EXISTS(SELECT 1 FROM notification_outbox o WHERE o.id=$3||':fill:'||f.crew_id||':'||f.tid) ORDER BY created_at LIMIT 200",[c.id,link.linked_at,link.owner])).rows;for(const f of rows)await enqueueNotification(db,link.owner,'fill:'+c.id+':'+f.tid,'fills',prefix+f.body.coin+' '+(f.body.side==='B'?'buy':'sell')+' '+f.body.sz+' @ '+f.body.px);}
   if(link.preferences.brackets){const rows=(await db.query<any>("SELECT digest,body FROM slips s WHERE crew_id=$1 AND created_at>$2 AND body->>'kind' IN ('BRACKET','TRAIL','SL','TP') AND NOT EXISTS(SELECT 1 FROM notification_outbox o WHERE o.id=$3||':bracket:'||s.digest) ORDER BY seq LIMIT 200",[c.id,link.linked_at,link.owner])).rows;for(const s of rows)await enqueueNotification(db,link.owner,'bracket:'+s.digest,'brackets',prefix+s.body.kind+' · '+(s.body.order?.market??'')+' · '+(s.body.order?.t?.trigger?.triggerPx??'protective order updated'));}
   if(link.preferences.standDown){const rows=(await db.query<any>("SELECT nonce,action FROM controls c WHERE crew_id=$1 AND created_at>$2 AND action IN ('pause','close') AND NOT EXISTS(SELECT 1 FROM notification_outbox o WHERE o.id=$3||':control:'||c.nonce) ORDER BY created_at LIMIT 100",[c.id,link.linked_at,link.owner])).rows;for(const r of rows)await enqueueNotification(db,link.owner,'control:'+r.nonce,'standDown',prefix+(r.action==='pause'?'New entries paused. Existing exposure may remain.':'Close instruction queued. Check remaining exposure in the app.'));}
   if(link.preferences.broken&&c.broken_since)await enqueueNotification(db,link.owner,'broken:'+c.id+':'+c.broken_since,'broken',prefix+'Unmatched execution detected. Review the public trade record.');
   if(link.preferences.expiry&&c.policy.expiresAt-Date.now()<7*86400000)await enqueueNotification(db,link.owner,'expiry:'+c.id+':'+c.policy.generation,'expiry',prefix+'Agent approval '+(c.policy.expiresAt<Date.now()?'expired':'expires '+new Date(c.policy.expiresAt).toISOString().slice(0,10))+'. Review access in the app.');
  }
 }
}
/** Deliver pending messages and record retry or completion state. */
export async function deliverNotifications(db:Database){
 const rows=(await db.query<any>("SELECT o.*,l.chat_id,l.preferences FROM notification_outbox o JOIN telegram_links l ON o.owner=l.owner WHERE o.status='PENDING' AND o.next_at<$1 ORDER BY o.created_at LIMIT 20",[Date.now()])).rows;
 for(const row of rows){
  if(row.category!=='test'&&!row.preferences[row.category]){await db.query("UPDATE notification_outbox SET status='CANCELLED' WHERE id=$1",[row.id]);continue;}
  try{await telegramCall('sendMessage',{chat_id:row.chat_id,text:row.message,link_preview_options:{is_disabled:true}});await db.query("UPDATE notification_outbox SET status='SENT',sent_at=$2,last_error=NULL WHERE id=$1",[row.id,Date.now()]);}
  catch(e){await db.query('UPDATE notification_outbox SET attempts=attempts+1,next_at=$2,last_error=$3 WHERE id=$1',[row.id,Date.now()+Math.min(3600000,30000*2**Math.min(row.attempts,7)),(e as Error).message]);}
 }
}
/** Poll links, collect and deliver notifications, then publish the service heartbeat. */
export async function telegramTick(db:Database){await pollTelegram(db);await collectNotifications(db);await deliverNotifications(db);await heartbeat(db,'notifications',{configured:Boolean(await telegramToken())});}
