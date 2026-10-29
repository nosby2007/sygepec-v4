import zlib from "node:zlib";

// Checks every upload before it is stored. Pure, so it is unit-tested.
//  1. The real file type from its first bytes (the name and browser-sent type are ignored).
//  2. Known-bad content: the EICAR antivirus test file, Windows programs, scripts or
//     HTML hidden inside an image, and PDFs that launch programs, carry Flash media or
//     hide a program in an attachment. Compressed PDF streams are unpacked first, so the
//     check also sees inside them. JavaScript, XFA and attachments as such are allowed:
//     every fillable IRS form (W-9, 1099, 8879) contains all three.
// This is a content check, not a full antivirus; unknown malware inside an otherwise
// ordinary PDF or image is not detected.
const TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export function sniffType(input) {
  const b = toBytes(input).subarray(0, 16);
  const ascii = String.fromCharCode(...b);
  if (ascii.startsWith("%PDF-")) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "image/png";
  if (ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (/ftyp(heic|heix|mif1|msf1|heim|heis)/.test(ascii.slice(4, 12))) return "image/heic";
  return null;
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input || []);
}

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!";

// Inside any file: markers that never belong in a tax document or a photo.
const ANYWHERE = [
  [/<script[\s>]/i, "contains a web script"],
  [/<\?php/i, "contains server code"],
  [/<(html|iframe|object|embed)[\s>]/i, "contains a web page"],
];

// PDF actions no tax document needs. Names may hide letters as #xx.
const PDF_BLOCKED = {
  Launch: "tries to start a program",
  RichMedia: "contains Flash or other media",
};
const PROGRAM = "This program cannot be run in DOS mode";

const MAX_STREAMS = 4000;
const MAX_INFLATED = 60 * 1024 * 1024;

function pdfNames(text) {
  const names = new Set();
  for (const match of text.matchAll(/\/([A-Za-z0-9#]{1,40})/g)) {
    names.add(match[1].replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
  }
  return names;
}

// The PDF's own text plus every Flate-compressed stream unpacked (object streams hide
// dictionaries, and so whatever actions they hold, inside compressed data).
function pdfTexts(bytes) {
  const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const texts = [raw.toString("latin1")];
  let from = 0;
  let total = 0;
  for (let n = 0; n < MAX_STREAMS; n++) {
    const start = raw.indexOf("stream", from, "latin1");
    if (start < 0) break;
    let body = start + 6;
    if (raw[body] === 0x0d) body++;
    if (raw[body] === 0x0a) body++;
    const end = raw.indexOf("endstream", body, "latin1");
    if (end < 0) break;
    from = end + 9;
    try {
      const out = zlib.inflateSync(raw.subarray(body, end), { maxOutputLength: 16 * 1024 * 1024 });
      total += out.length;
      if (total > MAX_INFLATED) return { texts, tooLarge: true };
      texts.push(out.toString("latin1"));
    } catch {
      // Not Flate data (images, fonts) or encrypted: nothing to read.
    }
  }
  return { texts, tooLarge: false };
}

// { ok: true, mime, ext } or { ok: false, reason } (reason finishes "This file ...").
export function scanFile(input, { allowed = Object.keys(TYPES) } = {}) {
  const bytes = toBytes(input);
  if (!bytes.length) return { ok: false, reason: "is empty" };
  const mime = sniffType(bytes);
  if (!mime || !allowed.includes(mime)) return { ok: false, reason: "is not one of the accepted file types", code: "TYPE" };
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 4 * 1024 * 1024)).toString("latin1");
  if (head.includes(EICAR)) return { ok: false, reason: "matches a known virus signature", code: "MALWARE" };
  if (head.includes(PROGRAM)) return { ok: false, reason: "contains a Windows program", code: "MALWARE" };

  if (mime === "application/pdf") {
    const { texts, tooLarge } = pdfTexts(bytes);
    if (tooLarge) return { ok: false, reason: "unpacks to an unusually large size", code: "MALWARE" };
    for (const text of texts) {
      if (text.includes(EICAR)) return { ok: false, reason: "matches a known virus signature", code: "MALWARE" };
      if (text.includes(PROGRAM)) return { ok: false, reason: "has a Windows program attached inside it", code: "MALWARE" };
      for (const name of pdfNames(text)) {
        if (PDF_BLOCKED[name]) return { ok: false, reason: PDF_BLOCKED[name], code: "ACTIVE_CONTENT" };
      }
    }
    if (!texts[0].slice(-2048).includes("%%EOF")) return { ok: false, reason: "is damaged or incomplete", code: "DAMAGED" };
  } else {
    for (const [pattern, reason] of ANYWHERE) if (pattern.test(head)) return { ok: false, reason, code: "MALWARE" };
  }
  return { ok: true, mime, ext: TYPES[mime] };
}

export const scanMessage = (result) =>
  result.code === "TYPE" || result.reason === "is empty"
    ? null
    : `This file ${result.reason}, so it was not uploaded. ${result.code === "ACTIVE_CONTENT" ? "Print it to PDF (File › Print › Save as PDF) and upload that copy." : "Please upload a different copy."}`;
