"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import Icon from "@/components/Icon";
import Sheet from "@/components/mobile/Sheet";
import { api, tap } from "@/components/mobile/native";
import { dollars, initials } from "@/components/mobile/format";

const TIPS = [0, 15, 20, 25];
const toCents = (v) => Math.round((Number(v) || 0) * 100);

// Point-of-sale checkout: client (or walk-in), items, discount, tip, then card (Stripe
// payment page shown as a QR code or opened here) or cash.
export default function Checkout({ services, clients, cardReady, fromBooking }) {
  const router = useRouter();
  const [client, setClient] = useState(fromBooking?.customerId ? clients.find((c) => c.id === fromBooking.customerId) : null);
  const [lines, setLines] = useState(fromBooking ? [fromBooking.line] : []);
  const [custom, setCustom] = useState("");
  const [discount, setDiscount] = useState(null);
  const [tipPercent, setTipPercent] = useState(0);
  const [customTip, setCustomTip] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [state, setState] = useState({});
  const [result, setResult] = useState(null);

  // Typing straight into the amount box charges a single custom amount.
  const effective = lines.length ? lines : toCents(custom) > 0 ? [{ name: "Custom amount", amount: Number(custom), qty: 1 }] : [];
  const subtotal = effective.reduce((s, l) => s + toCents(l.amount) * l.qty, 0);
  const off = !discount ? 0 : discount.type === "PERCENT" ? Math.round((subtotal * Math.min(100, discount.value)) / 100) : Math.min(subtotal, toCents(discount.value));
  const tip = customTip !== null ? toCents(customTip) : Math.round(((subtotal - off) * tipPercent) / 100);
  const total = subtotal - off + tip;

  const pay = async (method) => {
    tap();
    setState({ busy: method });
    try {
      const r = await api("/api/business/checkout", {
        body: {
          lines: effective, method, customerId: client?.id || null, bookingId: fromBooking?.bookingId || null,
          discount: discount && { type: discount.type, value: discount.value }, tip: tip / 100,
        },
      });
      setResult(r);
      setState({});
    } catch (e) {
      setState({ error: e.message });
    }
  };
  const reset = () => {
    setResult(null); setLines([]); setCustom(""); setDiscount(null); setTipPercent(0); setCustomTip(null); setClient(null);
    router.replace("/m/business/checkout");
    router.refresh();
  };

  if (result) return <Done result={result} client={client} onNew={reset} />;

  return (
    <main className="m-main">
      <div className="m-head"><h1>Checkout</h1>{fromBooking && <span className="m-status on">From booking</span>}</div>

      <button type="button" className="m-pick" onClick={() => setSheet("client")}>
        {client ? <div className="m-avatar">{initials(client.name)}</div> : <div className="m-avatar" style={{ background: "var(--surface-3)", color: "var(--faint)" }}><Icon name="user" size={26} /></div>}
        <span style={{ flex: 1, color: client ? "var(--text)" : undefined }}>{client ? <><b>{client.name}</b><br /><small>{client.phone || client.email}</small></> : fromBooking?.customerName ? `${fromBooking.customerName} (not in your clients)` : "Select a client or leave empty for walk-in"}</span>
        <Icon name="chevron" size={20} />
      </button>

      <div className="m-amount">
        <label htmlFor="m-amount">AMOUNT DUE</label>
        <div><span>$</span>
          {lines.length ? <input id="m-amount" readOnly value={(total / 100).toFixed(2)} /> : (
            <input id="m-amount" inputMode="decimal" placeholder="0.00" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} />
          )}
        </div>
      </div>

      {effective.length > 0 && (
        <div className="m-list m-gap-b">
          {lines.map((l, i) => (
            <div key={i} className="m-row">
              <div className="m-row-text"><b>{l.qty > 1 ? `${l.qty} × ` : ""}{l.name}</b><span>{dollars(toCents(l.amount) * l.qty)}</span></div>
              <button type="button" className="m-icon-btn" aria-label={`Remove ${l.name}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
            </div>
          ))}
          {off > 0 && <div className="m-row"><div className="m-row-text"><b>Discount</b><span>{discount.type === "PERCENT" ? `${discount.value}%` : "Amount"}</span></div><b>−{dollars(off)}</b><button type="button" className="m-icon-btn" aria-label="Remove discount" onClick={() => setDiscount(null)}><Icon name="x" size={16} /></button></div>}
          {tip > 0 && <div className="m-row"><div className="m-row-text"><b>Tip</b></div><b>{dollars(tip)}</b></div>}
          <div className="m-row"><div className="m-row-text"><b>Total</b></div><b style={{ fontSize: 20 }}>{dollars(total)}</b></div>
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-action" onClick={() => setSheet("item")}><i><Icon name="plus" size={20} /></i> Add Item</button>
        <button type="button" className="m-action" onClick={() => setSheet("discount")} disabled={!subtotal}><i><Icon name="percent" size={20} /></i> Discount</button>
      </div>

      {subtotal > 0 && (
        <>
          <div className="m-sub" style={{ margin: "4px 0 8px" }}>Gratuity</div>
          <div className="m-chips m-gap-b">
            {TIPS.map((p) => (
              <button key={p} type="button" className="m-chip" aria-pressed={customTip === null && tipPercent === p} onClick={() => { setCustomTip(null); setTipPercent(p); }}>
                {p ? dollars(Math.round(((subtotal - off) * p) / 100)) : "$0.00"}<small>{p ? `${p}%` : "No tip"}</small>
              </button>
            ))}
            <button type="button" className="m-chip" aria-pressed={customTip !== null} onClick={() => setCustomTip(customTip ?? "")}>…<small>Custom</small></button>
          </div>
          {customTip !== null && <label className="m-field"><span>Tip amount ($)</span><input className="m-input" inputMode="decimal" value={customTip} onChange={(e) => setCustomTip(e.target.value.replace(/[^\d.]/g, ""))} /></label>}
        </>
      )}

      {state.error && <div className="m-alert">{state.error}</div>}
      {total > 0 && (
        <div className="m-btns">
          {cardReady ? (
            <button type="button" className="m-btn" disabled={!!state.busy} onClick={() => pay("CARD")}><Icon name="card" size={20} /> {state.busy === "CARD" ? "Preparing…" : `Charge card · ${dollars(total)}`}</button>
          ) : (
            <div className="m-alert info">To take cards, connect your payment account in <Link href="/portal/business/plan">Plan &amp; payments</Link>. Cash works now.</div>
          )}
          <div className="m-btns two">
            <button type="button" className="m-btn ghost" disabled={!!state.busy} onClick={() => pay("CASH")}>{state.busy === "CASH" ? "Saving…" : "Cash"}</button>
            <button type="button" className="m-btn ghost" disabled={!!state.busy} onClick={() => pay("OTHER")}>{state.busy === "OTHER" ? "Saving…" : "Other payment"}</button>
          </div>
          <p className="m-sub" style={{ marginTop: 4 }}>Cash and other payments go straight into your books as income. Card payments are added when the client pays.</p>
        </div>
      )}

      {sheet === "client" && (
        <ClientPicker clients={clients} onPick={(c) => { setClient(c); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
      {sheet === "item" && (
        <ItemPicker services={services} onAdd={(line) => { setLines([...lines, ...(lines.length || !toCents(custom) ? [] : [{ name: "Custom amount", amount: Number(custom), qty: 1 }]), line]); setCustom(""); setSheet(null); }} onClose={() => setSheet(null)} />
      )}
      {sheet === "discount" && <DiscountSheet onApply={(d) => { setDiscount(d); setSheet(null); }} onClose={() => setSheet(null)} />}
    </main>
  );
}

function ClientPicker({ clients, onPick, onClose }) {
  const [q, setQ] = useState("");
  const rows = clients.filter((c) => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <Sheet title="Select client" onClose={onClose}>
      <div className="m-search"><Icon name="search" size={18} /><input autoFocus placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="m-list">
        <button type="button" className="m-row" onClick={() => onPick(null)}><div className="m-avatar" style={{ background: "var(--surface-3)", color: "var(--muted)" }}><Icon name="user" size={22} /></div><div className="m-row-text"><b>Walk-in</b><span>No client details</span></div></button>
        {rows.map((c) => (
          <button key={c.id} type="button" className="m-row" onClick={() => onPick(c)}><div className="m-avatar">{initials(c.name)}</div><div className="m-row-text"><b>{c.name}</b><span>{c.phone || c.email}</span></div></button>
        ))}
      </div>
    </Sheet>
  );
}

function ItemPicker({ services, onAdd, onClose }) {
  const [item, setItem] = useState({ name: "", amount: "", qty: 1 });
  return (
    <Sheet title="Add item" onClose={onClose}>
      {services.length > 0 && (
        <div className="m-list m-gap-b">
          {services.map((s) => (
            <button key={s.id} type="button" className="m-row" onClick={() => onAdd({ name: s.name, amount: s.priceCents / 100, qty: 1, serviceId: s.id })}>
              <div className="m-row-text"><b>{s.name}</b><span>{s.durationMinutes} min</span></div><b>{dollars(s.priceCents)}</b>
            </button>
          ))}
        </div>
      )}
      <div className="m-sub">Or a product or custom item</div>
      <label className="m-field"><span>Name</span><input className="m-input" maxLength={80} placeholder="e.g. Hair products" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} /></label>
      <div className="m-btns two">
        <label className="m-field"><span>Price ($)</span><input className="m-input" inputMode="decimal" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value.replace(/[^\d.]/g, "") })} /></label>
        <label className="m-field"><span>Quantity</span><input className="m-input" type="number" min={1} max={20} value={item.qty} onChange={(e) => setItem({ ...item, qty: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label>
      </div>
      <button type="button" className="m-btn" disabled={!item.name.trim() || !(Number(item.amount) > 0)} onClick={() => onAdd({ name: item.name.trim(), amount: Number(item.amount), qty: item.qty })}>Add item</button>
    </Sheet>
  );
}

function DiscountSheet({ onApply, onClose }) {
  const [d, setD] = useState({ type: "PERCENT", value: "" });
  return (
    <Sheet title="Discount" onClose={onClose}>
      <div className="m-seg">
        <button type="button" aria-pressed={d.type === "PERCENT"} onClick={() => setD({ ...d, type: "PERCENT" })}>Percent</button>
        <button type="button" aria-pressed={d.type === "AMOUNT"} onClick={() => setD({ ...d, type: "AMOUNT" })}>Amount</button>
      </div>
      <div className="m-chips m-gap-b">{d.type === "PERCENT" && [10, 15, 20, 50].map((p) => <button key={p} type="button" className="m-chip" onClick={() => onApply({ type: "PERCENT", value: p })}>{p}%</button>)}</div>
      <label className="m-field"><span>{d.type === "PERCENT" ? "Percent off" : "Amount off ($)"}</span><input className="m-input" inputMode="decimal" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value.replace(/[^\d.]/g, "") })} /></label>
      <button type="button" className="m-btn" disabled={!(Number(d.value) > 0)} onClick={() => onApply({ type: d.type, value: Number(d.value) })}>Apply discount</button>
    </Sheet>
  );
}

function Done({ result, client, onNew }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (result.url) QRCode.toString(result.url, { type: "svg", margin: 1, width: 220 }).then(setQr).catch(() => setQr(""));
  }, [result.url]);
  return (
    <main className="m-main">
      <div className="m-head"><h1>{result.url ? "Ready to pay" : "Payment saved"}</h1></div>
      {result.url ? (
        <>
          <p className="m-sub">Ask {client?.name || "the client"} to scan this code with their phone camera to pay {dollars(result.totalCents)} by card, Apple Pay or Google Pay.</p>
          {/* Generated locally from the Stripe link; contains no script. */}
          <div className="m-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="m-btns">
            <a className="m-btn" href={result.url} target="_blank" rel="noopener noreferrer"><Icon name="card" size={20} /> Open payment page on this phone</a>
            <button type="button" className="m-btn ghost" onClick={onNew}>New checkout</button>
          </div>
          <p className="m-sub m-gap">The payment link stays open for 24 hours. When the client pays, it is added to your books and payouts automatically.</p>
        </>
      ) : (
        <>
          <div className="m-empty"><span className="m-orb green" style={{ margin: "0 auto" }}><Icon name="check" size={32} stroke={2.4} /></span><b>{dollars(result.totalCents)} recorded</b>Added to your books as income.</div>
          <button type="button" className="m-btn" onClick={onNew}>New checkout</button>
        </>
      )}
    </main>
  );
}
