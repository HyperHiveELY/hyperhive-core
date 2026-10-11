import {config} from './config.js';
import type {Sql} from './db.js';
import {integrationSettings} from './integration-settings.js';
/** Compare the owner's current terms acceptance and country with the deployment policy. */
export async function accessStatus(db:Sql,owner:string){const settings=await integrationSettings(),accepted=(await db.query<any>('SELECT version,country,accepted_at FROM access_acceptances WHERE owner=$1',[owner])).rows[0]??null;return {enabled:settings.eligibilityEnabled,termsUrl:settings.termsUrl,termsText:settings.termsText,version:settings.termsVersion,accepted,eligible:(!settings.eligibilityEnabled&&config.NODE_ENV!=='production')||Boolean(settings.eligibilityEnabled&&accepted&&accepted.version===settings.termsVersion&&!settings.blockedCountries.includes(accepted.country))};}
/** Reject gated operations until the owner meets the deployment's eligibility requirements. */
export async function requireAccess(db:Sql,owner:string){if(!(await accessStatus(db,owner)).eligible)throw Object.assign(Error('Review the current terms and country eligibility in Settings → Access before creating or starting a crew'),{statusCode:403});}
