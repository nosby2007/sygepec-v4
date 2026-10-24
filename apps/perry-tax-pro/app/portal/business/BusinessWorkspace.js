"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { MoneyCount, NumberCount } from "@/components/Motion";
import { HBars, PALETTE } from "@/components/charts";
import { Avatar, Empty } from "@/components/ui";

const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((value || 0) / 100);
const resources = ["customers", "services", "bookings", "invoices"];

async function fetchWorkspace() {
  return Promise.all(resources.map(async (resource) => {
    const response = await fetch(`/api/business/${resource}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Unable to load ${resource}`);
    return body[resource] || [];
  }));
}

const when = (start) => {
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function BusinessWorkspace() {
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [service, setService] = useState({ name: "", price: "", durationMinutes: 60, description: "", public: false });
  const [editingService, setEditingService] = useState(null);
  const [invoice, setInvoice] = useState({ customerId: "", description: "", amount: "", dueDate: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("services");

  function applyWorkspace([nextCustomers, nextServices, nextBookings, nextInvoices]) {
    setCustomers(nextCustomers);
    setServices(nextServices);
    setBookings(nextBookings);
    setInvoices(nextInvoices);
  }

  useEffect(() => {
    let cancelled = false;
    fetchWorkspace()
      .then((rows) => { if (!cancelled) applyWorkspace(rows); })
      .catch((reason) => { if (!cancelled) setError(reason.message || "Unable to load workspace"); });
    return () => { cancelled = true; };
  }, []);

  async function create(type, data, reset) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/business/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save");
      reset();
      applyWorkspace(await fetchWorkspace());
    } catch (reason) {
      setError(reason.message || "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  const agenda = useMemo(() => bookings.slice().sort((a, b) => a.start.localeCompare(b.start)), [bookings]);
  const invoiced = invoices.reduce((sum, item) => sum + (item.amountCents || 0), 0);
  const scheduledValue = bookings.reduce((sum, item) => sum + (item.priceCents || 0), 0);
  const topCustomers = useMemo(() => {
    const byCustomer = {};
    for (const item of invoices) byCustomer[item.customerName] = (byCustomer[item.customerName] || 0) + (item.amountCents || 0);
    return Object.entries(byCustomer).map(([label, cents]) => ({ label, value: cents / 100 })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [invoices]);

  const TABS = [["services", "layers", "Services", services.length], ["schedule", "calendar", "Schedule", bookings.length], ["invoice", "receipt", "Invoice", invoices.length]];

  return <>
    <div className="page-head">
      <div><div className="kicker"><Icon name="receipt" size={15} /> Small Business</div><h1>Services, calendar & invoices</h1><p className="desc small">Services, what customers can book online, and draft billing. No automatic reminders, customer notifications, or payment processing yet.</p></div>
      <Link href="/portal/business" className="btn btn-ghost"><Icon name="back" size={16} /> Bookkeeping</Link>
    </div>
    {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}><Icon name="alert" size={16} />{error}</div>}

    <div className="grid-4 stagger">
      <div className="card kpi card-hover"><div className="kpi-head"><div className="lbl">Services offered</div><span className="kpi-icon"><Icon name="layers" size={18} /></span></div><div className="val"><NumberCount value={services.length} /></div></div>
      <div className="card kpi card-hover"><div className="kpi-head"><div className="lbl">Appointments</div><span className="kpi-icon gold"><Icon name="calendar" size={18} /></span></div><div className="val"><NumberCount value={bookings.length} /></div><div className="kpi-foot"><span className="small muted">Scheduled value {money(scheduledValue)}</span></div></div>
      <div className="card kpi card-hover"><div className="kpi-head"><div className="lbl">Invoiced (drafts)</div><span className="kpi-icon teal"><Icon name="dollar" size={18} /></span></div><div className="val"><MoneyCount value={invoiced} cents /></div><div className="kpi-foot"><span className="small muted">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</span></div></div>
      <div className="card kpi card-hover"><div className="kpi-head"><div className="lbl">Customers</div><span className="kpi-icon violet"><Icon name="users" size={18} /></span></div><div className="val"><NumberCount value={customers.length} /></div><div className="kpi-foot"><Link href="/portal/business/customers" className="small grad-text" style={{ fontWeight: 600 }}>Manage →</Link></div></div>
    </div>

    <div className="grid-main mt" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="tabs" role="tablist">
          {TABS.map(([key, icon, label, count]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}><Icon name={icon} size={16} />{label}<span className="pill" style={{ padding: "1px 8px" }}>{count}</span></button>
          ))}
        </div>

        {tab === "services" && <div className="fade-in">
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); create("services", service, () => setService({ name: "", price: "", durationMinutes: 60, description: "", public: false })); }}>
            <div className="field full"><label htmlFor="sv-name">Service</label><input id="sv-name" className="input" required maxLength={100} value={service.name} onChange={(event) => setService({ ...service, name: event.target.value })} /></div>
            <div className="field"><label htmlFor="sv-price">Price (USD)</label><div className="input-icon"><Icon name="dollar" size={15} /><input id="sv-price" className="input num" required inputMode="decimal" value={service.price} onChange={(event) => setService({ ...service, price: event.target.value })} /></div></div>
            <div className="field"><label htmlFor="sv-duration">Duration (minutes)</label><div className="input-icon"><Icon name="clock" size={15} /><input id="sv-duration" className="input num" type="number" min={15} max={480} required value={service.durationMinutes} onChange={(event) => setService({ ...service, durationMinutes: Number(event.target.value) })} /></div></div>
            <div className="field full"><label htmlFor="sv-desc">Description (shown to customers)</label><textarea id="sv-desc" className="textarea" maxLength={1000} value={service.description} onChange={(event) => setService({ ...service, description: event.target.value })} /></div>
            <label className="full row nowrap small"><input type="checkbox" checked={service.public} onChange={(event) => setService({ ...service, public: event.target.checked })} /> Show on my public page so customers can book it</label>
            <div className="full form-actions" style={{ marginTop: 0 }}><button className="btn btn-primary" disabled={busy}><Icon name="plus" size={16} /> Add service</button></div>
          </form>
          <div className="stack-sm mt">
            {services.length === 0 && <Empty icon="layers" title="No services yet">Add what you sell with a price and duration.</Empty>}
            {services.map((item) => editingService === item.id
              ? <ServiceEditor key={item.id} service={item} onDone={async () => { setEditingService(null); applyWorkspace(await fetchWorkspace()); }} />
              : <div key={item.id} className="service-tile"><div className="row nowrap" style={{ minWidth: 0 }}><span className="kpi-icon"><Icon name="layers" size={16} /></span><b className="truncate">{item.name}</b>{item.public && item.active !== false && <span className="pill info">Public</span>}{item.active === false && <span className="pill">Inactive</span>}</div><div className="row nowrap"><span className="pill"><Icon name="clock" size={12} />{item.durationMinutes} min</span><b className="num">{money(item.priceCents)}</b><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingService(item.id)}>Edit</button></div></div>)}
          </div>
        </div>}

        {tab === "schedule" && <div className="fade-in stack-sm">
          <p className="small">Scheduling now lives in <b>Bookings</b>: time zones, staff calendars, conflict checks and bookings from your public page in one calendar.</p>
          <Link href="/portal/business/bookings" className="btn btn-primary" style={{ alignSelf: "flex-start" }}><Icon name="calendar" size={16} /> Open Bookings</Link>
        </div>}

        {tab === "invoice" && <div className="fade-in">
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); create("invoices", invoice, () => setInvoice({ customerId: "", description: "", amount: "", dueDate: "" })); }}>
            <div className="field"><label htmlFor="iv-customer">Customer</label><select id="iv-customer" className="select" required value={invoice.customerId} onChange={(event) => setInvoice({ ...invoice, customerId: event.target.value })}><option value="">Select customer</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="field"><label htmlFor="iv-due">Due date</label><input id="iv-due" className="input" type="date" required value={invoice.dueDate} onChange={(event) => setInvoice({ ...invoice, dueDate: event.target.value })} /></div>
            <div className="field full"><label htmlFor="iv-desc">Description</label><input id="iv-desc" className="input" required maxLength={200} value={invoice.description} onChange={(event) => setInvoice({ ...invoice, description: event.target.value })} /></div>
            <div className="field"><label htmlFor="iv-amount">Amount</label><div className="input-icon"><Icon name="dollar" size={15} /><input id="iv-amount" className="input num" required inputMode="decimal" value={invoice.amount} onChange={(event) => setInvoice({ ...invoice, amount: event.target.value })} /></div></div>
            <div className="form-actions" style={{ marginTop: 0, alignSelf: "end" }}><button className="btn btn-primary" disabled={busy}><Icon name="file" size={16} /> Create draft</button></div>
          </form>
          <div className="table-wrap mt">
            <table>
              <thead><tr><th>Customer</th><th>Description</th><th>Due</th><th>Status</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {invoices.map((item) => <tr key={item.id}><td><div className="person"><Avatar name={item.customerName} size="sm" /><b>{item.customerName}</b></div></td><td className="small">{item.description}</td><td className="small">{item.dueDate}</td><td><span className={`badge s-${item.status}`}>{String(item.status).toLowerCase()}</span></td><td className="num"><b>{money(item.amountCents)}</b></td></tr>)}
                {invoices.length === 0 && <tr><td colSpan={5}><Empty icon="receipt" title="No invoices yet">Drafts you create appear here.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </div>}
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-title"><div><h3>Earlier appointments</h3><div className="sub">Read-only, before online booking</div></div></div>
          <div className="agenda" style={{ maxHeight: 380, overflowY: "auto" }}>
            {agenda.length === 0 && <Empty icon="calendar" title="None">Use Bookings to schedule work.</Empty>}
            {agenda.map((item) => {
              const d = when(item.start);
              return (
                <div key={item.id} className="agenda-item">
                  <div className="date-tile"><span>{d ? d.toLocaleDateString("en-US", { month: "short" }) : "—"}</span><b>{d ? d.getDate() : "?"}</b></div>
                  <div className="grow"><b className="truncate" style={{ display: "block" }}>{item.customerName}</b><span className="hint">{d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : item.start} · {item.serviceName}</span></div>
                  <span className={`badge s-${item.status}`}>{String(item.status).toLowerCase()}</span>
                </div>
              );
            })}
          </div>
          <p className="hint mt-sm">Appointments entered here before online booking. New bookings are in Bookings.</p>
        </div>
        <div className="card">
          <div className="card-title"><h3>Top customers by invoiced</h3></div>
          {topCustomers.length ? <HBars items={topCustomers.map((x) => ({ ...x, color: PALETTE.teal }))} format={(v) => money(v * 100)} /> : <p className="small">Invoice totals per customer appear here.</p>}
        </div>
      </div>
    </div>
  </>;
}

function ServiceEditor({ service, onDone }) {
  const [f, setF] = useState({ name: service.name, price: (service.priceCents / 100).toFixed(2), durationMinutes: service.durationMinutes, description: service.description || "", public: Boolean(service.public), active: service.active !== false });
  const [state, setState] = useState({});
  const save = async (event) => {
    event.preventDefault();
    setState({ busy: true });
    const response = await fetch(`/api/business/services/${service.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setState({ error: body.error || "Unable to save" });
    onDone();
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("target", `service:${service.id}`);
    form.set("file", file);
    setState({ busy: true });
    const response = await fetch("/api/business/media", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    setState(response.ok ? { ok: "Photo updated." } : { error: body.error || "Upload failed" });
  };
  return (
    <form className="card form-grid" style={{ boxShadow: "none" }} onSubmit={save}>
      <div className="field full"><label htmlFor={`se-name-${service.id}`}>Service</label><input id={`se-name-${service.id}`} className="input" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label htmlFor={`se-price-${service.id}`}>Price (USD)</label><input id={`se-price-${service.id}`} className="input num" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
      <div className="field"><label htmlFor={`se-dur-${service.id}`}>Duration (min)</label><input id={`se-dur-${service.id}`} type="number" min={15} max={480} className="input num" value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} /></div>
      <div className="field full"><label htmlFor={`se-desc-${service.id}`}>Description</label><textarea id={`se-desc-${service.id}`} className="textarea" maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="full row">
        <label className="row nowrap small"><input type="checkbox" checked={f.public} onChange={(e) => setF({ ...f, public: e.target.checked })} /> On public page</label>
        <label className="row nowrap small"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        <label className="btn btn-ghost btn-sm"><Icon name="upload" size={14} /> Photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} /></label>
      </div>
      {state.error && <div className="full alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="full alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
      <div className="full row"><button className="btn btn-primary btn-sm" disabled={Boolean(state.busy)}>Save</button><button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Close</button></div>
    </form>
  );
}
