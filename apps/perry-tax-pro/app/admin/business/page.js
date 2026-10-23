import {requireRole,getFirebaseSession} from '@/lib/auth';
import {queryCollection,TAX_TENANT} from '@/lib/firebase';
export const metadata={title:'Business Year-End Review'};
export default async function Page(){
 await requireRole('PREPARER');const s=await getFirebaseSession();
 const reports=await queryCollection('taxBusinessYearEnd',s.idToken,{filters:[['tenantId','EQUAL',TAX_TENANT]],limit:200});
 return <main><div className="page-head"><div><h1>Business tax handoffs</h1><p className="muted">Client-submitted bookkeeping snapshots. Validate against source documents before preparing a return.</p></div></div><div className="card">{reports.map(x=><article key={x.id}><h3>Client {x.clientId} · {x.taxYear}</h3><p>Income: {(x.report?.incomeCents||0)/100} USD · Expenses: {(x.report?.expenseCents||0)/100} USD · Net: {(x.report?.netCents||0)/100} USD</p><p>Entries: {x.report?.entryCount||0} · Corrections: {x.report?.correctionCount||0} · Matched: {x.report?.matchedCount||0}</p><p className="small">{x.status} · {x.createdAt}</p></article>)}</div></main>;
}
