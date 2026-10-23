"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { computeEstimate } from "@/lib/tax";
import { FILING_STATUSES, money } from "@/lib/constants";

const NUM_FIELDS = [
  ["wages", "W-2 wages", "Box 1 of all W-2s"],
  ["withheld", "Federal tax withheld", "Box 2 of all W-2s"],
  ["selfEmployment", "Self-employment profit", "1099-NEC income minus expenses"],
  ["otherIncome", "Other income", "Interest, dividends, unemployment"],
  ["estimatedPayments", "Estimated payments made", "Quarterly 1040-ES payments"],
  ["studentLoan", "Student loan interest", "Up to $2,500"],
  ["itemized", "Itemized deductions", "Mortgage interest, SALT, charity"],
];

export default function Estimator() {
  const [v, setV] = useState({ filingStatus: "SINGLE", wages: 55000, withheld: 6000, childrenUnder17: 0, otherDependents: 0 });
  const r = useMemo(() => computeEstimate(v), [v]);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const pos = r.refund >= 0;

  return (
    <div className="est-grid">
      <div className="card stack">
        <div className="field">
          <label>Filing status</label>
          <div className="choice-grid">
            {FILING_STATUSES.map((f) => (
              <button type="button" key={f.key} id={`fs-${f.key}`} className={`choice ${v.filingStatus === f.key ? "active" : ""}`} onClick={() => setV({ ...v, filingStatus: f.key })}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2">
          {NUM_FIELDS.map(([k, l, h]) => (
            <div className="field" key={k}>
              <label htmlFor={`est-${k}`}>{l}</label>
              <input id={`est-${k}`} className="input" type="number" min="0" inputMode="decimal" value={v[k] ?? ""} placeholder="0" onChange={set(k)} />
              <span className="hint">{h}</span>
            </div>
          ))}
          <div className="field">
            <label htmlFor="est-kids">Children under 17</label>
            <input id="est-kids" className="input" type="number" min="0" max="15" value={v.childrenUnder17} onChange={set("childrenUnder17")} />
          </div>
          <div className="field">
            <label htmlFor="est-otherdeps">Other dependents</label>
            <input id="est-otherdeps" className="input" type="number" min="0" max="15" value={v.otherDependents} onChange={set("otherDependents")} />
          </div>
        </div>
      </div>

      <aside className="glass est-result" aria-live="polite">
        <div className="small muted">{pos ? "Estimated federal refund" : "Estimated amount owed"}</div>
        <div id="est-result" className={`refund-num ${pos ? "pos" : "neg"}`}>{money(Math.abs(r.refund))}</div>
        <div className="small muted">Effective rate {(r.effective * 100).toFixed(1)}% · Marginal bracket {(r.marginal * 100).toFixed(0)}%</div>
        <div className="meter"><span style={{ width: `${Math.min(100, (r.marginal / 0.37) * 100)}%` }} /></div>
        <div className="breakdown">
          <div><span>Adjusted gross income</span><b>{money(r.agi)}</b></div>
          <div><span>{r.deductionType} deduction</span><b>−{money(r.deduction)}</b></div>
          <div><span>Taxable income</span><b>{money(r.taxable)}</b></div>
          <div><span>Income tax</span><b>{money(r.incomeTax)}</b></div>
          {r.seTax > 0 && <div><span>Self-employment tax</span><b>{money(r.seTax)}</b></div>}
          <div><span>Credits</span><b>−{money(r.credits)}</b></div>
          <div><span>Total tax</span><b>{money(r.totalTax)}</b></div>
        </div>
        <Link href="/register" className="btn btn-primary btn-block mt">Let a pro maximize it →</Link>
        <p className="hint mt" style={{ marginTop: 14 }}>
          Simplified estimate using 2026 IRS brackets, standard deductions and Child Tax Credit. Excludes EITC, state taxes and
          other credits. Not tax advice.
        </p>
      </aside>
    </div>
  );
}
