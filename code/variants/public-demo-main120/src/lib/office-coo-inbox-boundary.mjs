// Dedicated agency account identifiers, not credentials or owner-recipient data.
// Keep COO conversations outside the generic client inbox before normalisation.
export const officeCooZernioIdentity=Object.freeze({profileId:'6ad0a1605c9b88c22d6061d2',accountId:'6ad0a6b5a09618fd6392391c'});
const record=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
function id(x){if(typeof x==='string')return x;const r=record(x);return typeof r._id==='string'?r._id:typeof r.id==='string'?r.id:typeof r.$oid==='string'?r.$oid:'';}
export function clientInboxConversationAllowed(value){
 const r=record(value),account=record(r.account),profile=record(r.profile);
 const accounts=[id(r.accountId),id(r.account),id(account.accountId)].filter(Boolean),profiles=[id(r.profileId),id(profile),id(account.profileId)].filter(Boolean);
 if(accounts.includes(officeCooZernioIdentity.accountId)||profiles.includes(officeCooZernioIdentity.profileId))return false;
 // Unknown attribution cannot establish that private COO content is unrelated.
 return accounts.length>0;
}
