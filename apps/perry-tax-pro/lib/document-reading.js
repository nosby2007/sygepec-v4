import "server-only";
import { downloadObject, getDocument, mergeDocument, TAX_TENANT } from "@/lib/firebase";
import { FORM_TYPES } from "@/lib/intake-schema";
import { safeId } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { READABLE_MIME, DETECTABLE_TYPES, FORM_DOC_TYPE, cleanReading, classifyPrompt, classifySchema, parseJsonAnswer, readingPrompt, readingSchema } from "@/lib/document-reading-shared";

// Reads an uploaded tax form with an AI model (OCR and understanding in one step) to
// detect its type and pre-fill its boxes.
//
//   DOCUMENT_READER=vertex                    Gemini on Vertex AI in this Google Cloud
//                                             project, with the Cloud Run identity (no key;
//                                             the runtime account needs roles/aiplatform.user)
//   OPENAI_API_KEY (+ optional OPENAI_MODEL)  ChatGPT, through the Responses API
//   GEMINI_API_KEY (+ optional GEMINI_MODEL)  Google Gemini API with a key
//   DOCUMENT_READER=openai|gemini             which one, when several are available
//
// With none of them the feature is off and forms are filled by hand.

export class ReadingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const key = (name) => (process.env[name] || "").trim();
const PROJECT = () => key("GOOGLE_CLOUD_PROJECT") || key("NEXT_PUBLIC_FIREBASE_PROJECT_ID") || "sygepec-v4";
const LOCATION = () => key("VERTEX_LOCATION") || "global";
const GEMINI_MODEL = () => key("GEMINI_MODEL") || "gemini-3.5-flash";

export function readerProvider() {
  const wanted = key("DOCUMENT_READER").toLowerCase();
  const openai = Boolean(key("OPENAI_API_KEY")), gemini = Boolean(key("GEMINI_API_KEY"));
  if (wanted === "vertex") return "vertex";
  if (wanted === "gemini" && gemini) return "gemini";
  if (wanted === "openai" && openai) return "openai";
  return openai ? "openai" : gemini ? "gemini" : null;
}

export const READER_LABEL = { openai: "OpenAI (ChatGPT)", gemini: "Google Gemini", vertex: "Google Gemini (Google Cloud)" };

async function askOpenAI({ prompt, schema, mime, base64, filename }, { fetcher }) {
  const file = mime === "application/pdf"
    ? { type: "input_file", filename: filename || "document.pdf", file_data: `data:${mime};base64,${base64}` }
    : { type: "input_image", image_url: `data:${mime};base64,${base64}` };
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: key("OPENAI_MODEL") || "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, file] }],
      text: { format: { type: "json_schema", name: "tax_form", strict: true, schema } },
      store: false,
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReadingError(`The reading service refused the request (${response.status}).`, 502);
  const out = (data.output || []).flatMap((o) => o.content || []).find((c) => c.type === "output_text");
  return parseJsonAnswer(out?.text);
}

// Gemini's schema dialect has no additionalProperties.
const geminiSchema = (schema) => {
  const { additionalProperties: _a, ...rest } = schema;
  return rest;
};

const geminiBody = ({ prompt, schema, mime, base64 }) => JSON.stringify({
  contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
  generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema(schema), temperature: 0 },
});

const geminiText = (data) => parseJsonAnswer(data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join(""));

async function askGemini(input, { fetcher }) {
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL())}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key("GEMINI_API_KEY"), "Content-Type": "application/json" },
    body: geminiBody(input),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReadingError(`The reading service refused the request (${response.status}).`, 502);
  return geminiText(data);
}

async function askVertex(input, { fetcher, token }) {
  const bearer = token || await serviceToken(fetcher);
  const host = LOCATION() === "global" ? "aiplatform.googleapis.com" : `${LOCATION()}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${PROJECT()}/locations/${LOCATION()}/publishers/google/models/${encodeURIComponent(GEMINI_MODEL())}:generateContent`;
  const response = await fetcher(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: geminiBody(input),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 403) throw new ReadingError("Automatic reading is not available right now. Please type the amounts.", 503);
  if (!response.ok) throw new ReadingError(`The reading service refused the request (${response.status}).`, 502);
  return geminiText(data);
}

const ASK = { openai: askOpenAI, gemini: askGemini, vertex: askVertex };

async function ask(input, { provider = readerProvider(), fetcher = fetch, token } = {}) {
  if (!provider || !ASK[provider]) throw new ReadingError("Automatic reading is not set up. Please type the amounts.", 409);
  if (!READABLE_MIME.has(input.mime)) throw new ReadingError("This file type cannot be read automatically. Upload a PDF, JPG, PNG or WEBP, or type the amounts.");
  const base64 = Buffer.from(input.bytes).toString("base64");
  let answer;
  try {
    answer = await ASK[provider]({ ...input, base64 }, { fetcher, token });
  } catch (error) {
    if (error instanceof ReadingError) throw error;
    throw new ReadingError("The reading service did not answer. Please try again or type the amounts.", 502);
  }
  if (!answer) throw new ReadingError("The document could not be read. Please type the amounts.", 422);
  return answer;
}

// Given the file bytes and the form type, reads the boxes.
export async function readFormFile({ type, mime, bytes, filename }, options = {}) {
  if (!FORM_TYPES[type]) throw new ReadingError("Unknown form type.");
  const answer = await ask({ prompt: readingPrompt(type), schema: readingSchema(type), mime, bytes, filename }, options);
  return cleanReading(type, answer);
}

// Given the file bytes, says which tax form it is (or UNKNOWN).
export async function detectFormType({ mime, bytes, filename }, options = {}) {
  const answer = await ask({ prompt: classifyPrompt(), schema: classifySchema(), mime, bytes, filename }, options);
  return DETECTABLE_TYPES.includes(answer.formType) ? answer.formType : "UNKNOWN";
}

// Reads one uploaded document of a return the session may access. Without a form type,
// the type is detected first.
export async function readReturnDocument(session, r, { documentId, formType, consent }) {
  if (consent !== true) throw new ReadingError("Please agree to the automatic reading first.");
  if (formType && !FORM_TYPES[formType]) throw new ReadingError("Unknown form type.");
  const id = safeId(documentId);
  const doc = id ? await getDocument(`taxDocuments/${id}`, session.idToken).catch(() => null) : null;
  if (!doc || doc.tenantId !== TAX_TENANT || doc.returnId !== r.id) throw new ReadingError("Document not found.", 404);
  const provider = readerProvider();
  const file = await downloadObject(doc.storagePath, session.idToken).catch(() => null);
  if (!file?.ok) throw new ReadingError("The document could not be opened. Please try again.", 503);
  const bytes = await file.arrayBuffer();
  const input = { mime: doc.mime, bytes, filename: doc.filename };
  const type = formType || await detectFormType(input, { provider });
  const result = type === "UNKNOWN" ? null : await readFormFile({ ...input, type }, { provider });
  // A file dropped as "other" takes the type that was detected, so the checklist sees it.
  let docType = doc.type;
  if (!formType && type !== "UNKNOWN" && doc.type === "OTHER" && FORM_DOC_TYPE[type]) {
    docType = FORM_DOC_TYPE[type];
    await mergeDocument(`taxDocuments/${id}`, { type: docType }, await serviceToken()).catch(() => { docType = doc.type; });
  }
  // Keep what was read with the document, so a later difference between the document and
  // the typed answer can be reported. The answer itself is never changed from here.
  if (result) {
    const reading = { formType: type, taxYear: result.taxYear, confidence: result.confidence, values: result.values, matched: result.isThisForm, at: new Date().toISOString() };
    await mergeDocument(`taxDocuments/${id}`, { reading }, await serviceToken()).catch(() => {});
  }
  // Loaded here so the reader itself can be tested outside Next.
  const { audit } = await import("@/lib/audit");
  await audit(session, "DOCUMENT_READ", { target: `taxReturns/${r.id}`, details: { documentId: id, formType: type, detected: !formType, provider, filled: result?.filled ?? 0, matched: result?.isThisForm ?? false } });
  if (!result) return { formType: "UNKNOWN", provider, documentId: id, docType, values: {}, filled: 0, isThisForm: false, note: "We could not tell which tax form this is." };
  return { ...result, formType: type, provider, documentId: id, docType };
}
