// The exchange allows 16 characters, excluding the optional expiry suffix.
// Each crew has a separate master account; this stable name is also used for revocation.
/** Derive the stable Hyperliquid agent name used for approval and later revocation. */
export function agentName(crewId:string){return `hh-${crewId.replaceAll('-','').slice(0,13)}`;}
