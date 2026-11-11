// Runs the real CMS server code against the Firestore and Auth emulators with the rules.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-perry-tax";
Object.assign(process.env, {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
  SESSION_SECRET: "integration-test-secret-0123456789abcdef",
});
const T = "perry-tax-pro";
let cms, fb;

function mockToken(uid) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "password" } })}.`;
}
const prep = { uid: "cmsPrep", idToken: mockToken("cmsPrep"), name: "Pat Preparer", role: "PREPARER" };
const client = { uid: "cmsClient", idToken: mockToken("cmsClient"), name: "Chris Client", role: "CLIENT" };
const now = new Date().toISOString();
const post = (extra = {}) => ({ type: "POST", slug: "first-post", title: "Filing season checklist", summary: "What to gather.", body: "## Before you start\n\n- W-2s\n- 1099s", fields: { author: "Pat" }, ...extra });

before(async () => {
  fb = await import("@/lib/firebase");
  cms = await import("@/lib/cms");
  for (const [u, role] of [[prep, "PREPARER"], [client, "CLIENT"]])
    await fb.setDocument(`taxUsers/${u.uid}`, { uid: u.uid, name: u.name, email: `${u.uid}@example.test`, phone: null, role, accountType: role === "CLIENT" ? "TAX" : null, tenantId: T, createdAt: now, updatedAt: now }, "owner");
});

describe("publication states", () => {
  let id;
  test("a draft is private and keeps a revision", async () => {
    id = (await cms.saveEntry(prep, null, post(), "draft")).id;
    assert.equal(await cms.publicEntry("POST", "first-post"), null);
    assert.equal(await fb.getDocument(`cmsEntries/${id}`, null).catch((e) => e.status), 403);
    assert.equal((await cms.listRevisions(prep, id)).length, 1);
  });
  test("publishing makes it public; archiving hides it; restoring makes a draft", async () => {
    await cms.saveEntry(prep, id, post(), "publish");
    assert.equal((await cms.publicEntry("POST", "first-post"))?.title, "Filing season checklist");
    await cms.saveEntry(prep, id, post(), "archive");
    assert.equal(await cms.publicEntry("POST", "first-post"), null);
    const restored = await cms.saveEntry(prep, id, post({ title: "Filing season checklist (2026)" }), "restore");
    assert.equal(restored.status, "DRAFT");
    const revisions = await cms.listRevisions(prep, id);
    assert.deepEqual(revisions.map((r) => r.action), ["restore", "archive", "publish", "draft"]);
    assert.equal(revisions.at(-1).snapshot.title, "Filing season checklist");
  });
  test("scheduled content stays private until its time, then appears with no job running", async () => {
    const future = await cms.saveEntry(prep, null, post({ slug: "later", title: "Later" }), "schedule", Date.now() + 3_600_000);
    assert.equal(future.status, "SCHEDULED");
    assert.equal(await cms.publicEntry("POST", "later"), null);
    await fb.setDocument("cmsEntries/due-now", {
      tenantId: T, type: "POST", slug: "due-now", title: "Due now", summary: "", body: "", fields: {}, imagePath: null,
      status: "SCHEDULED", visibleFrom: Date.now() - 1000, publishedAt: now, createdAt: now, createdBy: prep.uid, updatedAt: now, updatedBy: prep.uid, updatedByName: prep.name, version: 1,
    }, "owner");
    const index = await fb.getDocument("cmsSettings/schedule", "owner");
    await fb.setDocument("cmsSettings/schedule", { tenantId: T, items: { ...index.items, "due-now": Date.now() - 1000 }, updatedAt: now, updatedBy: prep.uid }, "owner");
    assert.equal((await cms.publicEntry("POST", "due-now"))?.title, "Due now");
    assert.equal(await fb.getDocument(`cmsEntries/${future.id}`, null).catch((e) => e.status), 403, "not readable before its time");
    await assert.rejects(cms.saveEntry(prep, null, post({ slug: "past" }), "schedule", Date.now() - 1000), /future/);
  });
  test("links are unique per type", async () => {
    await cms.saveEntry(prep, null, post({ slug: "dup" }), "draft");
    await assert.rejects(cms.saveEntry(prep, null, post({ slug: "dup", title: "Other" }), "draft"), /already uses this link/);
  });
  test("two editors saving the same version: the second is told to reload", async () => {
    const created = await cms.saveEntry(prep, null, post({ slug: "race" }), "draft");
    const results = await Promise.allSettled([1, 2].map((n) => cms.saveEntry(prep, created.id, post({ slug: "race", title: `Edit ${n}` }), "draft")));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(results.find((r) => r.status === "rejected").reason.message, /Reload/);
  });
});

describe("content safety", () => {
  test("unverified team credentials and [Edit] placeholders cannot be published", async () => {
    const team = { type: "TEAM", slug: "pat", title: "Pat Preparer", summary: "", body: "", fields: { role: "Preparer", credentials: "Enrolled Agent" } };
    await assert.rejects(cms.saveEntry(prep, null, team, "publish"), /credentials/);
    const ok = await cms.saveEntry(prep, null, { ...team, fields: { ...team.fields, credentialsVerified: true } }, "publish");
    assert.equal(ok.status, "PUBLISHED");
    assert.equal(await cms.createStarterDrafts(prep), 6);
    assert.equal(await cms.createStarterDrafts(prep), 0, "starters are only created once");
    const starter = (await cms.listAllEntries(prep)).find((e) => e.slug === "tax-planning");
    await assert.rejects(cms.saveEntry(prep, starter.id, starter, "publish"), /placeholders/);
  });
  test("pages are limited to the known links", async () => {
    await assert.rejects(cms.saveEntry(prep, null, { type: "PAGE", slug: "admin", title: "x" }, "draft"), /Pages can use/);
  });
  test("clients cannot write content or read drafts; nobody can list everything anonymously", async () => {
    await assert.rejects(cms.saveEntry(client, null, post({ slug: "x" }), "draft"), /Forbidden/);
    const direct = fb.createWrite("cmsEntries/forged", { tenantId: T, type: "POST", slug: "forged", title: "Forged", summary: "", body: "", fields: {}, imagePath: null, status: "PUBLISHED", visibleFrom: 1, publishedAt: now, createdAt: now, createdBy: client.uid, updatedAt: now, updatedBy: client.uid, updatedByName: "x", version: 1 });
    assert.equal(await fb.commitWrites([direct], client.idToken).then(() => "ok", (e) => e.status), 403);
    await assert.rejects(fb.queryCollection("cmsEntries", null, { limit: 10 }));
    await assert.rejects(fb.queryCollection("cmsEntries", client.idToken, { limit: 10 }));
  });
});

describe("contact form and site settings", () => {
  test("a visitor's message reaches the staff inbox only", async () => {
    await cms.submitContactMessage({ name: "Sam Visitor", email: "sam@example.test", topic: "IRS notice", message: "I received a CP2000 letter." }, { ip: "10.9.0.1" });
    const inbox = await cms.listMessages(prep);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].status, "NEW");
    await cms.markMessage(prep, inbox[0].id, "HANDLED");
    assert.equal((await cms.listMessages(prep))[0].status, "HANDLED");
    await assert.rejects(cms.listMessages(client), /Forbidden/);
    await assert.rejects(fb.queryCollection("cmsMessages", client.idToken, { filters: [["tenantId", "EQUAL", T]] }));
    await assert.rejects(cms.submitContactMessage({ name: "Bot", email: "bot@example.test", message: "spam spam spam", company: "x" }), /try again/);
  });
  test("site contact details are public and editable by staff only", async () => {
    await cms.saveSiteSettings(prep, { phone: "555-0199", email: "office@example.test", hours: "Mon–Fri 9–5" });
    assert.equal((await cms.getSiteSettings()).phone, "555-0199");
    await assert.rejects(cms.saveSiteSettings(client, { phone: "1" }), /Forbidden/);
  });
});
