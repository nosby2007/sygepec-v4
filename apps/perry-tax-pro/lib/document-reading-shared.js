// Reading a tax form (W-2, 1099...) from an uploaded file to pre-fill its boxes. Pure
// functions shared by the server (prompt, schema, cleaning) and the tests.
//
// The reader returns only the boxes of that form type. Identity numbers are never asked
// for: no SSN, and only the last 4 digits of the payer's EIN. Every value is cleaned like
// a typed value, and the client checks each box before keeping it.
import { FORM_TYPES, formAmounts, moneyText, text } from "@/lib/intake-schema";

export { READING_CONSENT as READING_CONSENT_VERSION } from "@/lib/intake-schema";
// Formats every reader accepts. HEIC photos are stored but filled by hand.
export const READABLE_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

// Fields the reader may fill for a form type, as [key, description].
export function readableFields(type) {
  const def = FORM_TYPES[type];
  if (!def) return null;
  return [
    ["issuer", def.issuerLabel],
    ["issuerIdLast4", "Last 4 digits of the payer's federal identification number (EIN), digits only, or empty"],
    ...(def.state ? [["state", "Two-letter U.S. state code shown on the form for state wages or withholding, or empty"]] : []),
    ...formAmounts(def).map(([k, label]) => [k, `${label}. Amount in U.S. dollars, digits and a decimal point only, no $ or commas, empty if blank`]),
    ...(def.text || []).map(([k, label]) => [k, label]),
  ];
}

// JSON schema the reader must answer with. Every value is a string so blank boxes stay
// blank instead of becoming 0.
export function readingSchema(type) {
  const fields = readableFields(type);
  if (!fields) return null;
  const properties = {
    isThisForm: { type: "boolean", description: `True only if the document is a Form ${FORM_TYPES[type].label}` },
    note: { type: "string", description: "Short note if a box was unreadable, or empty" },
    taxYear: { type: "string", description: "Tax year printed on the form, four digits, or empty if not printed" },
    confidence: { type: "string", enum: ["high", "medium", "low"], description: "How legible the document is: high (clear print), medium, low (blurry, cut off or handwritten)" },
  };
  for (const [k, description] of fields) properties[k] = { type: "string", description };
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export function readingPrompt(type) {
  const def = FORM_TYPES[type];
  return [
    `You read a U.S. tax document that should be Form ${def.label} (${def.title}) for tax year 2026 or the year shown.`,
    "Copy the requested boxes exactly as printed. Do not compute, guess or round.",
    "Each value must be the amount printed inside that box, next to its box number. If a box has no amount printed in it, its value is an empty string. Never repeat an amount from another box.",
    "Never return a Social Security number, a full employer identification number, an account number or a name of the employee.",
    "If the document has several copies of the same form (Copy B, C, 2), read one copy only.",
    "Answer only with the JSON object.",
  ].join("\n");
}

// Turns the reader's answer into form values, cleaned like a typed entry. Anything not
// in the field list is dropped.
export function cleanReading(type, raw) {
  const def = FORM_TYPES[type];
  const source = raw && typeof raw === "object" ? raw : {};
  const values = {};
  for (const [k] of formAmounts(def)) values[k] = moneyText(source[k]);
  for (const [k, , max] of def.text || []) values[k] = text(source[k], max);
  values.issuer = text(source.issuer, 100);
  values.issuerIdLast4 = String(source.issuerIdLast4 ?? "").replace(/\D/g, "").slice(-4);
  if (def.state) {
    const st = text(source.state, 2).toUpperCase();
    values.state = /^[A-Z]{2}$/.test(st) ? st : "";
  }
  // Withholding never equals the whole payment on a real form: a reader that repeats the
  // main amount in a withholding box misread the layout. Leave it for the client to type.
  const notes = [text(source.note, 200)].filter(Boolean);
  const main = def.main && Number(values[def.main]);
  for (const k of ["fedWithheld", "stateWithheld"]) {
    if (main > 0 && k in values && Number(values[k]) === main) {
      const label = def.fields.find(([f]) => f === k)?.[1] || k;
      values[k] = "";
      notes.push(`Check "${label}": it could not be read reliably.`);
    }
  }
  const filled = def.fields.filter(([k]) => values[k] !== "").length;
  const year = String(source.taxYear ?? "").trim();
  return {
    values, isThisForm: source.isThisForm === true, note: notes.join(" ").slice(0, 300), filled,
    taxYear: /^20\d{2}$/.test(year) ? year : "",
    confidence: ["high", "medium", "low"].includes(source.confidence) ? source.confidence : "",
  };
}

// JSON can arrive wrapped in a code fence from some models.
export function parseJsonAnswer(textValue) {
  const s = String(textValue || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch { return null; }
}

// Forms the reader can recognise from a file dropped anywhere in the questionnaire.
export const DETECTABLE_TYPES = ["W2", "1099NEC", "1099K", "1099INT", "1099DIV", "1099B", "1099G", "1099R", "SSA1099", "1098", "1098E", "1098T", "1095A", "K1", "1099MISC", "UNKNOWN"];

export function classifySchema() {
  return {
    type: "object",
    properties: {
      formType: { type: "string", enum: DETECTABLE_TYPES, description: "The IRS form this document is. UNKNOWN if none of the list or unreadable." },
    },
    required: ["formType"],
    additionalProperties: false,
  };
}

export function classifyPrompt() {
  return [
    "Which U.S. tax form is this document? Look at the form number printed on it.",
    "W2 = Form W-2. 1099NEC, 1099K, 1099INT, 1099DIV, 1099B, 1099G, 1099R = those Forms 1099. SSA1099 = Social Security benefit statement.",
    "1098 = mortgage interest, 1098E = student loan interest, 1098T = tuition, 1095A = Health Insurance Marketplace statement, K1 = Schedule K-1, 1099MISC = Form 1099-MISC.",
    "A consolidated brokerage statement with dividends, interest and sales: choose 1099B. Anything else: UNKNOWN.",
    "Answer only with the JSON object.",
  ].join("\n");
}

// Document type (upload list) for each form type.
export const FORM_DOC_TYPE = { W2: "W2", "1099NEC": "1099NEC", "1099K": "1099NEC", "1099INT": "1099INT", "1099DIV": "1099DIV", "1099B": "1099B", "1099G": "1099G", "1099R": "1099R", SSA1099: "SSA1099", 1098: "1098", "1098E": "1098E", "1098T": "1098T", "1095A": "1095A", K1: "K1", RENTAL: "RENTAL", "1099MISC": "1099MISC" };
