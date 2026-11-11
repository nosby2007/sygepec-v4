import { test } from "node:test";
import assert from "node:assert/strict";
import { readingSchema, cleanReading, parseJsonAnswer, readingPrompt, readableFields } from "./document-reading-shared.js";
import { readFormFile, readerProvider, ReadingError } from "./document-reading.js";
import { sanitizeIntake, READING_CONSENT } from "./intake-schema.js";

test("schema lists only the boxes of the form, all required, nothing extra", () => {
  const s = readingSchema("W2");
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required.sort(), Object.keys(s.properties).sort());
  for (const k of ["issuer", "issuerIdLast4", "state", "wages", "fedWithheld", "stateWages", "stateWithheld", "isThisForm"]) assert.ok(k in s.properties, k);
  assert.ok(!Object.keys(s.properties).some((k) => /ssn|social|account/i.test(k)));
  assert.ok(!("state" in readingSchema("1099INT").properties));
  assert.equal(readingSchema("NOPE"), null);
  assert.match(readingPrompt("W2"), /Never return a Social Security number/);
  assert.ok(readableFields("1099R").some(([k]) => k === "code"));
});

test("answers are cleaned like typed values and unknown keys dropped", () => {
  const r = cleanReading("W2", { wages: "$52,340.17", fedWithheld: "5,100", stateWages: "", stateWithheld: "abc", issuer: "Demo Co", issuerIdLast4: "12-3456789", state: "tx", ssn: "123-45-6789", isThisForm: true, note: "" });
  assert.equal(r.values.wages, "52340.17");
  assert.equal(r.values.fedWithheld, "5100");
  assert.equal(r.values.stateWithheld, "");
  assert.equal(r.values.issuerIdLast4, "6789");
  assert.equal(r.values.state, "TX");
  assert.equal("ssn" in r.values, false);
  assert.equal(r.filled, 2);
  assert.equal(r.isThisForm, true);
});

test("JSON answers survive code fences", () => {
  assert.deepEqual(parseJsonAnswer("```json\n{\"a\":1}\n```"), { a: 1 });
  assert.equal(parseJsonAnswer("not json"), null);
});

const pdf = new TextEncoder().encode("%PDF-1.4 demo");
const okJson = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test("OpenAI: sends the file and reads the structured answer", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  let sent;
  const fetcher = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization };
    return { ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ isThisForm: true, note: "", issuer: "Demo Co", issuerIdLast4: "6789", state: "TX", wages: "41000", fedWithheld: "3900", stateWages: "", stateWithheld: "" }) }] }] }) };
  };
  const r = await readFormFile({ type: "W2", mime: "application/pdf", bytes: pdf, filename: "w2.pdf" }, { provider: "openai", fetcher });
  assert.equal(sent.url, "https://api.openai.com/v1/responses");
  assert.equal(sent.auth, "Bearer test-key");
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.text.format.type, "json_schema");
  assert.equal(sent.body.input[0].content[1].type, "input_file");
  assert.equal(r.values.wages, "41000");
  delete process.env.OPENAI_API_KEY;
});

test("Gemini: image request and answer", async () => {
  process.env.GEMINI_API_KEY = "g-key";
  let sent;
  const fetcher = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body), key: opts.headers["x-goog-api-key"] };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ isThisForm: false, note: "Blurry", issuer: "", issuerIdLast4: "", interest: "12.50", fedWithheld: "" }) }] } }] }) };
  };
  const r = await readFormFile({ type: "1099INT", mime: "image/png", bytes: pdf }, { provider: "gemini", fetcher });
  assert.match(sent.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/);
  assert.equal(sent.key, "g-key");
  assert.equal(sent.body.contents[0].parts[1].inline_data.mime_type, "image/png");
  assert.equal("additionalProperties" in sent.body.generationConfig.responseSchema, false);
  assert.equal(r.values.interest, "12.50");
  assert.equal(r.isThisForm, false);
  assert.equal(r.note, "Blurry");
  delete process.env.GEMINI_API_KEY;
});

test("refusals: no reader, unreadable type, provider error, empty answer", async () => {
  await assert.rejects(readFormFile({ type: "W2", mime: "application/pdf", bytes: pdf }, { provider: null }), (e) => e instanceof ReadingError && e.status === 409);
  await assert.rejects(readFormFile({ type: "W2", mime: "image/heic", bytes: pdf }, { provider: "openai", fetcher: okJson({}) }), /cannot be read/);
  await assert.rejects(readFormFile({ type: "W2", mime: "application/pdf", bytes: pdf }, { provider: "openai", fetcher: async () => ({ ok: false, status: 401, json: async () => ({}) }) }), (e) => e.status === 502);
  await assert.rejects(readFormFile({ type: "W2", mime: "application/pdf", bytes: pdf }, { provider: "openai", fetcher: okJson({ output: [] }) }), (e) => e.status === 422);
  await assert.rejects(readFormFile({ type: "W2", mime: "application/pdf", bytes: pdf }, { provider: "openai", fetcher: async () => { throw new TypeError("network"); } }), (e) => e.status === 502);
});

test("provider choice follows the keys", () => {
  delete process.env.OPENAI_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.DOCUMENT_READER;
  assert.equal(readerProvider(), null);
  process.env.GEMINI_API_KEY = "g";
  assert.equal(readerProvider(), "gemini");
  process.env.OPENAI_API_KEY = "o";
  assert.equal(readerProvider(), "openai");
  process.env.DOCUMENT_READER = "gemini";
  assert.equal(readerProvider(), "gemini");
  delete process.env.OPENAI_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.DOCUMENT_READER;
});

test("reading consent is versioned in the answers", () => {
  assert.equal(sanitizeIntake({ documentReading: { version: "old", at: "2026-11-11T00:00:00Z" } }).documentReading, null);
  assert.equal(sanitizeIntake({ documentReading: { version: READING_CONSENT, at: "2026-11-11T00:00:00Z" } }).documentReading.version, READING_CONSENT);
});

test("a withholding that repeats the payment is left blank with a note", () => {
  const r = cleanReading("1099INT", { interest: "312.44", fedWithheld: "312.44", issuer: "Bank", issuerIdLast4: "", isThisForm: true, note: "" });
  assert.equal(r.values.interest, "312.44");
  assert.equal(r.values.fedWithheld, "");
  assert.match(r.note, /Federal income tax withheld/);
  assert.equal(cleanReading("W2", { wages: "1000", fedWithheld: "100", isThisForm: true }).values.fedWithheld, "100");
});
