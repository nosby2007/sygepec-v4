import crypto from 'node:crypto';
import { getFirebaseSession } from '@/lib/auth';
import { queryCollection, setDocument, TAX_TENANT } from '@/lib/firebase';
import { BUSINESS_CATEGORIES, parseAmount } from '@/lib/business';
import { cleanText, mutationGuard, privateHeaders } from '@/lib/security';

export async function GET(req) {
 const session=await getFirebaseSession();
 if(!session || session.role!=='CLIENT') return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const year=Number(new URL(req.url).searchParams.get('year'));
 if(!Number.isInteger(year)||year<2020||year>2100) return Response.json({error:'Invalid year'},{status:400,headers:privateHeaders});
 const entries=await queryCollection('taxBusinessEntries',session.idToken,{filters:[['clientId','EQUAL',session.uid],['taxYear','EQUAL',year],['tenantId','EQUAL',TAX_TENANT]],limit:1000});
 return Response.json({entries:entries.map(({id,kind,category,amountCents,date,description,createdAt})=>({id,kind,category,amountCents,date,description,createdAt}))},{headers:privateHeaders});
}
export async function POST(req) {
 const blocked=mutationGuard(req);if(blocked)return blocked;
 const session=await getFirebaseSession();
 if(!session||session.role!=='CLIENT') return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const body=await req.json().catch(()=>({}));
 const kind=body.kind, category=cleanText(body.category,60), amountCents=parseAmount(body.amount);
 const date=String(body.date||'');
 const year=Number(date.slice(0,4));
 if(!BUSINESS_CATEGORIES[kind]?.includes(category)||!amountCents||!/^(20\d\d)-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date))
  return Response.json({error:'Invalid transaction'},{status:400,headers:privateHeaders});
 const parsed=new Date(date+'T12:00:00Z');
 if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||year>new Date().getUTCFullYear()+1)
  return Response.json({error:'Invalid date'},{status:400,headers:privateHeaders});
 const id=crypto.randomUUID();
 await setDocument('taxBusinessEntries/'+id,{tenantId:TAX_TENANT,clientId:session.uid,taxYear:year,kind,category,amountCents,date,description:cleanText(body.description,300),createdAt:new Date().toISOString()},session.idToken,{createOnly:true});
 return Response.json({ok:true,id},{status:201,headers:privateHeaders});
}
