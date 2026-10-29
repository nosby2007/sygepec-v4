import "server-only";
import crypto from "node:crypto";
import { getDocument, incrementDocument, mergeDocument, patchFields, setDocument, TAX_TENANT, uploadObject } from "@/lib/firebase";
import { getReturnForSession } from "@/lib/data";
import { paymentGate } from "@/lib/payments";
import { notifyStatusChange, emailClient } from "@/lib/notifications";
import { serviceToken } from "@/lib/service-identity";
import { audit } from "@/lib/audit";
import { scanFile, scanMessage } from "@/lib/file-scan";
import { cleanEmail, cleanText, safeId } from "@/lib/security";

// Online signing of Form 8879 through DocuSeal, with third-party knowledge-based
// authentication (KBA) for each signer, as IRS Publication 1345 requires for remote
// signatures. The preparer uploads the 8879 printed by the tax software; signature,
// date and identity-check fields are placed on the official IRS layout (Rev. 01-2021).
//
//   taxSignatures/{returnId}   the signing request and each signer's progress (server-only)
// When everyone has signed, the signed PDF and DocuSeal's audit trail are saved to the
// return's documents and the return is marked signed.
const API = "https://api.docuseal.com";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export class SignError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const apiKey = () => (process.env.DOCUSEAL_API_KEY || "").trim();
export const esignConfigured = () => Boolean(apiKey());

async function docuseal(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "X-Auth-Token": apiKey(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new SignError(`The signing service refused the request (${response.status}).`, 502);
  return data;
}

// Field positions on Form 8879 (Rev. 01-2021), as fractions of the page. Measured from
// the IRS PDF: "Your signature" at 61.8% down page 1, "Spouse's signature" at 76.9%.
const area = (x, y, w, h, page = 1) => ({ x, y, w, h, page });
const FIELDS = {
  Taxpayer: [
    { name: "Taxpayer signature", type: "signature", areas: [area(0.17, 0.592, 0.44, 0.03)] },
    { name: "Taxpayer date", type: "date", areas: [area(0.68, 0.596, 0.22, 0.024)] },
    { name: "Taxpayer identity check", type: "kba", areas: [area(0.06, 0.94, 0.4, 0.03, 2)] },
  ],
  Spouse: [
    { name: "Spouse signature", type: "signature", areas: [area(0.2, 0.743, 0.41, 0.03)] },
    { name: "Spouse date", type: "date", areas: [area(0.68, 0.747, 0.22, 0.024)] },
    { name: "Spouse identity check", type: "kba", areas: [area(0.52, 0.94, 0.4, 0.03, 2)] },
  ],
};

const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;

export async function getSignature(returnId) {
  const id = safeId(returnId);
  return id ? getDocument(`taxSignatures/${id}`, await serviceToken()).catch(() => null) : null;
}

// Signer view for screens: never includes another signer's link.
export function signatureView(sig, uid) {
  if (!sig) return null;
  return {
    status: sig.status,
    createdAt: sig.createdAt,
    completedAt: sig.completedAt || null,
    signers: sig.signers.map((s) => ({ role: s.role, name: s.name, status: s.status, completedAt: s.completedAt || null })),
    myLink: uid ? sig.signers.find((s) => s.role === "Taxpayer" && sig.clientId === uid && s.status !== "completed")?.embedSrc || null : null,
  };
}

export async function sendForSignature(session, rawReturnId, input) {
  if (session?.role !== "PREPARER") throw new SignError("Preparer access required.", 403);
  if (!esignConfigured()) throw new SignError("Online signing is not set up yet.", 409);
  const r = await getReturnForSession(rawReturnId, session);
  if (!r) throw new SignError("Return not found.", 404);
  if (!r.intake?.submitted) throw new SignError("The client must submit the questionnaire first.");
  if (!r.preparer_id) throw new SignError("Assign a preparer before requesting the signature.");
  if (["FILED", "ACCEPTED"].includes(r.status)) throw new SignError("This return has already been filed.", 409);
  const gate = await paymentGate("TAX_RETURN", r.id, "SIGN");
  if (gate) throw new SignError(`${gate} Ask the client to pay first, or record the payment.`, 402);
  const existing = await getSignature(r.id);
  if (existing && ["SENT", "PARTIAL"].includes(existing.status)) throw new SignError("A signature request is already open. Cancel it before sending a new one.", 409);

  const pdf = Buffer.from(String(input.pdf || ""), "base64");
  if (!pdf.length || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString() !== "%PDF-") throw new SignError("Upload the Form 8879 PDF from your tax software (8 MB at most).");
  const scan = scanFile(pdf, { allowed: ["application/pdf"] });
  if (!scan.ok) throw new SignError(scanMessage(scan) || "Upload the Form 8879 PDF from your tax software (8 MB at most).");
  const spouseEmail = cleanEmail(input.spouseEmail);
  const spouseName = cleanText(input.spouseName, 100);
  if ((spouseEmail && !spouseName) || (!spouseEmail && spouseName)) throw new SignError("Enter both the spouse's name and email, or neither.");
  if (spouseEmail && spouseEmail === String(r.client_email).toLowerCase()) throw new SignError("The spouse needs their own email address.");

  const roles = spouseEmail ? ["Taxpayer", "Spouse"] : ["Taxpayer"];
  const signers = [
    { role: "Taxpayer", name: r.client_name, email: r.client_email },
    ...(spouseEmail ? [{ role: "Spouse", name: spouseName, email: spouseEmail }] : []),
  ];
  const submission = await docuseal("POST", "/submissions/pdf", {
    name: `Form 8879, ${r.tax_year} return, ${r.client_name}`.slice(0, 120),
    send_email: false,
    order: "random",
    expire_at: new Date(Date.now() + 30 * 86_400_000).toISOString().replace("T", " ").slice(0, 19) + " UTC",
    documents: [{ name: `Form 8879 ${r.tax_year}`, file: pdf.toString("base64"), fields: roles.flatMap((role) => FIELDS[role].map((f) => ({ ...f, role, required: true }))) }],
    submitters: signers.map((s) => ({
      role: s.role, name: s.name, email: s.email, external_id: `${r.id}:${s.role}`, send_email: false,
      completed_redirect_url: s.role === "Taxpayer" ? `${SITE}/portal?signed=1` : `${SITE}/signed-out?reason=signed`,
    })),
  });
  const byRole = Object.fromEntries((submission.submitters || []).map((s) => [s.role, s]));
  const now = new Date().toISOString();
  const record = {
    tenantId: TAX_TENANT, returnId: r.id, clientId: r.client_id, taxYear: r.tax_year, provider: "DocuSeal",
    submissionId: submission.id, status: "SENT", createdAt: now, createdBy: session.uid, createdByName: session.name,
    signers: signers.map((s) => ({ ...s, submitterId: byRole[s.role]?.id || null, embedSrc: byRole[s.role]?.embed_src || null, status: byRole[s.role]?.status || "sent", completedAt: null })),
  };
  await setDocument(`taxSignatures/${r.id}`, record, await serviceToken());

  // The return moves to "ready to sign" exactly as when the preparer requests it by hand.
  await mergeDocument(`taxReturns/${r.id}`, {
    signatureStatus: "REQUESTED", signatureMethod: "REMOTE", signatureRequestedAt: now, signedAt: null, status: "READY_TO_SIGN", updatedAt: now,
  }, session.idToken);
  if (r.status !== "READY_TO_SIGN") await notifyStatusChange(r, "READY_TO_SIGN").catch(() => {});
  // A spouse has no portal account, so their link goes by email. The identity check
  // protects it if the email is forwarded.
  const spouse = record.signers.find((s) => s.role === "Spouse");
  if (spouse?.embedSrc) {
    await emailClient({
      to: spouse.email, name: spouse.name, subject: `Please sign your ${r.tax_year} tax return authorization (Form 8879)`, link: "/",
      text: `${r.client_name} and you filed jointly, so the IRS needs both signatures on Form 8879 before we can e-file. Sign here: ${spouse.embedSrc}\n\nYou will be asked a few identity questions first; this is an IRS requirement.`,
    }).catch(() => {});
  }
  return signatureView(record);
}

export async function cancelSignature(session, rawReturnId) {
  if (session?.role !== "PREPARER") throw new SignError("Preparer access required.", 403);
  const id = safeId(rawReturnId);
  const sig = await getSignature(id);
  if (!sig || !["SENT", "PARTIAL"].includes(sig.status)) throw new SignError("There is no open signature request.", 404);
  await docuseal("DELETE", `/submissions/${sig.submissionId}`).catch(() => null);
  await setDocument(`taxSignatures/${id}`, { ...strip(sig), status: "CANCELLED", cancelledAt: new Date().toISOString(), cancelledBy: session.uid }, await serviceToken());
  await patchFields(`taxReturns/${id}`, { signatureStatus: "NOT_REQUESTED", signatureRequestedAt: null, updatedAt: new Date().toISOString() }, await serviceToken());
  return { ok: true };
}

async function download(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("download failed");
  return Buffer.from(await response.arrayBuffer());
}

// Saves a file into the return's documents with the signed-in user's own access, the
// same way an upload does (the server identity has no Storage permission).
// The file goes up with the user's token (the server identity has no Storage access);
// the record is written by the server identity, the only writer the rules allow for
// these types. "signed-" files cannot be deleted under the Storage rules.
async function storeDocument(session, sig, type, filename, bytes) {
  const id = crypto.randomUUID();
  const storagePath = `tax/${TAX_TENANT}/${sig.clientId}/${sig.returnId}/${id}/signed-${type === "SIGNED_8879" ? "8879" : "audit"}.pdf`;
  await uploadObject(storagePath, bytes, "application/pdf", session.idToken);
  const token = await serviceToken();
  await setDocument(`taxDocuments/${id}`, {
    tenantId: TAX_TENANT, returnId: sig.returnId, clientId: sig.clientId, type, filename, storagePath,
    mime: "application/pdf", size: bytes.length, uploadedBy: session.uid, createdAt: new Date().toISOString(),
  }, token, { createOnly: true });
  await incrementDocument(`taxReturns/${sig.returnId}`, "docCount", 1, token).catch(() => null);
  return id;
}

// Reads the request back from DocuSeal and records progress. Called when the preparer
// or client opens the return, and when the client comes back from signing.
export async function syncSignature(session, rawReturnId) {
  const id = safeId(rawReturnId);
  const sig = await getSignature(id);
  if (!sig || !["SENT", "PARTIAL"].includes(sig.status) || !esignConfigured()) return sig;
  if (session.role !== "PREPARER" && session.uid !== sig.clientId) return sig;
  const submission = await docuseal("GET", `/submissions/${sig.submissionId}`).catch(() => null);
  if (!submission) return sig;
  const remote = Object.fromEntries((submission.submitters || []).map((s) => [s.role, s]));
  const signers = sig.signers.map((s) => ({ ...s, status: remote[s.role]?.status || s.status, completedAt: remote[s.role]?.completed_at || s.completedAt || null }));
  const declined = signers.some((s) => s.status === "declined");
  const done = submission.status === "completed" || signers.every((s) => s.status === "completed");
  const token = await serviceToken();
  const now = new Date().toISOString();

  if (declined) {
    await setDocument(`taxSignatures/${id}`, { ...strip(sig), signers, status: "DECLINED", updatedAt: now }, token);
    await patchFields(`taxReturns/${id}`, { signatureStatus: "DECLINED", signedAt: null, updatedAt: now }, token);
    return { ...sig, signers, status: "DECLINED" };
  }
  if (!done) {
    const status = signers.some((s) => s.status === "completed") ? "PARTIAL" : "SENT";
    await setDocument(`taxSignatures/${id}`, { ...strip(sig), signers, status, updatedAt: now }, token);
    return { ...sig, signers, status };
  }

  // Everyone signed: keep the signed form and the audit trail with the return.
  const evidence = {};
  const signedUrl = submission.combined_document_url || submission.documents?.[0]?.url;
  if (signedUrl) evidence.signedDocumentId = await storeDocument(session, sig, "SIGNED_8879", `Form 8879 ${sig.taxYear} (signed).pdf`, await download(signedUrl)).catch(() => null);
  if (submission.audit_log_url) evidence.auditDocumentId = await storeDocument(session, sig, "SIGNATURE_AUDIT", `Form 8879 ${sig.taxYear} audit trail.pdf`, await download(submission.audit_log_url)).catch(() => null);
  const signedAt = signers.map((s) => s.completedAt).filter(Boolean).sort().at(-1) || now;
  await setDocument(`taxSignatures/${id}`, { ...strip(sig), signers, status: "COMPLETED", completedAt: signedAt, ...evidence, updatedAt: now }, token);
  await patchFields(`taxReturns/${id}`, { signatureStatus: "SIGNED", signatureMethod: "REMOTE", signedAt, updatedAt: now }, token);
  await audit(null, "SIGNATURE_COMPLETED", { target: `taxReturns/${id}`, details: { submissionId: sig.submissionId, signedDocumentId: evidence.signedDocumentId || "", auditDocumentId: evidence.auditDocumentId || "" } });
  return { ...sig, signers, status: "COMPLETED", completedAt: signedAt, ...evidence };
}
