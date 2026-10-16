import type {config as configuration} from './config.js';
/** Enforce authenticated database TLS, a stable HTTPS origin and protected signing in production. */
export function assertProductionConfig(c:typeof configuration){
 if(c.NODE_ENV!=='production')return;
 const origin=new URL(c.PUBLIC_ORIGIN);
 if(origin.protocol!=='https:'||origin.origin!==c.PUBLIC_ORIGIN||origin.username||origin.password)throw Error('Production requires a stable HTTPS PUBLIC_ORIGIN without a path');
 if(c.SIGNER_MODE!=='phala')throw Error('Production requires the protected signer');
 if(!c.DATABASE_URL)throw Error('Production requires persistent Postgres');
 const db=new URL(c.DATABASE_URL);
 if(!['postgres:','postgresql:'].includes(db.protocol)||db.searchParams.get('sslmode')!=='verify-full')throw Error('Production Postgres must use sslmode=verify-full');
}
