import { Pool, type PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { mkdir } from 'node:fs/promises';
export interface Sql {query<T=Record<string,unknown>>(sql:string,args?:unknown[]):Promise<{rows:T[]}>}
export class Database implements Sql {
  private pool?:Pool; private embedded?:PGlite; private queue=Promise.resolve();
  /** Select the PostgreSQL connection or embedded store. Call init before querying. */
  constructor(readonly url=process.env.DATABASE_URL) {if(url&&url!=='memory')this.pool=new Pool({connectionString:url,max:10});}
  /** Open the selected storage engine and apply the idempotent application schema. */
  async init(){if(!this.pool){if(this.url==='memory')this.embedded=new PGlite();else{await mkdir('.data',{recursive:true});this.embedded=new PGlite('.data/hyperhive');}} await this.query(schema);return this;}
  /** Execute parameterized SQL against the selected engine and return rows. */
  async query<T=Record<string,unknown>>(sql:string,args:unknown[]=[]):Promise<{rows:T[]}>{
    if(this.pool){const result=await this.pool.query(sql,args);return {rows:result.rows as T[]};}
    if(!this.embedded)throw Error('Database not initialized');
    if(!args.length && sql.includes('CREATE TABLE')){await this.embedded.exec(sql);return {rows:[]};}
    return this.embedded.query<T>(sql,args);
  }
  /** Execute work atomically, rolling back on errors and serializing embedded transactions. */
  async transaction<T>(fn:(db:Sql)=>Promise<T>):Promise<T>{
    if(this.pool){const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
    let release!:()=>void;const previous=this.queue;this.queue=new Promise<void>(r=>release=r);await previous;
    try{return await this.embedded!.transaction(tx=>fn(tx as Sql));}finally{release();}
  }
  /** Acquire a PostgreSQL session advisory lock. Release the returned handle when finished. */
  async lock(name:string):Promise<(()=>Promise<void>)|null>{
    if(!this.pool)throw Error('Persistent workers require Postgres DATABASE_URL');
    const c:PoolClient=await this.pool.connect();
    try{
      const r=await c.query('SELECT pg_try_advisory_lock(hashtext($1)) ok',[name]);
      if(!r.rows[0].ok){c.release();return null;}
    }catch(error){c.release(true);throw error;}
    return async()=>{
      try{await c.query('SELECT pg_advisory_unlock(hashtext($1))',[name]);}
      catch(error){c.release(true);throw error;}
      c.release();
    };
  }
  /** Release PostgreSQL connections and close the embedded store if one was opened. */
  async close(){await this.pool?.end();await this.embedded?.close();}
}
const schema=`
CREATE TABLE IF NOT EXISTS ai_billing_exemptions(owner text PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,updated_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS token_accounts(owner text PRIMARY KEY,available bigint NOT NULL DEFAULT 0 CHECK(available>=0),reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0));
CREATE TABLE IF NOT EXISTS token_invoices(id text PRIMARY KEY,owner text NOT NULL,amount text NOT NULL,pay_to text NOT NULL,units bigint NOT NULL CHECK(units>0),nonce double precision NOT NULL,status text NOT NULL DEFAULT 'OPEN',tx text UNIQUE,created_at double precision NOT NULL,expires_at double precision NOT NULL);
ALTER TABLE token_invoices ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'hypercore';
CREATE INDEX IF NOT EXISTS token_invoices_owner ON token_invoices(owner,created_at);
CREATE TABLE IF NOT EXISTS token_usage(id text PRIMARY KEY,owner text NOT NULL,crew_id text NOT NULL,model text NOT NULL,reserved bigint NOT NULL,charged bigint NOT NULL DEFAULT 0,markup_bps integer NOT NULL,status text NOT NULL DEFAULT 'RESERVED',cost_usd numeric,cost_basis text,created_at double precision NOT NULL,finished_at double precision);
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS cost_ceiling_usd numeric;
CREATE INDEX IF NOT EXISTS token_usage_owner ON token_usage(owner,created_at);
CREATE TABLE IF NOT EXISTS ai_metering_alerts(id text PRIMARY KEY,reason text NOT NULL,created_at double precision NOT NULL,resolved_at double precision);
CREATE TABLE IF NOT EXISTS crews(id text PRIMARY KEY,owner text NOT NULL,account text UNIQUE NOT NULL,policy jsonb NOT NULL,signature text NOT NULL,paused boolean NOT NULL DEFAULT true,created_at double precision NOT NULL,paid_until double precision NOT NULL DEFAULT 0,broken_since double precision);
CREATE TABLE IF NOT EXISTS paper_accounts(crew_id text PRIMARY KEY REFERENCES crews(id),body jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS paper_events(id bigserial PRIMARY KEY,crew_id text NOT NULL REFERENCES crews(id),kind text NOT NULL,body jsonb NOT NULL,created_at double precision NOT NULL);
CREATE INDEX IF NOT EXISTS paper_events_crew ON paper_events(crew_id,created_at);
CREATE TABLE IF NOT EXISTS identities(crew_id text PRIMARY KEY REFERENCES crews(id),agent text NOT NULL,signer text NOT NULL,quote jsonb NOT NULL,generation integer NOT NULL,measurement text NOT NULL,updated_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS auth_nonces(nonce text PRIMARY KEY,owner text NOT NULL,expires_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token text PRIMARY KEY,owner text NOT NULL,expires_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS controls(nonce text PRIMARY KEY,crew_id text NOT NULL,action text NOT NULL,signature text NOT NULL,created_at double precision NOT NULL,handled boolean NOT NULL DEFAULT false);
ALTER TABLE controls ADD COLUMN IF NOT EXISTS policy_hash text NOT NULL DEFAULT '';
ALTER TABLE controls ADD COLUMN IF NOT EXISTS issued_at double precision NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS cards(id text PRIMARY KEY,crew_id text NOT NULL REFERENCES crews(id),body jsonb NOT NULL,lens text NOT NULL,evidence jsonb NOT NULL,verdict jsonb NOT NULL,status text NOT NULL,reason text,created_at double precision NOT NULL,updated_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS slips(digest text PRIMARY KEY,crew_id text NOT NULL REFERENCES crews(id),seq integer NOT NULL,previous text NOT NULL,body jsonb NOT NULL,signature text NOT NULL,signer text NOT NULL,cloid text UNIQUE NOT NULL,ack jsonb,created_at double precision NOT NULL,UNIQUE(crew_id,seq));
CREATE TABLE IF NOT EXISTS positions(crew_id text NOT NULL,market text NOT NULL,body jsonb NOT NULL,PRIMARY KEY(crew_id,market));
CREATE TABLE IF NOT EXISTS fills(crew_id text NOT NULL,tid text NOT NULL,body jsonb NOT NULL,status text NOT NULL,digest text,created_at double precision NOT NULL,PRIMARY KEY(crew_id,tid));
CREATE TABLE IF NOT EXISTS budgets(id text PRIMARY KEY,crew_id text NOT NULL,day text NOT NULL,reserved numeric NOT NULL,actual numeric,created_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS scout_runs(crew_id text NOT NULL,lens text NOT NULL,market text NOT NULL,next_at double precision NOT NULL,PRIMARY KEY(crew_id,lens,market));
CREATE TABLE IF NOT EXISTS events(id bigserial PRIMARY KEY,crew_id text,kind text NOT NULL,message text NOT NULL,created_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS heartbeats(role text PRIMARY KEY,updated_at double precision NOT NULL,details jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS payments(tx text PRIMARY KEY,crew_id text NOT NULL,months integer NOT NULL,created_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS roots(hour bigint PRIMARY KEY,root text NOT NULL,count integer NOT NULL,tx text,status text NOT NULL DEFAULT 'PENDING');
CREATE TABLE IF NOT EXISTS telegram_links(owner text PRIMARY KEY,chat_id text,chat_label text,linked_at double precision NOT NULL DEFAULT 0,preferences jsonb NOT NULL DEFAULT '{"fills":true,"brackets":true,"standDown":true,"broken":true,"expiry":true}');
CREATE TABLE IF NOT EXISTS telegram_pairings(digest text PRIMARY KEY,owner text NOT NULL,expires_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS integration_cursors(name text PRIMARY KEY,value text NOT NULL);
CREATE TABLE IF NOT EXISTS notification_outbox(id text PRIMARY KEY,owner text NOT NULL,category text NOT NULL,message text NOT NULL,status text NOT NULL DEFAULT 'PENDING',attempts integer NOT NULL DEFAULT 0,next_at double precision NOT NULL DEFAULT 0,last_error text,sent_at double precision,created_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS access_acceptances(owner text PRIMARY KEY,version text NOT NULL,country text NOT NULL,accepted_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS benefit_assignments(owner text PRIMARY KEY,crew_id text UNIQUE NOT NULL REFERENCES crews(id),updated_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS paid_entitlements(key text PRIMARY KEY,owner text NOT NULL,plan text NOT NULL,expires_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS verification_payments(payment_hash text PRIMARY KEY,crew_id text NOT NULL,payment_payload jsonb NOT NULL,status text NOT NULL DEFAULT 'OPEN',tx text UNIQUE,created_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS x402_invoices(id text PRIMARY KEY,owner text NOT NULL,crew_id text NOT NULL,plan text NOT NULL,amount text NOT NULL,pay_to text NOT NULL,status text NOT NULL DEFAULT 'OPEN',requirements jsonb,payment_payload jsonb,tx text UNIQUE,created_at double precision NOT NULL,expires_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS metric_state(crew_id text PRIMARY KEY,funding_through double precision NOT NULL,updated_at double precision NOT NULL);
CREATE TABLE IF NOT EXISTS execution_steps(card_id text NOT NULL,step text NOT NULL,started_at double precision NOT NULL,finished_at double precision NOT NULL,PRIMARY KEY(card_id,step));
CREATE TABLE IF NOT EXISTS funding(crew_id text NOT NULL,event_hash text NOT NULL,body jsonb NOT NULL,created_at double precision NOT NULL,PRIMARY KEY(crew_id,event_hash));
CREATE TABLE IF NOT EXISTS account_history(crew_id text NOT NULL,time double precision NOT NULL,equity numeric NOT NULL,cumulative_pnl numeric NOT NULL,PRIMARY KEY(crew_id,time));
CREATE INDEX IF NOT EXISTS cards_status ON cards(status,created_at);
CREATE INDEX IF NOT EXISTS slips_crew ON slips(crew_id,created_at);
CREATE INDEX IF NOT EXISTS fills_crew_time ON fills(crew_id,created_at);
CREATE INDEX IF NOT EXISTS budgets_day ON budgets(crew_id,day);
`;
/** Append a bounded operator event message, optionally scoped to a single crew. */
export async function event(db:Sql,crew:string|null,kind:string,message:string){await db.query('INSERT INTO events(crew_id,kind,message,created_at) VALUES($1,$2,$3,$4)',[crew,kind,message.slice(0,400),Date.now()]);}
/** Upsert the service's last-seen timestamp and its current readiness details. */
export async function heartbeat(db:Sql,role:string,details:unknown){await db.query('INSERT INTO heartbeats VALUES($1,$2,$3) ON CONFLICT(role) DO UPDATE SET updated_at=excluded.updated_at,details=excluded.details',[role,Date.now(),JSON.stringify(details)]);}
