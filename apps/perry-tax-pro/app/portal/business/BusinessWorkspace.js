'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((n||0)/100);
export default function BusinessWorkspace(){
 const [customers,setCustomers]=useState([]),[services,setServices]=useState([]),[bookings,setBookings]=useState([]),[invoices,setInvoices]=useState([]);
 const [service,setService]=useState({name:'',price:'',durationMinutes:60}),[booking,setBooking]=useState({customerId:'',serviceId:'',start:'',notes:''}),[invoice,setInvoice]=useState({customerId:'',description:'',amount:'',dueDate:''});
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){
  try{
   const paths=['customers','services','bookings','invoices'];
   const rows=await Promise.all(paths.map(async p=>{const r=await fetch('/api/business/'+p,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load '+p);return d[p]||[];}));
   setCustomers(rows[0]);setServices(rows[1]);setBookings(rows[2]);setInvoices(rows[3]);
  }catch(e){setError(e.message);}
 }
 useEffect(()=>{refresh();},[]);
 async function create(type,data,reset){
  setBusy(true);setError('');
  try{const r=await fetch('/api/business/'+type,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to save');reset();await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <main><div className="page-head"><div><p className="small">Small Business</p><h1>Services, calendar & invoices</h1><p className="muted">Internal scheduling and draft billing. No automatic reminders, customer notifications, or payment processing yet.</p></div><Link href="/portal/business" className="btn">← Bookkeeping</Link></div>
 {error&&<p role="alert">{error}</p>}
 <div className="grid-2">
 <div className="card"><h2>Services & prices</h2><form onSubmit={e=>{e.preventDefault();create('services',service,()=>setService({name:'',price:'',durationMinutes:60}));}}>
 <label>Service<input className="input" required maxLength={100} value={service.name} onChange={e=>setService({...service,name:e.target.value})}/></label>
 <label>Price (USD)<input className="input" required inputMode="decimal" value={service.price} onChange={e=>setService({...service,price:e.target.value})}/></label>
 <label>Duration (minutes)<input className="input" type="number" min={15} max={480} required value={service.durationMinutes} onChange={e=>setService({...service,durationMinutes:Number(e.target.value)})}/></label>
 <button className="btn btn-primary" disabled={busy}>Add service</button></form>
 {services.map(s=><p key={s.id}>{s.name} — {money(s.priceCents)} · {s.durationMinutes} min</p>)}</div>
 <div className="card"><h2>Schedule appointment</h2><form onSubmit={e=>{e.preventDefault();create('bookings',booking,()=>setBooking({customerId:'',serviceId:'',start:'',notes:''}));}}>
 <label>Customer<select className="select" required value={booking.customerId} onChange={e=>setBooking({...booking,customerId:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>Service<select className="select" required value={booking.serviceId} onChange={e=>setBooking({...booking,serviceId:e.target.value})}><option value="">Select service</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Local date and time<input className="input" type="datetime-local" required value={booking.start} onChange={e=>setBooking({...booking,start:e.target.value})}/></label>
 <label>Notes<input className="input" maxLength={300} value={booking.notes} onChange={e=>setBooking({...booking,notes:e.target.value})}/></label>
 <button className="btn btn-primary" disabled={busy}>Save appointment</button></form></div>
 <div className="card"><h2>Create invoice draft</h2><form onSubmit={e=>{e.preventDefault();create('invoices',invoice,()=>setInvoice({customerId:'',description:'',amount:'',dueDate:''}));}}>
 <label>Customer<select className="select" required value={invoice.customerId} onChange={e=>setInvoice({...invoice,customerId:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>Description<input className="input" required maxLength={200} value={invoice.description} onChange={e=>setInvoice({...invoice,description:e.target.value})}/></label>
 <label>Amount<input className="input" required inputMode="decimal" value={invoice.amount} onChange={e=>setInvoice({...invoice,amount:e.target.value})}/></label>
 <label>Due date<input className="input" type="date" required value={invoice.dueDate} onChange={e=>setInvoice({...invoice,dueDate:e.target.value})}/></label>
 <button className="btn btn-primary" disabled={busy}>Create draft</button></form></div>
 <div className="card"><h2>Invoices ({invoices.length})</h2>{invoices.map(i=><p key={i.id}>{i.customerName} · {money(i.amountCents)} · Due {i.dueDate} · {i.status}</p>)}</div>
 </div>
 <div className="card mt"><h2>Appointment calendar</h2><p className="small muted">Agenda list by scheduled date. Conflict detection and time-zone support are not yet available.</p>
 {bookings.slice().sort((a,b)=>a.start.localeCompare(b.start)).map(b=><p key={b.id}>{b.start.replace('T',' ')} · {b.customerName} · {b.serviceName} · {b.status}</p>)}
 </div></main>;
}
