import {getFirebaseSession} from '@/lib/auth';
import {queryCollection,TAX_TENANT} from '@/lib/firebase';
import {privateHeaders} from '@/lib/security';
export async function GET(){
 const s=await getFirebaseSession();if(!s||s.role!=='CLIENT')return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const bookings=await queryCollection('taxBusinessBookings',s.idToken,{filters:[['ownerUid','EQUAL',s.uid],['tenantId','EQUAL',TAX_TENANT]],limit:500});
 const now=Date.now(),upcoming=bookings.filter(b=>b.status==='SCHEDULED'&&new Date(b.start).getTime()>now);
 return Response.json({upcoming,deliveryEnabled:false,message:'External reminder delivery requires customer consent, a verified provider, a scheduled worker and timezone handling.'},{headers:privateHeaders});
}
