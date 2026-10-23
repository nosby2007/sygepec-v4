'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
export default function Customers(){
 const [customers,setCustomers]=useState([]),[form,setForm]=useState({name:'',phone:'',email:'',notes:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/business/customers',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setCustomers(d.customers||[]);}catch(e){setError(e.message);}}
 useEffect(()=>{load();},[]);
 async function save(e){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/business/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const d=await r.json();if(!r.ok)throw Error(d.error);setForm({name:'',phone:'',email:'',notes:''});await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main><div className="page-head"><div><p className="small">Small Business CRM</p><h1>Customers</h1><p className="muted">Private customer directory. Online booking and automated reminders are planned, not active.</p></div><Link href="/portal/business" className="btn">← Bookkeeping</Link></div>
 <div className="card"><h2>Add customer</h2><form onSubmit={save}><label>Name<input className="input" required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Phone<input className="input" maxLength={30} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Email<input className="input" type="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Notes<input className="input" maxLength={500} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>Save customer</button></form></div>
 <div className="card mt"><h2>Customer directory ({customers.length})</h2>{customers.map(c=><article key={c.id} className="row between"><div><strong>{c.name}</strong><p className="small">{c.phone} {c.email}</p><p className="small muted">{c.notes}</p></div></article>)}</div></main>;
}
