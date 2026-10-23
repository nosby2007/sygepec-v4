"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { NumberCount } from "@/components/Motion";
import { Avatar, Empty } from "@/components/ui";

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
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    try {
      const response = await fetch("/api/business/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setForm({ name: "", phone: "", email: "", notes: "" });
      setCustomers(await fetchCustomers());
      setSaved(true);
    } catch (reason) {
      setError(reason.message || "Unable to save customer");
    } finally {
      setBusy(false);
    }
  }

  const shown = customers
    .filter((c) => `${c.name} ${c.email || ""} ${c.phone || ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const withEmail = customers.filter((c) => c.email).length;
  const withNotes = customers.filter((c) => c.notes).length;

  return <>
    <div className="page-head">
      <div><div className="kicker"><Icon name="users" size={15} /> Small Business CRM</div><h1>Customers</h1><p className="desc small">Private customer directory. Online booking and automated reminders are planned, not active.</p></div>
      <Link href="/portal/business" className="btn btn-ghost"><Icon name="back" size={16} /> Bookkeeping</Link>
    </div>

    <div className="grid-3 stagger">
      {[["Customers", customers.length, "users", ""], ["Reachable by email", withEmail, "mail", "teal"], ["With follow-up notes", withNotes, "clipboard", "gold"]].map(([l, v, icon, tone]) => (
        <div key={l} className="card kpi card-hover">
          <div className="kpi-head"><div className="lbl">{l}</div><span className={`kpi-icon ${tone}`}><Icon name={icon} size={18} /></span></div>
          <div className="val"><NumberCount value={v} /></div>
          {l !== "Customers" && <div className="meter"><span style={{ width: `${customers.length ? (v / customers.length) * 100 : 0}%` }} /></div>}
        </div>
      ))}
    </div>

    <div className="grid-main mt" style={{ gridTemplateColumns: "340px minmax(0,1fr)", alignItems: "start" }}>
      <div className="card" style={{ position: "sticky", top: 90 }}>
        <div className="card-title"><div className="row nowrap"><span className="kpi-icon"><Icon name="plus" size={18} /></span><h3>Add customer</h3></div></div>
        <form onSubmit={save} className="stack">
          <div className="field"><label htmlFor="cu-name">Name</label><input id="cu-name" className="input" required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div className="field"><label htmlFor="cu-phone">Phone</label><div className="input-icon"><Icon name="phone" size={15} /><input id="cu-phone" className="input" maxLength={30} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div></div>
          <div className="field"><label htmlFor="cu-email">Email</label><div className="input-icon"><Icon name="mail" size={15} /><input id="cu-email" className="input" type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div></div>
          <div className="field"><label htmlFor="cu-notes">Notes</label><textarea id="cu-notes" className="textarea" style={{ minHeight: 80 }} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
          {error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
          {saved && <div className="alert alert-success"><Icon name="check" size={16} />Customer saved</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Saving…" : "Save customer"}</button>
        </form>
      </div>
      <div className="card">
        <div className="card-title">
          <div><h3>Customer directory</h3><div className="sub">{shown.length} of {customers.length}</div></div>
          <div className="input-icon" style={{ width: "min(280px,100%)" }}><Icon name="search" size={16} /><input className="input" placeholder="Search customers…" value={q} onChange={(event) => setQ(event.target.value)} aria-label="Search customers" /></div>
        </div>
        {shown.length === 0 ? (
          <Empty icon="users" title={customers.length ? "No matches" : "No customers yet"}>{customers.length ? "Try a different search." : "Add your first customer with the form."}</Empty>
        ) : (
          <div className="customer-grid">
            {shown.map((customer, i) => (
              <article key={customer.id} className="customer-card" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className="person"><Avatar name={customer.name} /><div style={{ minWidth: 0 }}><strong className="truncate" style={{ display: "block" }}>{customer.name}</strong><span className="tiny muted">Customer</span></div></div>
                <div className="meta">
                  {customer.phone && <span><Icon name="phone" size={13} />{customer.phone}</span>}
                  {customer.email && <span className="truncate"><Icon name="mail" size={13} />{customer.email}</span>}
                  {!customer.phone && !customer.email && <span className="faint">No contact details</span>}
                </div>
                {customer.notes && <p className="note muted">{customer.notes}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  </>;
}
