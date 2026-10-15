import {config} from './config.js';
const loopback=(host:string)=>['localhost','127.0.0.1','::1','[::1]'].includes(host);
/** Require loopback-only application and database configuration for filesystem-backed signing. */
export function assertLocalConfig(c:Pick<typeof config,'SIGNER_MODE'|'HOST'|'PUBLIC_ORIGIN'|'DATABASE_URL'|'NODE_ENV'>=config){
 if(c.SIGNER_MODE!=='local')throw Error('Local signing mode is not enabled');
 if(c.NODE_ENV==='production'||!loopback(c.HOST)||!loopback(new URL(c.PUBLIC_ORIGIN).hostname))throw Error('Local signing requires a loopback-only development server');
 if(!c.DATABASE_URL||!loopback(new URL(c.DATABASE_URL).hostname))throw Error('Local signing requires Postgres on this computer');
}
/** Validate local mode when selected and report whether the service uses local keys. */
export function localMode(){if(config.SIGNER_MODE!=='local')return false;assertLocalConfig();return true;}
