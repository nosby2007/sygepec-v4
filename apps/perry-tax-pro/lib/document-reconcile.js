// Reconciles the forms typed in the questionnaire with the uploaded documents and with
// what the automatic reading found in them. Pure functions.
//
// The reading never overwrites an answer: it fills an empty form once, the client checks
// every box, and from then on a difference between the document and the answer is only
// reported here, for a person to decide.
import { FORM_TYPES, formAmounts } from "@/lib/intake-schema";
import { FORM_DOC_TYPE } from "@/lib/document-reading-shared";

const num = (v) => Number(v) || 0;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const money = (v) => `$${Math.round(num(v)).toLocaleString("en-US")}`;
const READ_DOC_TYPES = new Set(Object.values(FORM_DOC_TYPE));

export function reconcileDocuments(intake = {}, documents = [], { taxYear = 2026 } = {}) {
  const out = [];
  const forms = intake.forms || [];
  const docs = documents || [];
  const byId = new Map(docs.map((d) => [d.id, d]));
  const push = (level, code, message, why, extra = {}) => out.push({ level, code, message, why, layer: 5, ...extra });

  // The same paper form entered twice.
  const seen = new Map();
  for (const f of forms) {
    const def = FORM_TYPES[f.type];
    if (!def?.main || !num(f[def.main])) continue;
    const key = `${f.type}|${norm(f.issuer)}|${num(f[def.main])}|${f.owner}`;
    if (seen.has(key)) push("ALERT", `FORM_DUPLICATE_${f.id}`, `${def.label}${f.issuer ? ` from ${f.issuer}` : ""} appears twice with the same amount (${money(f[def.main])}).`, "A form entered twice doubles the income. Remove one, or confirm that these are two different forms.", { step: `forms-${f.type}`, form: def.label, field: def.main, action: "Remove the duplicate or mark this item as explained." });
    else seen.set(key, f.id);
  }

  // The same file uploaded twice.
  const files = new Map();
  for (const d of docs) {
    const key = `${norm(d.filename)}|${d.size}`;
    if (d.size && files.has(key)) push("WARNING", `DOCUMENT_DUPLICATE_${d.id}`, `"${d.filename}" was uploaded twice.`, "The same file may have been entered as two forms.", { step: "documents", action: "Remove the extra copy." });
    else files.set(key, d.id);
  }

  for (const f of forms) {
    const def = FORM_TYPES[f.type];
    const name = `${def.label}${f.issuer ? ` from ${f.issuer}` : ""}`;
    const doc = f.documentId ? byId.get(f.documentId) : null;
    // A form with amounts but no document behind it.
    if (!doc && FORM_DOC_TYPE[f.type] && formAmounts(def).some(([k]) => num(f[k]))) {
      push("WARNING", `FORM_NO_DOCUMENT_${f.id}`, `${name} has no uploaded document.`, "Your preparer checks every amount against its document.", { step: `forms-${f.type}`, form: def.label, action: "Upload the form, or link it to a file already uploaded." });
      continue;
    }
    const reading = doc?.reading;
    if (!reading) continue;
    if (reading.taxYear && Number(reading.taxYear) !== Number(taxYear)) push("ALERT", `DOCUMENT_WRONG_YEAR_${f.id}`, `${name}: the document is for ${reading.taxYear}, not ${taxYear}.`, "A form from another year does not belong on this return.", { step: `forms-${f.type}`, form: def.label, action: "Upload this year's form." });
    if (reading.formType && reading.formType !== f.type) push("ALERT", `DOCUMENT_WRONG_FORM_${f.id}`, `${name}: the linked document looks like a ${FORM_TYPES[reading.formType]?.label || reading.formType}.`, "The amounts may have been typed from the wrong document.", { step: `forms-${f.type}`, form: def.label, action: "Link the right document." });
    if (reading.formType !== f.type) continue;
    for (const [k, label] of formAmounts(def)) {
      const read = reading.values?.[k];
      if (read === "" || read == null) continue;
      if (Math.abs(num(read) - num(f[k])) >= 1) push("ALERT", `DOCUMENT_MISMATCH_${f.id}_${k}`, `${name}: "${label}" is ${money(f[k])} in the questionnaire but the document reads ${money(read)}.`, "One of the two is wrong. The answer is never changed automatically.", { step: `forms-${f.type}`, form: def.label, field: k, action: "Compare with the paper form and correct the answer, or mark the reading as wrong." });
    }
    if (reading.confidence === "low") push("INFO", `DOCUMENT_LOW_CONFIDENCE_${f.id}`, `${name}: the document was hard to read.`, "Check every box against the paper form.", { step: `forms-${f.type}`, form: def.label, action: "Check each amount." });
  }

  // Uploaded tax forms that no entry uses.
  const linked = new Set(forms.map((f) => f.documentId).filter(Boolean));
  for (const d of docs) {
    if (READ_DOC_TYPES.has(d.type) && !linked.has(d.id)) push("WARNING", `DOCUMENT_NOT_ENTERED_${d.id}`, `"${d.filename}" is uploaded but not linked to any form.`, "Income on a form that is not entered is left off the return.", { step: "documents", action: "Enter the form, or link it to the entry it belongs to." });
  }
  return out;
}
