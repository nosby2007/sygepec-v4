"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FILING_STATUSES, money } from "@/lib/constants";
import { intakeToEstimate } from "@/lib/tax";

const STEPS = ["About You", "Filing Status", "Dependents", "Income", "Deductions", "Refund", "Review"];

const INCOME = [
  ["w2Wages", "W-2 wages (total)"], ["w2Withheld", "Federal tax withheld (W-2 Box 2)"],
  ["selfEmployment", "Self-employment / 1099 profit"], ["interest", "Interest income"],
  ["dividends", "Dividend income"], ["unemployment", "Unemployment (1099-G)"],
  ["retirement", "Retirement / pension (1099-R)"], ["other", "Other income"],
];
const DEDUCTIONS = [
  ["mortgageInterest", "Mortgage interest (1098)"], ["propertyTax", "Property & state/local taxes"],
  ["charity", "Charitable donations"], ["studentLoan", "Student loan interest (1098-E)"],
  ["childcare", "Childcare / dependent care expenses"],
];

export default function IntakeWizard({ returnId, initial, locked }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState({
    personal: {}, filingStatus: "", dependents: [], income: {}, deductions: {}, refund: { method: "direct_deposit" }, ...initial,
  });
  const [state, setState] = useState({});
  const router = useRouter();

  const setIn = (section, key) => (e) => setD({ ...d, [section]: { ...d[section], [key]: e.target.value } });
  const save = async (submit = false) => {
    setState({ busy: true });
    const intake = { ...d, submitted: submit || d.submitted };
    const res = await fetch(`/api/returns/${returnId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intake }) });
    const data = await res.json();
    if (!res.ok) return setState({ error: data.error });
    setD(intake);
    setState({ saved: true });
    if (submit) {
      router.push("/portal/documents");
      router.refresh();
    }
  };
  const go = async (n) => {
    if (!locked) await save(false);
    setStep(n);
  };

  const Text = ({ section, k, label, type = "text", span, ...rest }) => (
    <div className={`field ${span ? "span-2" : ""}`}>
      <label htmlFor={`in-${k}`}>{label}</label>
      <input id={`in-${k}`} className="input" type={type} value={d[section]?.[k] ?? ""} onChange={setIn(section, k)} disabled={locked} {...rest} />
    </div>
  );
  const p = (k, label, opts) => Text({ section: "personal", k, label, ...opts });
  const est = intakeToEstimate(d);

  return (
    <div>
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={i === step ? "active" : i < step ? "done" : ""} onClick={() => go(i)}>
            {i < step ? "✓ " : `${i + 1}. `}{s}
          </button>
        ))}
      </div>
      {locked && <div className="alert alert-info" style={{ marginBottom: 16 }}>Your return has been filed. The questionnaire is read-only.</div>}

      <div key={step} className="card fade-in">
        {step === 0 && (
          <div className="grid-2">
            {p("firstName", "First name")}
            {p("lastName", "Last name")}
            {p("dob", "Date of birth", { type: "date" })}
            {p("ssnLast4", "Last 4 of SSN", { maxLength: 4, inputMode: "numeric", placeholder: "••••" })}
            {p("phone", "Phone")}
            {p("occupation", "Occupation")}
            {p("address", "Street address", { span: true })}
            {p("city", "City")}
            <div className="grid-2" style={{ gap: 16 }}>
              {p("state", "State", { maxLength: 2 })}
              {p("zip", "ZIP")}
            </div>
            <p className="hint span-2">🔒 For your security we only collect the last 4 digits of your SSN online. Your preparer will verify the full number at signing.</p>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <h3>What is your filing status?</h3>
            <div className="choice-grid">
              {FILING_STATUSES.map((f) => (
                <button key={f.key} type="button" disabled={locked} className={`choice ${d.filingStatus === f.key ? "active" : ""}`} onClick={() => setD({ ...d, filingStatus: f.key })}>{f.label}</button>
              ))}
            </div>
            {["MFJ", "MFS"].includes(d.filingStatus) && (
              <div className="grid-2">
                {Text({ section: "spouse", k: "name", label: "Spouse full name" })}
                {Text({ section: "spouse", k: "occupation", label: "Spouse occupation" })}
              </div>
            )}
            <p className="hint">Not sure? Choose your best guess and your preparer will confirm the most beneficial status.</p>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <div className="row between"><h3>Dependents</h3>
              {!locked && <button type="button" id="add-dependent" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, dependents: [...d.dependents, { name: "", relationship: "", age: "" }] })}>+ Add dependent</button>}
            </div>
            {d.dependents.length === 0 && <p className="small">No dependents added. Click “Add dependent” if you support children or relatives.</p>}
            {d.dependents.map((dep, i) => (
              <div key={i} className="grid-4" style={{ alignItems: "end" }}>
                {["name", "relationship", "age"].map((k) => (
                  <div key={k} className="field">
                    <label>{k[0].toUpperCase() + k.slice(1)}</label>
                    <input className="input" type={k === "age" ? "number" : "text"} disabled={locked} value={dep[k]} onChange={(e) => {
                      const deps = [...d.dependents]; deps[i] = { ...dep, [k]: e.target.value }; setD({ ...d, dependents: deps });
                    }} />
                  </div>
                ))}
                {!locked && <button type="button" className="btn btn-danger btn-sm" onClick={() => setD({ ...d, dependents: d.dependents.filter((_, j) => j !== i) })}>Remove</button>}
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h3>Income</h3>
            <p className="small">Enter approximate totals. Leave blank if it doesn&apos;t apply. Exact amounts come from your documents.</p>
            <div className="grid-2">{INCOME.map(([k, l]) => <div key={k}>{Text({ section: "income", k, label: l, type: "number", min: 0 })}</div>)}</div>
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            <h3>Deductions & credits</h3>
            <div className="grid-2">{DEDUCTIONS.map(([k, l]) => <div key={k}>{Text({ section: "deductions", k, label: l, type: "number", min: 0 })}</div>)}</div>
          </div>
        )}

        {step === 5 && (
          <div className="stack">
            <h3>How would you like your refund?</h3>
            <div className="choice-grid">
              {[["direct_deposit", "🏦 Direct deposit (fastest)"], ["check", "✉️ Paper check"], ["apply", "➡️ Apply to next year"]].map(([k, l]) => (
                <button key={k} type="button" disabled={locked} className={`choice ${d.refund.method === k ? "active" : ""}`} onClick={() => setD({ ...d, refund: { ...d.refund, method: k } })}>{l}</button>
              ))}
            </div>
            {d.refund.method === "direct_deposit" && (
              <div className="grid-2">
                {Text({ section: "refund", k: "accountLast4", label: "Last 4 of bank account", maxLength: 4, inputMode: "numeric" })}
                <p className="hint" style={{ alignSelf: "end" }}>Full routing & account numbers are collected securely at signing.</p>
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="stack">
            <h3>Review & submit</h3>
            <div className="grid-2">
              <div className="breakdown">
                <div><span>Name</span><b>{d.personal.firstName} {d.personal.lastName}</b></div>
                <div><span>Filing status</span><b>{FILING_STATUSES.find((f) => f.key === d.filingStatus)?.label || "—"}</b></div>
                <div><span>Dependents</span><b>{d.dependents.length}</b></div>
                <div><span>Refund method</span><b>{d.refund.method.replace("_", " ")}</b></div>
              </div>
              <div className="glass" style={{ padding: 22 }}>
                <div className="small muted">Preliminary estimate</div>
                <div className={`refund-num ${est.refund >= 0 ? "pos" : "neg"}`} style={{ fontSize: "2.4rem" }}>{money(Math.abs(est.refund))}</div>
                <div className="small muted">{est.refund >= 0 ? "estimated refund" : "estimated balance due"} · AGI {money(est.agi)}</div>
              </div>
            </div>
            {!d.filingStatus && <div className="alert alert-error">Please select a filing status before submitting.</div>}
          </div>
        )}

        {state.error && <div className="alert alert-error mt">{state.error}</div>}
        <div className="row between mt">
          <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>← Back</button>
          <span className="small muted">{state.busy ? "Saving…" : state.saved ? "✓ Saved" : ""}</span>
          {step < STEPS.length - 1 ? (
            <button type="button" id="intake-next" className="btn btn-primary" onClick={() => go(step + 1)}>Continue →</button>
          ) : (
            <button type="button" id="intake-submit" className="btn btn-primary" disabled={locked || !d.filingStatus || state.busy} onClick={() => save(true)}>
              {d.submitted ? "Save & Go to Documents" : "Submit Questionnaire"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
