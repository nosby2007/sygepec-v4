"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function BusinessWorkspace() {
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [service, setService] = useState({ name: "", price: "", durationMinutes: 60 });
  const [booking, setBooking] = useState({ customerId: "", serviceId: "", start: "", notes: "" });
  const [invoice, setInvoice] = useState({ customerId: "", description: "", amount: "", dueDate: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  return <main>
    <div className="page-head"><div><p className="small">Small Business</p><h1>Services, calendar & invoices</h1><p className="muted">Internal scheduling and draft billing. No automatic reminders, customer notifications, or payment processing yet.</p></div><Link href="/portal/business" className="btn">← Bookkeeping</Link></div>
    {error && <p role="alert">{error}</p>}
    <div className="grid-2">
      <div className="card"><h2>Services & prices</h2><form onSubmit={(event) => { event.preventDefault(); create("services", service, () => setService({ name: "", price: "", durationMinutes: 60 })); }}>
        <label>Service<input className="input" required maxLength={100} value={service.name} onChange={(event) => setService({ ...service, name: event.target.value })} /></label>
        <label>Price (USD)<input className="input" required inputMode="decimal" value={service.price} onChange={(event) => setService({ ...service, price: event.target.value })} /></label>
        <label>Duration (minutes)<input className="input" type="number" min={15} max={480} required value={service.durationMinutes} onChange={(event) => setService({ ...service, durationMinutes: Number(event.target.value) })} /></label>
        <button className="btn btn-primary" disabled={busy}>Add service</button></form>
        {services.map((item) => <p key={item.id}>{item.name} — {money(item.priceCents)} · {item.durationMinutes} min</p>)}</div>
      <div className="card"><h2>Schedule appointment</h2><form onSubmit={(event) => { event.preventDefault(); create("bookings", booking, () => setBooking({ customerId: "", serviceId: "", start: "", notes: "" })); }}>
        <label>Customer<select className="select" required value={booking.customerId} onChange={(event) => setBooking({ ...booking, customerId: event.target.value })}><option value="">Select customer</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Service<select className="select" required value={booking.serviceId} onChange={(event) => setBooking({ ...booking, serviceId: event.target.value })}><option value="">Select service</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Local date and time<input className="input" type="datetime-local" required value={booking.start} onChange={(event) => setBooking({ ...booking, start: event.target.value })} /></label>
        <label>Notes<input className="input" maxLength={300} value={booking.notes} onChange={(event) => setBooking({ ...booking, notes: event.target.value })} /></label>
        <button className="btn btn-primary" disabled={busy}>Save appointment</button></form></div>
      <div className="card"><h2>Create invoice draft</h2><form onSubmit={(event) => { event.preventDefault(); create("invoices", invoice, () => setInvoice({ customerId: "", description: "", amount: "", dueDate: "" })); }}>
        <label>Customer<select className="select" required value={invoice.customerId} onChange={(event) => setInvoice({ ...invoice, customerId: event.target.value })}><option value="">Select customer</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Description<input className="input" required maxLength={200} value={invoice.description} onChange={(event) => setInvoice({ ...invoice, description: event.target.value })} /></label>
        <label>Amount<input className="input" required inputMode="decimal" value={invoice.amount} onChange={(event) => setInvoice({ ...invoice, amount: event.target.value })} /></label>
        <label>Due date<input className="input" type="date" required value={invoice.dueDate} onChange={(event) => setInvoice({ ...invoice, dueDate: event.target.value })} /></label>
        <button className="btn btn-primary" disabled={busy}>Create draft</button></form></div>
      <div className="card"><h2>Invoices ({invoices.length})</h2>{invoices.map((item) => <p key={item.id}>{item.customerName} · {money(item.amountCents)} · Due {item.dueDate} · {item.status}</p>)}</div>
    </div>
    <div className="card mt"><h2>Appointment calendar</h2><p className="small muted">Agenda list by scheduled date. Conflict detection and time-zone support are not yet available.</p>
      {bookings.slice().sort((a, b) => a.start.localeCompare(b.start)).map((item) => <p key={item.id}>{item.start.replace("T", " ")} · {item.customerName} · {item.serviceName} · {item.status}</p>)}
    </div>
  </main>;
}
