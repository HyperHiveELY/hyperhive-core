import {config} from './config.js';
import type {Sql} from './db.js';
import {integrationSettings} from './integration-settings.js';
/** Check the wallet's current acknowledgment and any configured regional exclusions. */
export async function accessStatus(db:Sql,owner:string){
 const settings=await integrationSettings();
 const {rows:[accepted]}=await db.query<{version:string;country:string;accepted_at:number;terms_text:string|null;terms_url:string|null}>(
   'SELECT a.version,a.country,a.accepted_at,h.terms_text,h.terms_url FROM access_acceptances a LEFT JOIN access_terms_history h USING(owner,version) WHERE a.owner=$1',[owner]);
 const requiresCountry=settings.eligibilityEnabled && settings.blockedCountries.length>0;
 const current=accepted?.version===settings.termsVersion && !!accepted &&
   (accepted.terms_text==null || (accepted.terms_text===settings.termsText && accepted.terms_url===(settings.termsUrl??null)));
 const regionAllowed=!requiresCountry || (!!accepted?.country && !settings.blockedCountries.includes(accepted.country));
 return {enabled:settings.eligibilityEnabled,requiresCountry,termsUrl:settings.termsUrl,termsText:settings.termsText,version:settings.termsVersion,accepted:accepted??null,
   eligible:(!settings.eligibilityEnabled&&config.NODE_ENV!=='production') || (settings.eligibilityEnabled&&current&&regionAllowed)};
}
/** Reject gated operations until the owner meets the deployment's eligibility requirements. */
export async function requireAccess(db:Sql,owner:string){if(!(await accessStatus(db,owner)).eligible)throw Object.assign(Error('Review the current terms in Settings → Access before creating or starting a crew'),{statusCode:403});}
