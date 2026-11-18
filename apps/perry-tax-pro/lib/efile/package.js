// From an approved calculation to a submission package:
//
//   approved calculation -> return data -> schema adapter -> XML -> schema validation
//   -> business rules -> package (hash, idempotency key)
//
// The IRS distributes the Modernized e-File schemas and business rules to registered
// software developers through e-Services. They are not in this repository, and nothing
// here imitates them: no IRS namespace, element name, rule number or endpoint is written
// from memory. Until the official package for the tax year is installed, the only
// adapter is the sandbox adapter below, with its own clearly named format, so the whole
// chain can be exercised and tested without pretending to speak MeF.
import crypto from "node:crypto";
import { EfileError } from "@/lib/efile/states";
import { GEORGIA_RULES, georgiaSandboxAdapter, georgiaSchemaStatus, georgiaStepForLine, officialGeorgiaAdapter } from "@/lib/efile/georgia";

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- Schema adapters ---------------------------------------------------------------------

// An adapter turns return data into the XML of one schema version and validates it.
//   id, taxYear, official, namespace, root
//   elementFor(lineId) -> element name, or null when the schema has no such line
//   lineFor(elementName) -> line id (to map an error back to a field)
const SANDBOX_NS = "urn:innovatax:sandbox:return";
export function sandboxAdapter(taxYear = 2026) {
  const name = (id) => `Line_${String(id).replace(/[^A-Za-z0-9]/g, "_")}`;
  return {
    id: `INNOVATAX-SANDBOX-${taxYear}`,
    jurisdiction: "US",
    taxYear,
    official: false,
    namespace: `${SANDBOX_NS}:${taxYear}`,
    root: "SandboxReturn",
    elementFor: (lineId) => (/^[A-Za-z0-9.]+$/.test(lineId) ? name(lineId) : null),
    lineFor: (element) => (element.startsWith("Line_") ? element.slice(5).replace(/_/g, ".") : null),
  };
}

// The official IRS schema package for a tax year, once installed. Installing it means:
// obtain the package from e-Services, add an adapter built from its XSD files, and
// register it here with the exact package version. Until then this returns null.
const OFFICIAL_ADAPTERS = {};
// Each jurisdiction has its own schema: Georgia's lives in lib/efile/georgia.js.
export const officialAdapter = (taxYear, jurisdiction = "US") => (jurisdiction === "GA" ? officialGeorgiaAdapter(taxYear) : jurisdiction === "US" ? OFFICIAL_ADAPTERS[Number(taxYear)] || null : null);

// The sandbox adapter of a jurisdiction. A jurisdiction without one cannot be packaged.
export function sandboxAdapterFor(jurisdiction = "US", taxYear = 2026) {
  if (jurisdiction === "US") return sandboxAdapter(taxYear);
  if (jurisdiction === "GA") return georgiaSandboxAdapter(taxYear);
  throw new EfileError(`Electronic filing for ${jurisdiction} is not supported.`, 409, "EFILE_NO_ADAPTER");
}

export function schemaPackageStatus(taxYear = 2026, jurisdiction = "US") {
  if (jurisdiction === "GA") return georgiaSchemaStatus(taxYear);
  const adapter = officialAdapter(taxYear);
  return {
    installed: Boolean(adapter),
    adapterId: adapter?.id || null,
    expected: `IRS Form 1040 series schema and business rules for tax year ${taxYear}`,
    note: adapter ? "" : "Not installed. The package is released to registered software developers through IRS e-Services; versions change through the year and each must be approved for testing and for production.",
  };
}

// ---- Return data -------------------------------------------------------------------------

const FORM_OF_PREFIX = { 1040: "Form 1040", S1: "Schedule 1", S2: "Schedule 2", S3: "Schedule 3", A: "Schedule A", D: "Schedule D", E: "Schedule E", "1A": "Schedule 1-A", 8962: "Form 8962", 500: "Georgia Form 500" };

// Neutral description of the return, built only from the frozen calculation.
export function buildReturnData({ returnId, taxYear, intake = {}, calculation, fingerprint, jurisdiction = "US", linkedFederalRef = "" }) {
  if (!calculation?.federal?.lines) throw new EfileError("There is no approved calculation to package.", 409, "EFILE_NO_CALCULATION");
  const source = jurisdiction === "US" ? calculation.federal : (calculation.states || []).find((s) => s.code === jurisdiction);
  if (!source) throw new EfileError(`There is no approved ${jurisdiction} calculation to package.`, 409, "EFILE_NO_CALCULATION");
  const p = intake.personal || {};
  const groups = new Map();
  for (const [id, value] of Object.entries(source.lines)) {
    if (!Number.isFinite(value) || id.endsWith("ratio")) continue;
    const form = (jurisdiction === "US" ? FORM_OF_PREFIX[id.split(".")[0]] : null) || (jurisdiction === "US" ? "Worksheets" : source.form || `${jurisdiction} return`);
    if (!groups.has(form)) groups.set(form, []);
    groups.get(form).push({ id, value });
  }
  return {
    header: {
      returnId, taxYear: Number(taxYear), jurisdiction,
      returnType: jurisdiction === "US" ? "1040" : source.form,
      ruleSet: `${source.ruleSet?.id || ""}@${source.ruleSet?.version || ""}`,
      filingStatus: intake.filingStatus || "",
      fingerprint: fingerprint || "",
      // A state return names the federal submission it is linked to and repeats the
      // federal figure it starts from.
      ...(jurisdiction === "US" ? {} : { linkedFederalRef, federalAgi: Math.round(calculation.federal.lines["1040.11"] || 0) }),
      // Full identification numbers are never stored by this application. A real
      // transmission takes them from a secure store at send time.
      filer: { firstName: p.firstName || "", lastName: p.lastName || "", idLast4: p.ssnLast4 || "", state: p.state || "", zip: p.zip || "" },
      spouse: ["MFJ", "QSS"].includes(intake.filingStatus) ? { name: intake.spouse?.name || "", idLast4: intake.spouse?.ssnLast4 || "" } : null,
      dependents: (intake.dependents || []).map((d) => ({ name: d.name || "", relationship: d.relationship || "", idLast4: d.ssnLast4 || "" })),
    },
    forms: [...groups.entries()].map(([form, lines]) => ({ form, lines })),
  };
}

// ---- XML ---------------------------------------------------------------------------------

export function renderXml(data, adapter) {
  const h = data.header;
  if (Number(adapter.taxYear) !== Number(h.taxYear)) throw new EfileError(`Schema ${adapter.id} is for ${adapter.taxYear}, the return is for ${h.taxYear}.`, 409, "EFILE_YEAR_MISMATCH");
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<${adapter.root} xmlns="${esc(adapter.namespace)}" schema="${esc(adapter.id)}">`];
  out.push("  <Header>");
  for (const k of ["returnId", "taxYear", "jurisdiction", "returnType", "ruleSet", "filingStatus", "fingerprint"]) out.push(`    <${k}>${esc(h[k])}</${k}>`);
  out.push(`    <Filer firstName="${esc(h.filer.firstName)}" lastName="${esc(h.filer.lastName)}" idLast4="${esc(h.filer.idLast4)}" state="${esc(h.filer.state)}" zip="${esc(h.filer.zip)}"/>`);
  if (h.linkedFederalRef !== undefined) out.push(`    <LinkedFederal ref="${esc(h.linkedFederalRef)}" federalAgi="${esc(h.federalAgi)}"/>`);
  if (h.spouse) out.push(`    <Spouse name="${esc(h.spouse.name)}" idLast4="${esc(h.spouse.idLast4)}"/>`);
  for (const d of h.dependents) out.push(`    <Dependent name="${esc(d.name)}" relationship="${esc(d.relationship)}" idLast4="${esc(d.idLast4)}"/>`);
  out.push("  </Header>");
  for (const f of data.forms) {
    out.push(`  <Form name="${esc(f.form)}">`);
    for (const line of f.lines) {
      const el = adapter.elementFor(line.id);
      if (!el) throw new EfileError(`Schema ${adapter.id} has no element for line ${line.id}.`, 409, "EFILE_UNMAPPED_LINE");
      out.push(`    <${el}>${Math.round(line.value)}</${el}>`);
    }
    out.push("  </Form>");
  }
  out.push(`</${adapter.root}>`);
  return out.join("\n");
}

// Reads the XML this module writes: tags, attributes and text, with a well-formedness
// check. It is not a general XML parser and is used only for the sandbox schema. An
// official schema is validated against its XSD files by the official adapter.
export function parseXml(xml) {
  const errors = [];
  const stack = [];
  const nodes = [];
  const text = String(xml || "").replace(/^<\?xml[^>]*\?>\s*/, "");
  const re = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g;
  let m, last = 0;
  while ((m = re.exec(text))) {
    if (m.index !== last) { errors.push({ code: "XML_MALFORMED", message: `Unexpected text near position ${last}.` }); break; }
    last = re.lastIndex;
    if (m[5] !== undefined) { if (m[5].trim() && stack.length) stack[stack.length - 1].text += m[5].trim(); else if (m[5].trim()) errors.push({ code: "XML_MALFORMED", message: "Text outside the root element." }); continue; }
    const [, closing, name, attrText, selfClosing] = m;
    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name) { errors.push({ code: "XML_MALFORMED", message: `Closing tag </${name}> does not match <${open?.name || "nothing"}>.` }); break; }
      continue;
    }
    const attrs = Object.fromEntries([...attrText.matchAll(/([\w:.-]+)="([^"<]*)"/g)].map((a) => [a[1], a[2]]));
    const node = { name, attrs, text: "", path: [...stack.map((s) => s.name), name].join("/"), parent: stack[stack.length - 1] || null };
    nodes.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (!errors.length && last !== text.trimEnd().length && text.slice(last).trim()) errors.push({ code: "XML_MALFORMED", message: "The document could not be read to the end." });
  if (!errors.length && stack.length) errors.push({ code: "XML_MALFORMED", message: `<${stack[stack.length - 1].name}> is never closed.` });
  return { nodes, errors };
}

// Schema validation for the sandbox schema.
export function validateXml(xml, adapter) {
  if (adapter.official) return adapter.validate(xml);
  const { nodes, errors } = parseXml(xml);
  if (errors.length) return { ok: false, errors };
  const err = (code, message, path = "") => errors.push({ code, message, path });
  const root = nodes[0];
  if (!root || root.name !== adapter.root) err("SCHEMA_ROOT", `The root element must be <${adapter.root}>.`);
  else if (root.attrs.xmlns !== adapter.namespace) err("SCHEMA_NAMESPACE", `The namespace must be ${adapter.namespace}.`);
  const find = (path) => nodes.filter((x) => x.path === path);
  for (const k of ["returnId", "taxYear", "jurisdiction", "returnType", "filingStatus", "fingerprint"]) if (find(`${adapter.root}/Header/${k}`).length !== 1) err("SCHEMA_REQUIRED", `Header element <${k}> must appear once.`, `Header/${k}`);
  if (adapter.jurisdiction && adapter.jurisdiction !== "US" && find(`${adapter.root}/Header/LinkedFederal`).length !== 1) err("SCHEMA_REQUIRED", "Header element <LinkedFederal> must appear once.", "Header/LinkedFederal");
  if (find(`${adapter.root}/Header/Filer`).length !== 1) err("SCHEMA_REQUIRED", "Header element <Filer> must appear once.", "Header/Filer");
  if (!find(`${adapter.root}/Form`).length) err("SCHEMA_REQUIRED", "At least one <Form> is required.", "Form");
  const seen = new Set();
  for (const node of nodes.filter((x) => x.parent?.name === "Form")) {
    const lineId = adapter.lineFor(node.name);
    const path = `Form[${node.parent.attrs.name}]/${node.name}`;
    if (!lineId) err("SCHEMA_UNKNOWN_ELEMENT", `<${node.name}> is not part of the schema.`, path);
    if (!/^-?\d+$/.test(node.text)) err("SCHEMA_TYPE", `<${node.name}> must be a whole dollar amount.`, path);
    if (seen.has(path)) err("SCHEMA_DUPLICATE", `<${node.name}> appears twice.`, path);
    seen.add(path);
  }
  return { ok: errors.length === 0, errors };
}

// ---- Business rules ----------------------------------------------------------------------

// InnovaTax's own consistency rules, with their own identifiers. They are not the IRS
// business rules, which come with the official package and are run by its adapter.
const line = (data, id) => data.forms.flatMap((f) => f.lines).find((l) => l.id === id)?.value ?? 0;
const RULES = [
  ["IX-ID-001", "The taxpayer's first and last name are required.", (d) => d.header.filer.firstName && d.header.filer.lastName, "Header/Filer", "name"],
  ["IX-ID-002", "The last four digits of the taxpayer's identification number are required.", (d) => /^\d{4}$/.test(d.header.filer.idLast4), "Header/Filer", "ssn"],
  ["IX-ID-003", "A joint return needs the spouse's name.", (d) => !d.header.spouse || d.header.spouse.name, "Header/Spouse", "spouse"],
  ["IX-ID-004", "Every dependent needs a name and a relationship.", (d) => d.header.dependents.every((x) => x.name && x.relationship), "Header/Dependent", "dependents"],
  ["IX-FS-001", "The filing status is missing or unknown.", (d) => ["SINGLE", "MFJ", "MFS", "HOH", "QSS"].includes(d.header.filingStatus), "Header/filingStatus", "filing-status"],
  ["IX-SNAP-001", "The package must carry the fingerprint of the approved answers.", (d) => /^[0-9a-f]{64}$/.test(d.header.fingerprint), "Header/fingerprint", ""],
  ["IX-MATH-001", "Total income must equal the sum of the income lines.", (d) => d.header.jurisdiction !== "US" || line(d, "1040.9") === ["1040.1a", "1040.2b", "1040.3b", "1040.4b", "1040.5b", "1040.6b", "1040.7", "1040.8"].reduce((t, k) => t + line(d, k), 0), "1040.9", "income-summary"],
  ["IX-MATH-002", "Adjusted gross income must equal total income less adjustments.", (d) => d.header.jurisdiction !== "US" || line(d, "1040.11") === line(d, "1040.9") - line(d, "1040.10"), "1040.11", "federal-summary"],
  ["IX-MATH-003", "Total tax must equal tax after credits plus other taxes.", (d) => d.header.jurisdiction !== "US" || line(d, "1040.24") === line(d, "1040.22") + line(d, "1040.23"), "1040.24", "federal-summary"],
  ["IX-MATH-004", "A return shows a refund or an amount owed, never both.", (d) => d.header.jurisdiction !== "US" || !(line(d, "1040.34") > 0 && line(d, "1040.37") > 0), "1040.34", "federal-summary"],
  ["IX-MATH-005", "Refund or amount owed must equal payments less total tax.", (d) => d.header.jurisdiction !== "US" || line(d, "1040.34") - line(d, "1040.37") === line(d, "1040.33") - line(d, "1040.24"), "1040.34", "federal-summary"],
  ["IX-MATH-006", "No amount may be negative on a line that cannot be.", (d) => d.header.jurisdiction !== "US" || ["1040.15", "1040.16", "1040.24", "1040.33"].every((k) => line(d, k) >= 0), "1040.15", "federal-summary"],
];

export function runBusinessRules(data) {
  const errors = [];
  const rules = data.header.jurisdiction === "GA" ? [...RULES, ...GEORGIA_RULES] : RULES;
  for (const [rule, message, ok, path, step] of rules) {
    let passed = false;
    try { passed = Boolean(ok(data)); } catch { passed = false; }
    if (!passed) errors.push({ code: rule, message, path, lineId: /^\d|^[SADE]\d?\./.test(path) ? path : "", step });
  }
  return { ok: errors.length === 0, errors, rulesRun: rules.length };
}

// ---- Package and identity ----------------------------------------------------------------

// One submission per return, year, jurisdiction and approved answers: building the
// package twice gives the same key, so it can never be created or sent twice.
export function idempotencyKey({ returnId, taxYear, jurisdiction = "US", fingerprint }) {
  if (!returnId || !fingerprint) throw new EfileError("A submission needs a return and an approved fingerprint.", 409, "EFILE_NO_FINGERPRINT");
  return sha256(["innovatax-efile", returnId, taxYear, jurisdiction, fingerprint].join("|"));
}

// The submission reference of a package, from its key.
const refOf = (key, official) => `${official ? "" : "SBX-"}${key.slice(0, 20)}`;

export function buildPackage(input, chosen = null) {
  const jurisdiction = input.jurisdiction || "US";
  // A missing calculation is the clearer error, so it is checked before the adapter.
  if (!chosen) buildReturnData(input);
  const adapter = chosen || sandboxAdapterFor(jurisdiction, input.taxYear);
  if ((adapter.jurisdiction || "US") !== jurisdiction) throw new EfileError(`Schema ${adapter.id} is not for ${jurisdiction}.`, 409, "EFILE_ADAPTER_MISMATCH");
  // A state package is linked to the federal submission for the same approved figures,
  // whose reference is known before it is built.
  const linkedFederalRef = jurisdiction === "US" ? undefined : refOf(idempotencyKey({ returnId: input.returnId, taxYear: input.taxYear, jurisdiction: "US", fingerprint: input.fingerprint }), adapter.official);
  const data = buildReturnData({ ...input, ...(linkedFederalRef ? { linkedFederalRef } : {}) });
  const xml = renderXml(data, adapter);
  const schema = validateXml(xml, adapter);
  const rules = runBusinessRules(data);
  const key = idempotencyKey({ returnId: input.returnId, taxYear: input.taxYear, jurisdiction: data.header.jurisdiction, fingerprint: input.fingerprint });
  return {
    key,
    submissionRef: refOf(key, adapter.official),
    linkedFederalRef: linkedFederalRef || null,
    adapterId: adapter.id,
    official: adapter.official,
    jurisdiction: data.header.jurisdiction,
    taxYear: data.header.taxYear,
    xml,
    hash: sha256(xml),
    forms: data.forms.map((f) => f.form),
    valid: schema.ok && rules.ok,
    errors: [...schema.errors.map((e) => ({ ...e, kind: "SCHEMA" })), ...rules.errors.map((e) => ({ ...e, kind: "RULE" }))],
  };
}

// ---- Acknowledgements --------------------------------------------------------------------

// Which questionnaire screen fixes an error on a given line.
const STEP_OF_LINE = [[/^1040\.1/, "forms-W2"], [/^1040\.2/, "forms-1099INT"], [/^1040\.3/, "forms-1099DIV"], [/^1040\.[45]/, "forms-1099R"], [/^1040\.6/, "forms-SSA1099"], [/^(1040\.7|D\.)/, "forms-1099B"], [/^(1040\.12|A\.)/, "deduction-choice"], [/^(1040\.19|1040\.27|1040\.28)/, "dependents"], [/^1040\.25/, "income-summary"], [/^1040\.26/, "payments"], [/^8962/, "forms-1095A"], [/^S1\.(11|13|20|21)/, "expense-amounts"]];
export const stepForLine = (lineId) => (STEP_OF_LINE.find(([re]) => re.test(lineId || "")) || [null, ""])[1];

// Reads an acknowledgement. `expected` is the submission it must answer: an
// acknowledgement for another submission, or one that is not well-formed, establishes
// nothing. `authoritative` says whether the transport that delivered it is the real
// receiver; a sandbox acknowledgement is never an IRS acceptance.
export function parseAcknowledgement(raw, { expected, adapter, authoritative = false }) {
  const { nodes, errors } = parseXml(raw);
  const root = nodes[0];
  const fail = (reason) => ({ verified: false, status: null, reason, errors: [] });
  if (errors.length || !root || root.name !== "Acknowledgement") return fail("The acknowledgement could not be read.");
  if (root.attrs.submissionRef !== expected.submissionRef) return fail("The acknowledgement is for another submission.");
  if (root.attrs.packageHash && root.attrs.packageHash !== expected.hash) return fail("The acknowledgement does not match the package that was sent.");
  const status = root.attrs.status === "Accepted" ? "ACCEPTED" : root.attrs.status === "Rejected" ? "REJECTED" : null;
  if (!status) return fail("The acknowledgement has no acceptance status.");
  const stepFor = adapter.jurisdiction === "GA" ? georgiaStepForLine : stepForLine;
  const list = nodes.filter((x) => x.name === "Error").map((x) => {
    const lineId = x.attrs.path ? adapter.lineFor(x.attrs.path.split("/").pop()) || "" : "";
    return { code: x.attrs.code || "UNKNOWN", category: x.attrs.category || "", message: x.text || x.attrs.message || "", path: x.attrs.path || "", lineId, step: stepFor(lineId) || x.attrs.step || "" };
  });
  if (status === "REJECTED" && !list.length) return fail("A rejection must name at least one error.");
  return { verified: true, authoritative, status, receivedAt: root.attrs.timestamp || "", errors: list };
}
