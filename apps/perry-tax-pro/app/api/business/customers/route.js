import crypto from 'node:crypto';
import {getFirebaseSession} from '@/lib/auth';
import {queryCollection,setDocument,TAX_TENANT} from '@/lib/firebase';
import {cleanEmail,cleanText,mutationGuard,privateHeaders} from '@/lib/security';
export async function GET(){
 const s=await getFirebaseSession();
 if(!s||s.role!=='CLIENT')return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const rows=await queryCollection('taxBusinessCustomers',s.idToken,{filters:[['ownerUid','EQUAL',s.uid],['tenantId','EQUAL',TAX_TENANT]],limit:500});
 return Response.json({customers:rows.map(({id,name,phone,email,notes,createdAt})=>({id,name,phone,email,notes,createdAt}))},{headers:privateHeaders});
}
export async function POST(req){
 const blocked=mutationGuard(req);if(blocked)return blocked;
 const s=await getFirebaseSession();
 if(!s||s.role!=='CLIENT')return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const b=await req.json().catch(()=>({}));
 const name=cleanText(b.name,100);
 const email=b.email?cleanEmail(b.email):'';
 if(!name)return Response.json({error:'Customer name required'},{status:400,headers:privateHeaders});
 if(b.email&&!email)return Response.json({error:'Valid customer email required'},{status:400,headers:privateHeaders});
 const id=crypto.randomUUID();
 try{
  await setDocument('taxBusinessCustomers/'+id,{tenantId:TAX_TENANT,ownerUid:s.uid,name,phone:cleanText(b.phone,30),email,notes:cleanText(b.notes,500),createdAt:new Date().toISOString()},s.idToken,{createOnly:true});
  return Response.json({ok:true,id},{status:201,headers:privateHeaders});
 }catch{return Response.json({error:'Customer could not be saved'},{status:503,headers:privateHeaders});}
}
