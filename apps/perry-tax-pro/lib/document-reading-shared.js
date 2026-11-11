// Reading a tax form (W-2, 1099...) from an uploaded file to pre-fill its boxes. Pure
// functions shared by the server (prompt, schema, cleaning) and the tests.
//
// The reader returns only the boxes of that form type. Identity numbers are never asked
// for: no SSN, and only the last 4 digits of the payer's EIN. Every value is cleaned like
// a typed value, and the client checks each box before keeping it.
import { FORM_TYPES, moneyText, text } from "@/lib/intake-schema";

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
    ...def.fields.map(([k, label]) => [k, `${label}. Amount in U.S. dollars, digits and a decimal point only, no $ or commas, empty if blank`]),
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
  };
  for (const [k, description] of fields) properties[k] = { type: "string", description };
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export function readingPrompt(type) {
  const def = FORM_TYPES[type];
  return [
    `You read a U.S. tax document that should be Form ${def.label} (${def.title}) for tax year 2026 or the year shown.`,
    "Copy the requested boxes exactly as printed. Do not compute, guess or round. Leave a value empty when the box is blank or unreadable.",
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
  for (const [k] of def.fields) values[k] = moneyText(source[k]);
  for (const [k, , max] of def.text || []) values[k] = text(source[k], max);
  values.issuer = text(source.issuer, 100);
  values.issuerIdLast4 = String(source.issuerIdLast4 ?? "").replace(/\D/g, "").slice(-4);
  if (def.state) {
    const st = text(source.state, 2).toUpperCase();
    values.state = /^[A-Z]{2}$/.test(st) ? st : "";
  }
  const filled = def.fields.filter(([k]) => values[k] !== "").length;
  return { values, isThisForm: source.isThisForm === true, note: text(source.note, 200), filled };
}

// JSON can arrive wrapped in a code fence from some models.
export function parseJsonAnswer(textValue) {
  const s = String(textValue || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch { return null; }
}
