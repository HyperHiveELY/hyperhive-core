export type ReadinessCheck={id:string;label:string;ok:boolean};
export function nextCrewStep(checks:ReadinessCheck[]){
 if(!checks.length)return 'service';
 const ok=(id:string)=>checks.find(c=>c.id===id)?.ok===true;
 if(!ok('access'))return 'access';
 if(['ai','worker','signer','metering'].some(id=>!ok(id)))return 'service';
 if(!ok('funded'))return 'fund';
 if(!ok('cap'))return 'limits';
 if(!ok('margin'))return 'margin';
 if(!ok('policy')||!ok('journal')||!ok('record'))return 'account';
 if(!ok('tokens'))return 'tokens';
 if(!ok('identity'))return 'service';
 if(!ok('agent'))return 'approve';
 if(!checks.length||checks.some(c=>!c.ok))return 'service';
 return 'start';
}
