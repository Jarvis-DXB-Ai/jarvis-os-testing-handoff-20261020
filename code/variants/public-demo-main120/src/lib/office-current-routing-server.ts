import 'server-only';
import {knowledgeCatalog} from '../../scripts/lib/office-foundations.mjs';
import {clientIntake,clientOfficeContext} from './office-client-intake-server';
import {clientPilot} from './office-client-pilot-server';
import plan from './office-stack-plan.json';

/** Historical foundations remain immutable evidence. New COO requests resolve
 * through each client's current verified allocation and actual client name. */
export async function officeCurrentRoutingFoundations(){
 const catalog=await knowledgeCatalog(plan.storage);
 const ids=[...new Set(catalog.foundations.flatMap(f=>f.scope.clientId?[f.scope.clientId]:[]))];
 const bindings=await Promise.all(ids.map(async id=>{
  let name:string|null=null;
  try{
   const intake=await clientIntake(id);
   name=intake.name;
   const current=intake.status==='ready'?await clientOfficeContext(id):await clientPilot(id);
   return {id,name:intake.name,foundationId:current.foundationId};
  }catch{return {id,name,foundationId:null};}
 }));
 return catalog.foundations.flatMap(f=>{
  if(!f.scope.clientId)return [f];
  const current=bindings.find(b=>b?.id===f.scope.clientId);
  if(!current?.foundationId)return [{...f,id:'unavailable-'+f.id,title:current?.name?current.name+' · unavailable Office allocation':f.title,scope:{...f.scope,clientId:null}}];
  return current.foundationId===f.id?[{...f,title:current.name+' · current Office allocation'}]:[];
 });
}
