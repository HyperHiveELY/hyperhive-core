export const primaryDestinations=['overview','trading','activity','wallet','setup'] as const;
export function canonicalView(path:string|undefined){
 const aliases:Record<string,string>={home:'overview',bots:'overview',plans:'tokens',settings:'setup',policy:'overview'};
 const view=aliases[path??'']??path;
 return view&&['overview','trading','activity','wallet','setup','crew','cards','records','tokens','integrations','network','auditor','deployment','access','hosted','checkout'].includes(view)?view:'overview';
}
export function destinationGroup(view:string){
 if(['overview','bots','crew','policy'].includes(view))return 'overview';
 if(['activity','cards','records'].includes(view))return 'activity';
 if(['wallet','tokens','plans'].includes(view))return 'wallet';
 return view==='trading'?'trading':'setup';
}
