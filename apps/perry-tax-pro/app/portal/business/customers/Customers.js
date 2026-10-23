"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

async function fetchCustomers() {
  const response = await fetch("/api/business/customers", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body.customers || [];
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCustomers()
      .then((rows) => { if (!cancelled) setCustomers(rows); })
      .catch((reason) => { if (!cancelled) setError(reason.message || "Unable to load customers"); });
    return () => { cancelled = true; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/business/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setForm({ name: "", phone: "", email: "", notes: "" });
      setCustomers(await fetchCustomers());
    } catch (reason) {
      setError(reason.message || "Unable to save customer");
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <div className="page-head"><div><p className="small">Small Business CRM</p><h1>Customers</h1><p className="muted">Private customer directory. Online booking and automated reminders are planned, not active.</p></div><Link href="/portal/business" className="btn">← Bookkeeping</Link></div>
    <div className="card"><h2>Add customer</h2><form onSubmit={save}>
      <label>Name<input className="input" required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Phone<input className="input" maxLength={30} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      <label>Email<input className="input" type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Notes<input className="input" maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      {error && <p role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save customer"}</button></form></div>
    <div className="card mt"><h2>Customer directory ({customers.length})</h2>{customers.map((customer) => <article key={customer.id} className="row between"><div><strong>{customer.name}</strong><p className="small">{customer.phone} {customer.email}</p><p className="small muted">{customer.notes}</p></div></article>)}</div>
  </main>;
}
