import "server-only";
import { downloadObject, getDocument, TAX_TENANT } from "@/lib/firebase";
import { FORM_TYPES } from "@/lib/intake-schema";
import { safeId } from "@/lib/security";
import { READABLE_MIME, cleanReading, parseJsonAnswer, readingPrompt, readingSchema } from "@/lib/document-reading-shared";

// Reads an uploaded tax form with an AI model to pre-fill its boxes.
//
//   OPENAI_API_KEY (+ optional OPENAI_MODEL)  ChatGPT, through the Responses API
//   GEMINI_API_KEY (+ optional GEMINI_MODEL)  Google Gemini API
//   DOCUMENT_READER=openai|gemini             which one, when both keys exist
//
// With neither key the feature is off and forms are filled by hand.

export class ReadingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const key = (name) => (process.env[name] || "").trim();

export function readerProvider() {
  const wanted = key("DOCUMENT_READER").toLowerCase();
  const openai = Boolean(key("OPENAI_API_KEY")), gemini = Boolean(key("GEMINI_API_KEY"));
  if (wanted === "gemini" && gemini) return "gemini";
  if (wanted === "openai" && openai) return "openai";
  return openai ? "openai" : gemini ? "gemini" : null;
}

export const READER_LABEL = { openai: "OpenAI (ChatGPT)", gemini: "Google Gemini" };

async function askOpenAI({ type, mime, base64, filename }, fetcher) {
  const file = mime === "application/pdf"
    ? { type: "input_file", filename: filename || "document.pdf", file_data: `data:${mime};base64,${base64}` }
    : { type: "input_image", image_url: `data:${mime};base64,${base64}` };
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: key("OPENAI_MODEL") || "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: readingPrompt(type) }, file] }],
      text: { format: { type: "json_schema", name: "tax_form", strict: true, schema: readingSchema(type) } },
      store: false,
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReadingError(`OpenAI refused the request (${response.status}).`, 502);
  const out = (data.output || []).flatMap((o) => o.content || []).find((c) => c.type === "output_text");
  return parseJsonAnswer(out?.text);
}

// Gemini's schema dialect has no additionalProperties.
const geminiSchema = (schema) => {
  const { additionalProperties: _a, ...rest } = schema;
  return rest;
};

async function askGemini({ type, mime, base64 }, fetcher) {
  const model = key("GEMINI_MODEL") || "gemini-2.5-flash";
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key("GEMINI_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: readingPrompt(type) }, { inline_data: { mime_type: mime, data: base64 } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema(readingSchema(type)), temperature: 0 },
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReadingError(`Google Gemini refused the request (${response.status}).`, 502);
  return parseJsonAnswer(data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join(""));
}

// Pure enough to test: given the file bytes, asks the configured reader.
export async function readFormFile({ type, mime, bytes, filename }, { provider = readerProvider(), fetcher = fetch } = {}) {
  if (!FORM_TYPES[type]) throw new ReadingError("Unknown form type.");
  if (!provider) throw new ReadingError("Automatic reading is not set up. Please type the amounts.", 409);
  if (!READABLE_MIME.has(mime)) throw new ReadingError("This file type cannot be read automatically. Upload a PDF, JPG, PNG or WEBP, or type the amounts.");
  const base64 = Buffer.from(bytes).toString("base64");
  const ask = provider === "gemini" ? askGemini : askOpenAI;
  let answer;
  try {
    answer = await ask({ type, mime, base64, filename }, fetcher);
  } catch (error) {
    if (error instanceof ReadingError) throw error;
    throw new ReadingError("The reading service did not answer. Please try again or type the amounts.", 502);
  }
  if (!answer) throw new ReadingError("The document could not be read. Please type the amounts.", 422);
  return cleanReading(type, answer);
}

// Reads one uploaded document of a return the session may access.
export async function readReturnDocument(session, r, { documentId, formType, consent }) {
  if (consent !== true) throw new ReadingError("Please agree to the automatic reading first.");
  const id = safeId(documentId);
  const doc = id ? await getDocument(`taxDocuments/${id}`, session.idToken).catch(() => null) : null;
  if (!doc || doc.tenantId !== TAX_TENANT || doc.returnId !== r.id) throw new ReadingError("Document not found.", 404);
  const provider = readerProvider();
  const file = await downloadObject(doc.storagePath, session.idToken).catch(() => null);
  if (!file?.ok) throw new ReadingError("The document could not be opened. Please try again.", 503);
  const bytes = await file.arrayBuffer();
  const result = await readFormFile({ type: formType, mime: doc.mime, bytes, filename: doc.filename }, { provider });
  // Loaded here so the reader itself can be tested outside Next.
  const { audit } = await import("@/lib/audit");
  await audit(session, "DOCUMENT_READ", { target: `taxReturns/${r.id}`, details: { documentId: id, formType, provider, filled: result.filled, matched: result.isThisForm } });
  return { ...result, provider, documentId: id };
}
