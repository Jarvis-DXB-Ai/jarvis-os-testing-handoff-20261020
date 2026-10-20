/** Pure outgoing-origin checks. config/pin/receipt must be server-owned, never HTTP fields.
 * The provider phone node ID is an opaque exact identifier, not an E164 phone.
 * Current integration deliberately permits only numeric16–32digit pins; the API
 * schema itself promises merely string IDs. No global Meta-format claim is made.
 */
const fail=()=>{throw Error('Dedicated outgoing sender provenance is unverified.');};
const pinPattern=/^[1-9][0-9]{15,31}$/;
const international=/^\+?[1-9][0-9]{6,14}$/;
const profile=x=>typeof x==='string'?x:x?._id;
const compact=x=>typeof x==='string'?x.replace(/[+ ()-]/g,''):'';
function scope(config){const b=config?.binding;if(!b||typeof b.accountId!=='string'||!b.accountId.length||b.accountId.length>200||/[\x00-\x1f\x7f]/.test(b.accountId)||!international.test(b.senderPhone??''))fail();if(config.providerPhoneNumberId!==undefined&&(typeof config.providerPhoneNumberId!=='string'||!pinPattern.test(config.providerPhoneNumberId)))fail();return b;}
export function officeCooOutgoingSenderMatches(config,senderId){
 const b=scope(config);if(typeof senderId!=='string')return false;
 if(senderId===b.accountId)return true;
 if(config.providerPhoneNumberId!==undefined&&senderId===config.providerPhoneNumberId)return true;
 return international.test(senderId)&&compact(senderId)===compact(b.senderPhone);
}
/** Derive a pin ONLY after the caller verifies this exact frozen receipt's byte hash.
 * This checks linkage; it does not authenticate or approve an arbitrary JSON receipt.
 */
export function officeCooProviderPhoneNumberIdFromConnection(config,receipt){
 const b=scope(config),m=receipt?.agencyMetadata,rows=receipt?.newAccounts;
 if(receipt?.httpStatus!==200||receipt.expectedProfileId!==b.profileId||compact(receipt.expectedNumber)!==compact(b.senderPhone)||!Array.isArray(rows)||rows.length!==1||rows[0].id!==b.accountId||rows[0].platform!=='whatsapp'||rows[0].profileId!==b.profileId||rows[0].isActive!==true||compact(rows[0].username)!==compact(b.senderPhone)||compact(m?.displayPhoneNumber)!==compact(b.senderPhone)||typeof m?.phoneNumberId!=='string'||!pinPattern.test(m.phoneNumberId))fail();
 const owned=receipt.ownedAgencyNumbers;if(!Array.isArray(owned)||owned.length!==1)fail();const n=owned[0];if(profile(n.profileId)!==b.profileId||compact(n.phoneNumber??n.number)!==compact(b.senderPhone)||n.whatsappAccountId!=null&&n.whatsappAccountId!==b.accountId||n.whatsappPhoneNumberId!=null&&n.whatsappPhoneNumberId!==m.phoneNumberId||n.wabaId!=null&&n.wabaId!==m.wabaId)fail();
 if(config.providerPhoneNumberId!==undefined&&config.providerPhoneNumberId!==m.phoneNumberId)fail();return m.phoneNumberId;
}
