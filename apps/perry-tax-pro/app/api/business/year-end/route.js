import crypto from 'node:crypto';
import {getFirebaseSession} from '@/lib/auth';
import {queryCollection,setDocument,TAX_TENANT} from '@/lib/firebase';
import {summarizeBusiness} from '@/lib/business';
import {mutationGuard,privateHeaders} from '@/lib/security';
async function reportFor(s,year){
 const filters=[['clientId','EQUAL',s.uid],['taxYear','EQUAL',year],['tenantId','EQUAL',TAX_TENANT]];
 const [entries,corrections,matches]=await Promise.all(['taxBusinessEntries','taxBusinessCorrections','taxBusinessMatches'].map(c=>queryCollection(c,s.idToken,{filters,limit:1000})));
 if([entries,corrections,matches].some(a=>a.length>=1000))throw Error('More records than this report supports');
 const latest=new Map();
 for(const c of corrections.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))latest.set(c.entryId,c);
 const adjusted=entries.map(e=>({...e,...(latest.get(e.id)||{})}));
 return {year,...summarizeBusiness(adjusted),entryCount:entries.length,correctionCount:corrections.length,matchedCount:new Set(matches.map(m=>m.entryId)).size,disclaimer:'Preliminary bookkeeping, subject to preparer review'};
}
export async function GET(req){
 const s=await getFirebaseSession();if(!s||s.role!=='CLIENT')return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const year=Number(new URL(req.url).searchParams.get('year'));if(!Number.isInteger(year)||year<2020||year>2100)return Response.json({error:'Invalid year'},{status:400,headers:privateHeaders});
 try{return Response.json(await reportFor(s,year),{headers:privateHeaders});}catch(e){return Response.json({error:e.message},{status:409,headers:privateHeaders});}
}
export async function POST(req){
 const blocked=mutationGuard(req);if(blocked)return blocked;
 const s=await getFirebaseSession();if(!s||s.role!=='CLIENT')return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const b=await req.json().catch(()=>({}));const year=Number(b.year);if(!Number.isInteger(year)||year<2020||year>2100)return Response.json({error:'Invalid year'},{status:400,headers:privateHeaders});
 try{const report=await reportFor(s,year);const id=crypto.randomUUID();await setDocument('taxBusinessYearEnd/'+id,{tenantId:TAX_TENANT,clientId:s.uid,taxYear:year,status:'SUBMITTED_FOR_REVIEW',report,createdAt:new Date().toISOString()},s.idToken,{createOnly:true});return Response.json({ok:true,id,report},{status:201,headers:privateHeaders});}catch(e){return Response.json({error:e.message},{status:409,headers:privateHeaders});}
}
