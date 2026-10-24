// Authorization tests for the Perry Tax Pro rules snippets.
// Run with `npm run test:rules` (needs the Firebase CLI and Java 21+).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-perry-tax";
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"}`;
const STORAGE = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9195"}`;
const BUCKET = `${PROJECT}.appspot.com`;
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const T = "perry-tax-pro";

// The emulators accept unsigned tokens; "owner" bypasses rules for seeding.
function token(uid) {
  if (!uid) return null;
  if (uid === "owner") return "owner";
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid,
    iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "password", identities: {} },
  })}.`;
}

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: fields(value) } };
}
const fields = (data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
const headers = (uid) => ({ "Content-Type": "application/json", ...(uid ? { Authorization: `Bearer ${token(uid)}` } : {}) });

async function status(promise) {
  const response = await promise;
  await response.arrayBuffer();
  return response.status;
}
const write = (uid, path, data, createOnly = false) =>
  status(fetch(`${DOCS}/${path}${createOnly ? "?currentDocument.exists=false" : ""}`, { method: "PATCH", headers: headers(uid), body: JSON.stringify({ fields: fields(data) }) }));
const read = (uid, path) => status(fetch(`${DOCS}/${path}`, { headers: headers(uid) }));
const increment = (uid, path, amount) => status(fetch(`${DOCS}:commit`, {
  method: "POST", headers: headers(uid),
  body: JSON.stringify({ writes: [{ transform: { document: `projects/${PROJECT}/databases/(default)/documents/${path}`, fieldTransforms: [{ fieldPath: "docCount", increment: encode(amount) }] } }] }),
}));
const upload = (uid, path, contentType = "application/pdf") => status(fetch(`${STORAGE}/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`, {
  method: "POST", headers: { ...headers(uid), "Content-Type": contentType }, body: "%PDF-1.4 test",
}));
const download = (uid, path) => status(fetch(`${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`, { headers: headers(uid) }));
const remove = (uid, path) => status(fetch(`${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`, { method: "DELETE", headers: headers(uid) }));

const ok = (code) => assert.equal(code, 200, `expected 200, got ${code}`);
const denied = (code) => assert.ok([401, 403].includes(code), `expected a denial, got ${code}`);

const now = "2026-10-24T12:00:00.000Z";
const user = (uid, extra = {}) => ({ uid, name: `User ${uid}`, email: `${uid}@example.test`, phone: null, role: "CLIENT", accountType: "TAX", tenantId: T, createdAt: now, updatedAt: now, ...extra });
const newReturn = (uid, taxYear = 2026, extra = {}) => ({
  tenantId: T, clientId: uid, clientName: `User ${uid}`, clientEmail: `${uid}@example.test`, clientPhone: null,
  preparerId: null, preparerName: null, signatureStatus: "NOT_REQUESTED", signatureMethod: "REMOTE",
  signatureRequestedAt: null, signedAt: null, submissionStatus: "NOT_READY", submissionReference: null,
  submissionNotes: null, submittedAt: null, acceptedAt: null, taxYear, status: "INTAKE", filingStatus: null,
  intake: {}, docCount: 0, createdAt: now, updatedAt: now, ...extra,
});
const seed = (path, data) => write("owner", path, data).then(ok);

before(async () => {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await seed("taxUsers/alice", user("alice"));
  await seed("taxUsers/bob", user("bob"));
  await seed("taxUsers/prep", user("prep", { role: "PREPARER", accountType: null }));
  await seed("taxUsers/bizA", user("bizA", { accountType: "BUSINESS" }));
  await seed("taxUsers/bizB", user("bizB", { accountType: "BUSINESS" }));
  for (const [id, status] of [["review", "IN_REVIEW"], ["sign", "READY_TO_SIGN"], ["filed", "FILED"], ["docs", "DOCS_PENDING"]]) {
    await seed(`taxReturns/alice_${id}`, newReturn("alice", 2025, { status, docCount: 1 }));
  }
  await seed("taxBusinessCustomers/custB", { tenantId: T, ownerUid: "bizB", name: "Customer of B", phone: "", email: "", notes: "", createdAt: now });
});

describe("taxReturns", () => {
  test("a client creates their own return with initial workflow values", async () => {
    ok(await write("alice", "taxReturns/alice_2026", newReturn("alice"), true));
  });
  test("a client cannot create a return that claims a signature or submission", async () => {
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { signatureStatus: "SIGNED" }), true));
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { submissionStatus: "ACCEPTED" }), true));
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { docCount: 9 }), true));
  });
  test("a client cannot create returns under arbitrary IDs or with extra fields", async () => {
    denied(await write("bob", "taxReturns/anything", newReturn("bob"), true));
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { preparerNotes: "x" }), true));
    denied(await write("bob", "taxReturns/alice_2027", newReturn("alice", 2027), true));
  });
  test("a client cannot read another client's return; a preparer can", async () => {
    denied(await read("bob", "taxReturns/alice_review"));
    ok(await read("prep", "taxReturns/alice_review"));
  });
  test("intake is editable during review but frozen once out for signature", async () => {
    ok(await write("alice", "taxReturns/alice_review", newReturn("alice", 2025, { status: "IN_REVIEW", docCount: 1, intake: { note: "fix" }, updatedAt: "2026-10-25T00:00:00.000Z" })));
    denied(await write("alice", "taxReturns/alice_sign", newReturn("alice", 2025, { status: "READY_TO_SIGN", docCount: 1, intake: { note: "fix" } })));
    ok(await write("alice", "taxReturns/alice_sign", newReturn("alice", 2025, { status: "READY_TO_SIGN", docCount: 1, updatedAt: "2026-10-25T00:00:00.000Z" })));
  });
  test("a client can move docCount by one either way, never below zero or on a filed return", async () => {
    ok(await increment("alice", "taxReturns/alice_docs", 1));
    ok(await increment("alice", "taxReturns/alice_docs", -1));
    ok(await increment("alice", "taxReturns/alice_docs", -1));
    denied(await increment("alice", "taxReturns/alice_docs", -1));
    denied(await increment("alice", "taxReturns/alice_filed", -1));
    denied(await increment("alice", "taxReturns/alice_docs", 5));
  });
});

describe("taxDocuments, taxNotes and taxAppointments", () => {
  const doc = (extra = {}) => ({
    tenantId: T, returnId: "alice_docs", clientId: "alice", type: "W2", filename: "w2.pdf",
    storagePath: "tax/perry-tax-pro/alice/alice_docs/d1/document.pdf", mime: "application/pdf", size: 10,
    uploadedBy: "alice", createdAt: now, ...extra,
  });
  test("a document record must point at its own return's Storage folder", async () => {
    ok(await write("alice", "taxDocuments/d1", doc(), true));
    denied(await write("alice", "taxDocuments/d2", doc({ storagePath: "tax/perry-tax-pro/bob/bob_2026/x/document.pdf" }), true));
    denied(await write("alice", "taxDocuments/d3", doc({ storagePath: "tax/perry-tax-pro/alice/alice_docs/d1/document.pdf" }), true));
  });
  test("another client cannot attach documents to a return they do not own", async () => {
    denied(await write("bob", "taxDocuments/d4", doc({ uploadedBy: "bob", storagePath: "tax/perry-tax-pro/alice/alice_docs/d4/document.pdf" }), true));
  });
  const note = (extra = {}) => ({ tenantId: T, returnId: "alice_docs", clientId: "alice", authorId: "alice", authorName: "User alice", authorRole: "CLIENT", message: "Hello", createdAt: now, ...extra });
  test("a note must carry the author's real name and role", async () => {
    ok(await write("alice", "taxNotes/n1", note(), true));
    denied(await write("alice", "taxNotes/n2", note({ authorName: "Your Preparer" }), true));
    denied(await write("alice", "taxNotes/n3", note({ authorRole: "PREPARER" }), true));
  });
  const appointment = (extra = {}) => ({ tenantId: T, clientId: "alice", name: "User alice", email: "alice@example.test", phone: null, scheduledAt: "2026-11-02T15:00:00.000Z", type: "VIRTUAL", service: "Individual Return", notes: "", status: "REQUESTED", createdAt: now, ...extra });
  test("a client books only plain requests, without preparer-managed fields", async () => {
    ok(await write("alice", "taxAppointments/a1", appointment(), true));
    denied(await write("alice", "taxAppointments/a2", appointment({ status: "CONFIRMED" }), true));
    denied(await write("alice", "taxAppointments/a3", appointment({ meetingLink: "https://example.test/j/1" }), true));
    denied(await write("bob", "taxAppointments/a4", appointment(), true));
  });
});

describe("business isolation", () => {
  test("one business cannot read another business's customers", async () => {
    denied(await read("bizA", "taxBusinessCustomers/custB"));
    ok(await read("bizB", "taxBusinessCustomers/custB"));
  });
  test("a tax client cannot write business ledger entries", async () => {
    const entry = { tenantId: T, clientId: "alice", taxYear: 2026, kind: "expense", category: "Supplies", amountCents: 1000, date: "2026-10-01", description: "", createdAt: now };
    denied(await write("alice", "taxBusinessEntries/e1", entry, true));
    ok(await write("bizA", "taxBusinessEntries/e2", { ...entry, clientId: "bizA" }, true));
  });
});

describe("Storage", () => {
  const docsFile = "tax/perry-tax-pro/alice/alice_docs/d1/document.pdf";
  const filedFile = "tax/perry-tax-pro/alice/alice_filed/f1/document.pdf";
  test("a client uploads to their own return; others cannot read it", async () => {
    ok(await upload("alice", docsFile));
    ok(await upload("prep", filedFile));
    ok(await download("alice", docsFile));
    ok(await download("prep", docsFile));
    denied(await download("bob", docsFile));
    denied(await upload("bob", "tax/perry-tax-pro/alice/alice_docs/x/document.pdf"));
  });
  test("a client cannot delete files from a filed return; a preparer can", async () => {
    denied(await remove("alice", filedFile));
    assert.ok([200, 204].includes(await remove("alice", docsFile)));
    assert.ok([200, 204].includes(await remove("prep", filedFile)));
  });
});
