import crypto from 'node:crypto';
import {getFirebaseSession} from '@/lib/business-auth';
import {getDocument,setDocument,uploadObject,deleteObject,TAX_TENANT} from '@/lib/firebase';
import {mutationGuard,privateHeaders} from '@/lib/security';
import {audit} from '@/lib/audit';
import {scanFile,scanMessage} from '@/lib/file-scan';
export async function POST(req){
 const blocked=mutationGuard(req);if(blocked)return blocked;
 const s=await getFirebaseSession();if(!s||s.role!=='CLIENT')return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 const form=await req.formData().catch(()=>null);
 const entryId=String(form?.get('entryId')||''),file=form?.get('file');
 if(!/^[a-f0-9-]{36}$/i.test(entryId))return Response.json({error:'Invalid expense reference'},{status:400,headers:privateHeaders});
 if(!file||typeof file==='string')return Response.json({error:'No receipt file provided'},{status:400,headers:privateHeaders});
 if(file.size<1||file.size>10*1024*1024)return Response.json({error:'Receipt must be between 1 byte and 10 MB'},{status:400,headers:privateHeaders});
 const entry=await getDocument('taxBusinessEntries/'+entryId,s.idToken);
 if(!entry||entry.clientId!==s.uid||entry.kind!=='expense')return Response.json({error:'Expense not found'},{status:404,headers:privateHeaders});
 const bytes=new Uint8Array(await file.arrayBuffer());
 const scan=scanFile(bytes,{allowed:['application/pdf','image/jpeg','image/png']});
 if(!scan.ok){const unsafe=scanMessage(scan);if(unsafe)await audit(s,'UPLOAD_BLOCKED',{target:'taxBusinessEntries/'+entryId,details:{filename:file.name,reason:scan.reason}});return Response.json({error:unsafe||'PDF, JPG or PNG only'},{status:400,headers:privateHeaders});}
 const {mime,ext}=scan;
 const id=crypto.randomUUID(),path='tax/perry-tax-pro/business/'+s.uid+'/'+entryId+'/'+id+'.'+ext;
 await uploadObject(path,bytes,mime,s.idToken);
 try{await setDocument('taxBusinessReceipts/'+id,{tenantId:TAX_TENANT,clientId:s.uid,entryId,taxYear:entry.taxYear,storagePath:path,mime,size:file.size,createdAt:new Date().toISOString()},s.idToken,{createOnly:true});}
 catch(e){await deleteObject(path,s.idToken).catch(()=>null);throw e;}
 return Response.json({ok:true,id},{status:201,headers:privateHeaders});
}
