export const BUSINESS_CATEGORIES = {
 income: ['Sales','Services','Other income'],
 expense: ['Advertising','Car and truck','Contract labor','Insurance','Office expenses','Rent','Repairs','Supplies','Taxes and licenses','Travel','Meals','Utilities','Other expense']
};
export function summarizeBusiness(entries) {
 const totals={incomeCents:0,expenseCents:0,byCategory:{}};
 for(const e of entries) {
  if (!['income','expense'].includes(e.kind) || !Number.isSafeInteger(e.amountCents) || e.amountCents<=0) continue;
  if(e.kind==='income') totals.incomeCents+=e.amountCents;
  else totals.expenseCents+=e.amountCents;
  const key=e.kind+':'+e.category;
  totals.byCategory[key]=(totals.byCategory[key]||0)+e.amountCents;
 }
 return {...totals,netCents:totals.incomeCents-totals.expenseCents};
}
export function parseAmount(value) {
 const str=String(value??'').trim();
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(str)) return null;
 const [whole,decimal='']=str.split('.');
 const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 return Number.isSafeInteger(cents)&&cents>0?cents:null;
}
