// Runs the real password-reset server code against the Firestore and Auth emulators.
// The email provider is replaced by a stub that keeps the messages. Run through
// `npm run test:integration`.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-perry-tax";
Object.assign(process.env, {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
  NEXT_PUBLIC_SITE_URL: "https://innovacaresoftware.com",
  SESSION_SECRET: "integration-test-secret-0123456789abcdef",
  // The emulators accept "owner" as an all-powerful token, standing in for the server identity.
  SERVICE_ACCESS_TOKEN: "owner",
  RESEND_API_KEY: "test-key",
  MAIL_FROM: "InnovaCare <no-reply@example.test>",
});

const T = "perry-tax-pro";
const OLD = "Old-Kettle-Orbit-41";
const NEW = "New-Lantern-Harbor-73";
const sent = [];
let fb, reset;

// Keeps emails and answers the breached-password check; everything else goes to the emulators.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://api.resend.com/")) {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  }
  if (u.startsWith("https://api.pwnedpasswords.com/")) return new Response("0018A45C4D1DEF81644B54AB7F969B88D65:1", { status: 200 });
  return realFetch(url, init);
};

const tokenFrom = (mail) => /#token=([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1];
// The other integration files run at the same time on the same emulators: this file uses
// only its own accounts and addresses, unique to the run, and never clears the database.
const RUN = Math.random().toString(36).slice(2, 8);
const EMAIL = `reset.me.${RUN}@example.test`;
const ip = (n) => `10.${RUN.charCodeAt(0) % 200}.${RUN.charCodeAt(1) % 200}.${n}`;
let uid;

async function account(email) {
  const auth = await fb.signUpWithPassword(email, OLD, "Reset Me");
  const now = new Date().toISOString();
  await fb.setDocument(`taxUsers/${auth.localId}`, { uid: auth.localId, name: "Reset Me", email, phone: null, role: "CLIENT", accountType: "BUSINESS", tenantId: T, createdAt: now, updatedAt: now }, "owner");
  return auth.localId;
}

before(async () => {
  fb = await import("@/lib/firebase");
  reset = await import("@/lib/password-reset");
  uid = await account(EMAIL);
});

describe("password reset", () => {
  test("an unknown email gets the same silent answer and no email", async () => {
    const started = Date.now();
    await reset.requestPasswordReset({ email: `nobody.${RUN}@example.test`, ip: ip(1) });
    assert.ok(Date.now() - started >= 850, "answers after the same minimum time");
    assert.equal(sent.length, 0);
  });

  test("a known email gets a single-use link; only its hash is stored", async () => {
    await reset.requestPasswordReset({ email: EMAIL.toUpperCase(), ip: ip(2) });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, [EMAIL]);
    const token = tokenFrom(sent[0]);
    assert.ok(token, "the link carries the token in the fragment");
    assert.match(sent[0].text, /https:\/\/innovacaresoftware\.com\/reset-password#token=/);
    const rows = await fb.queryCollection("taxPasswordResets", "owner", { filters: [["uid", "EQUAL", uid]] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, reset.hashResetToken(token));
    assert.ok(!JSON.stringify(rows[0]).includes(token), "the token itself is not stored");
    assert.equal(await reset.checkResetToken(token), true);
  });

  test("a new link cancels the older one", async () => {
    const first = tokenFrom(sent[0]);
    await reset.requestPasswordReset({ email: EMAIL, ip: ip(2) });
    const second = tokenFrom(sent[1]);
    assert.notEqual(first, second);
    assert.equal(await reset.checkResetToken(first), false);
    assert.equal(await reset.checkResetToken(second), true);
  });

  test("two requests at the same moment: exactly one link is sent, and it works", async () => {
    const email = `race.${RUN}@example.test`;
    const raceUid = await account(email);
    const count = sent.length;
    await Promise.all([1, 2].map((n) => reset.requestPasswordReset({ email, ip: ip(40 + n) })));
    const mails = sent.slice(count).filter((m) => m.to[0] === email);
    assert.equal(mails.length, 1, "the losing request sends nothing");
    assert.equal(await reset.checkResetToken(tokenFrom(mails[0])), true);
    const state = await fb.getDocument(`taxPasswordResetState/${raceUid}`, "owner");
    assert.equal(state.currentHash, reset.hashResetToken(tokenFrom(mails[0])));
  });

  test("weak or breached passwords are refused without using the link up", async () => {
    const token = tokenFrom(sent[1]);
    await assert.rejects(reset.completePasswordReset({ token, password: "short", ip: ip(3) }), /12 characters/);
    await assert.rejects(reset.completePasswordReset({ token, password: "Reset-Me-Kettle-9", ip: ip(3) }), /name, email/);
    assert.equal(await reset.checkResetToken(token), true, "still usable after a refused password");
  });

  test("the new password works, the old one stops, sessions are revoked and the link is spent", async () => {
    const token = tokenFrom(sent[1]);
    const before = Date.now();
    await reset.completePasswordReset({ token, password: NEW, ip: ip(3) });
    await assert.rejects(fb.signInWithPassword(EMAIL, OLD));
    const signedIn = await fb.signInWithPassword(EMAIL, NEW);
    assert.equal(signedIn.localId, uid);
    const profile = await fb.getDocument(`taxUsers/${uid}`, "owner");
    assert.ok(profile.sessionsValidAfter >= Math.floor(before / 1000) * 1000);
    assert.equal(await reset.checkResetToken(token), false);
    await assert.rejects(reset.completePasswordReset({ token, password: "Another-Fresh-Phrase-55", ip: ip(3) }), /invalid or has expired/);
    assert.match(sent.at(-1).subject, /was changed/, "the owner is told");
  });

  test("a forged or expired token is refused", async () => {
    await assert.rejects(reset.completePasswordReset({ token: "A".repeat(43), password: NEW, ip: ip(4) }), /invalid or has expired/);
    const token = reset.newResetToken();
    await fb.setDocument(`taxPasswordResets/${reset.hashResetToken(token)}`, { tenantId: T, uid, createdAt: new Date().toISOString(), expiresAtMs: Date.now() - 1000, usedAt: null }, "owner");
    await assert.rejects(reset.completePasswordReset({ token, password: "Yet-Another-Phrase-88", ip: ip(4) }), /invalid or has expired/);
  });

  test("a blocked account gets no link", async () => {
    const count = sent.length;
    await fb.setDocument(`taxAccountBlocks/${uid}`, { tenantId: T, uid, reason: "test", at: new Date().toISOString(), by: "boss" }, "owner");
    await reset.requestPasswordReset({ email: EMAIL, ip: ip(5) });
    assert.equal(sent.length, count);
    await fb.deleteDocument(`taxAccountBlocks/${uid}`, "owner");
  });

  test("more than 3 links an hour for one address are silently not sent", async () => {
    const email = `limit.${RUN}@example.test`;
    await account(email);
    const count = sent.length;
    for (let i = 0; i < 5; i++) await reset.requestPasswordReset({ email, ip: ip(10 + i) });
    assert.equal(sent.length - count, 3);
  });

  test("more than 10 requests an hour from one address are refused", async () => {
    let refused = 0;
    for (let i = 0; i < 12; i++) {
      await reset.requestPasswordReset({ email: `x${i}.${RUN}@example.test`, ip: ip(99) }).catch((e) => { if (e.status === 429) refused++; });
    }
    assert.equal(refused, 2);
  });
});
