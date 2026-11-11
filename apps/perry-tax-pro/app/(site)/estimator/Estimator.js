"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { computeEstimate } from "@/lib/tax";
import { FILING_STATUSES, money } from "@/lib/constants";
import Icon from "@/components/Icon";
import { MoneyCount } from "@/components/Motion";
import { Donut, PALETTE } from "@/components/charts";

const NUM_FIELDS = [
  ["wages", "W-2 wages", "Box 1 of all W-2s", "briefcase"],
  ["withheld", "Federal tax withheld", "Box 2 of all W-2s", "bank"],
  ["selfEmployment", "Self-employment profit", "1099-NEC income minus expenses", "car"],
  ["otherIncome", "Other income", "Interest, dividends, unemployment", "dollar"],
  ["estimatedPayments", "Estimated payments made", "Quarterly 1040-ES payments", "calendar"],
  ["studentLoan", "Student loan interest", "Up to $2,500", "book"],
  ["itemized", "Itemized deductions", "Mortgage interest, SALT, charity", "home"],
];
const BRACKETS = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

export default function Estimator() {
  const [v, setV] = useState({ filingStatus: "SINGLE", wages: 55000, withheld: 6000, childrenUnder17: 0, otherDependents: 0 });
  const r = useMemo(() => computeEstimate(v), [v]);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const step = (k, d) => setV({ ...v, [k]: Math.max(0, Math.min(15, (Number(v[k]) || 0) + d)) });
  const pos = r.refund >= 0;
  const incomeTaxNet = Math.max(0, r.totalTax - r.seTax);
  const segments = [
    { label: "Income tax", value: incomeTaxNet, color: PALETTE.blue, display: money(incomeTaxNet) },
    { label: "Self-employment tax", value: r.seTax, color: PALETTE.violet, display: money(r.seTax) },
    { label: pos ? "Your refund" : "Balance due", value: Math.abs(r.refund), color: pos ? PALETTE.teal : PALETTE.rose, display: money(Math.abs(r.refund)) },
  ];

  return (
    <div className="est-grid">
      <div className="card stack">
        <div className="field">
          <label>Filing status</label>
          <div className="choice-grid">
            {FILING_STATUSES.map((f) => (
              <button type="button" key={f.key} id={`fs-${f.key}`} className={`choice ${v.filingStatus === f.key ? "active" : ""}`} onClick={() => setV({ ...v, filingStatus: f.key })}>
                <span className={`check ${v.filingStatus === f.key ? "ok" : ""}`} style={{ borderRadius: "50%", width: 18, height: 18, fontSize: "0.6rem" }}>{v.filingStatus === f.key ? "✓" : ""}</span>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2">
          {NUM_FIELDS.map(([k, l, h, icon]) => (
            <div className="field" key={k}>
              <label htmlFor={`est-${k}`}>{l}</label>
              <div className="input-icon"><Icon name={icon} size={16} /><input id={`est-${k}`} className="input num" type="number" min="0" inputMode="decimal" value={v[k] ?? ""} placeholder="0" onChange={set(k)} /></div>
              <span className="hint">{h}</span>
            </div>
          ))}
          {[["childrenUnder17", "est-kids", "Children under 17"], ["otherDependents", "est-otherdeps", "Other dependents"]].map(([k, id, l]) => (
            <div className="field" key={k}>
              <label htmlFor={id}>{l}</label>
              <div className="row nowrap">
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => step(k, -1)} aria-label={`Decrease ${l}`}>−</button>
                <input id={id} className="input num center" type="number" min="0" max="15" value={v[k]} onChange={set(k)} />
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => step(k, 1)} aria-label={`Increase ${l}`}><Icon name="plus" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="glass est-result glow-border" aria-live="polite">
        <div className="row between">
          <div className="small muted">{pos ? "Estimated federal refund" : "Estimated amount owed"}</div>
          <span className={`pill ${pos ? "up" : "down"}`}><Icon name={pos ? "trending" : "alert"} size={13} />{pos ? "Refund" : "Owed"}</span>
        </div>
        <div id="est-result" className={`refund-num ${pos ? "pos" : "neg"}`}><MoneyCount value={Math.abs(r.refund)} /></div>
        <div className="small muted">Effective rate {(r.effective * 100).toFixed(1)}% · Marginal bracket {(r.marginal * 100).toFixed(0)}%</div>

        <div className="brackets" aria-hidden="true">
          {BRACKETS.map((b, i) => (
            <span key={b} className={`${b <= r.marginal ? "on" : ""} ${b === r.marginal ? "current" : ""}`} style={{ height: `${30 + i * 11}%` }} title={`${b * 100}% bracket`} />
          ))}
        </div>
        <div className="brackets-lbl">{BRACKETS.map((b) => <span key={b}>{Math.round(b * 100)}%</span>)}</div>

        <div className="est-visual">
          <Donut size={128} thickness={16} segments={segments} center={`${(r.effective * 100).toFixed(0)}%`} sub="effective" label="Tax and refund composition" />
          <div className="legend vertical" style={{ flex: 1 }}>
            {segments.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}<b>{s.display}</b></span>)}
          </div>
        </div>

        <div className="breakdown">
          <div><span>Adjusted gross income</span><b>{money(r.agi)}</b></div>
          <div><span>{r.deductionType} deduction</span><b>−{money(r.deduction)}</b></div>
          <div><span>Taxable income</span><b>{money(r.taxable)}</b></div>
          <div><span>Income tax</span><b>{money(r.incomeTax)}</b></div>
          {r.seTax > 0 && <div><span>Self-employment tax</span><b>{money(r.seTax)}</b></div>}
          <div><span>Credits</span><b>−{money(r.credits)}</b></div>
          <div><span>Total tax</span><b>{money(r.totalTax)}</b></div>
        </div>
        <Link href="/register" className="btn btn-primary btn-block mt">Let a pro maximize it <Icon name="arrow" size={16} className="icon-arrow" /></Link>
        <p className="hint mt" style={{ marginTop: 14 }}>
          Simplified estimate using 2026 IRS brackets, standard deductions and Child Tax Credit. Excludes EITC, state taxes and
          other credits. Not tax advice.
        </p>
      </aside>
    </div>
  );
}
