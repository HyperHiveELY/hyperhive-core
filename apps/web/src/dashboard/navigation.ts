export const primaryDestinations=['overview','trading','exits','activity','wallet','setup'] as const;
export function canonicalView(path:string|undefined){
 const aliases:Record<string,string>={home:'overview',bots:'overview',plans:'tokens',settings:'setup',policy:'overview'};
 const view=aliases[path??'']??path;
 return view&&['overview','trading','exits','activity','wallet','setup','models','crew','cards','records','tokens','integrations','network','auditor','deployment','access','hosted','checkout'].includes(view)?view:'overview';
}
export function destinationGroup(view:string){
 if(['overview','bots','crew','policy'].includes(view))return 'overview';
 if(['activity','cards','records'].includes(view))return 'activity';
 if(['wallet','tokens','plans'].includes(view))return 'wallet';
 return view==='exits'?'exits':view==='trading'?'trading':'setup';
}

export function exitSelection(search:string){const raw=new URLSearchParams(search).get('exits');if(raw===null)return null;return /^[A-Za-z0-9]{1,15}(,[A-Za-z0-9]{1,15}){0,29}$/.test(raw)&&raw.toLowerCase()!=='all'?raw.toUpperCase():'all';}
