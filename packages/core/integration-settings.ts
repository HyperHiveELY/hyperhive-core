import {countryCodes} from './countries.js';
import {z} from 'zod';
import {secrets,saveIntegrationSecrets} from './secrets.js';
import {config} from './config.js';
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(s=>s.toLowerCase());
const https=z.string().url().refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;},'Use an HTTPS URL without embedded credentials');
export const IntegrationSettings=z.strictObject({
 tokenPayTo:address.refine(s=>s!=='0x'+'0'.repeat(40),'Use a receiving wallet').optional(),aiMarkupBps:z.number().int().min(0).max(10000).default(2500),
 token:address.optional(),auditor:address.optional(),roots:address.optional(),billing:address.optional(),governance:address.optional(),registry:address.optional(),usdc:address.optional(),
 tokenThreshold:z.string().regex(/^\d+(\.\d{1,18})?$/).refine(s=>Number(s)>0).default('10000'),
 x402PayTo:address.optional(),x402Facilitator:https.optional(),
 termsUrl:https.optional(),termsText:z.string().max(24000).default(''),termsVersion:z.string().min(1).max(80).optional(),blockedCountries:z.array(z.string().refine(s=>countryCodes.includes(s),'Invalid country code')).default([]),eligibilityEnabled:z.boolean().default(false),
 measurement:z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),hostedOrigin:https.refine(s=>s===new URL(s).origin,'Use the origin without a path or trailing slash').optional(),imageDigest:z.string().regex(/^[\w./:-]+@sha256:[a-f0-9]{64}$/).optional(),
});
export type IntegrationSettings=z.infer<typeof IntegrationSettings>;
/** Validate persisted public integration settings and apply deployment-managed overrides. */
export async function integrationSettings():Promise<IntegrationSettings>{
 const stored=await secrets();const saved=IntegrationSettings.parse(JSON.parse(process.env.INTEGRATION_SETTINGS??stored.INTEGRATION_SETTINGS??'{}'));
 return IntegrationSettings.parse({...saved,...Object.fromEntries(Object.entries({measurement:config.MEASUREMENT_HASH,token:process.env.HHIV_CONTRACT,auditor:process.env.AUDITOR_CONTRACT,roots:config.ROOT_CONTRACT,billing:config.BILLING_CONTRACT,tokenThreshold:process.env.HHIV_BENEFIT_THRESHOLD,x402PayTo:process.env.X402_PAY_TO,x402Facilitator:process.env.X402_FACILITATOR_URL}).filter(([,v])=>v))});
}
/** Validate operator settings and prevent changes to environment-managed fields or published terms in place. */
export async function saveIntegrationSettings(value:unknown){const parsed=IntegrationSettings.parse(value);if(process.env.INTEGRATION_SETTINGS)throw Error('Integration settings are managed by the deployment environment');for(const [field,value] of Object.entries({token:process.env.HHIV_CONTRACT,auditor:process.env.AUDITOR_CONTRACT,roots:config.ROOT_CONTRACT,billing:config.BILLING_CONTRACT,measurement:config.MEASUREMENT_HASH,tokenThreshold:process.env.HHIV_BENEFIT_THRESHOLD,x402PayTo:process.env.X402_PAY_TO,x402Facilitator:process.env.X402_FACILITATOR_URL})){if(value&&String((parsed as any)[field]??'').toLowerCase()!==value.toLowerCase())throw Error(field+' is managed by the deployment environment');}if(parsed.eligibilityEnabled&&(!(parsed.termsUrl||parsed.termsText.trim())||!parsed.termsVersion))throw Error('Set the published terms URL and version before enabling eligibility');const previous=await integrationSettings();if(previous.eligibilityEnabled&&parsed.eligibilityEnabled&&previous.termsVersion===parsed.termsVersion&&(previous.termsText!==parsed.termsText||previous.termsUrl!==parsed.termsUrl))throw Error('Use a new terms version when published terms change');await saveIntegrationSecrets({INTEGRATION_SETTINGS:JSON.stringify(parsed)});return parsed;}
/** Resolve the notification bot credential from the environment or private operator storage. */
export async function telegramToken(){return process.env.TELEGRAM_BOT_TOKEN||(await secrets()).TELEGRAM_BOT_TOKEN;}
/** Resolve private facilitator authentication for the configured x402 service. */
export async function facilitatorToken(){return process.env.X402_FACILITATOR_TOKEN||(await secrets()).X402_FACILITATOR_TOKEN;}
