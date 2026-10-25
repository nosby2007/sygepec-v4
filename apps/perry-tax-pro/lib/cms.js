import "server-only";
import crypto from "node:crypto";
import {
  commitWrites, createWrite, getDocument, isConflict, queryCollection, replaceWrite, setDocument, signInAnonymously, TAX_TENANT,
} from "@/lib/firebase";
import { nextState, parseEntry, publicationProblems } from "@/lib/cms-shared";
import { cleanEmail, cleanText, safeId } from "@/lib/security";
import { throttle } from "@/lib/business-booking";

//   cmsEntries/{id}     pages, services, posts, updates, team (public once visibleFrom <= now)
//   cmsRevisions/{id}   one snapshot per save, append-only
//   cmsSettings/site    public contact details shown on the site
//   cmsMessages/{id}    contact-form messages for staff

export class CmsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const requirePreparer = (session) => {
  if (session?.role !== "PREPARER") throw new CmsError("Forbidden", 403);
};

function entryDto(row) {
  return {
    id: row.id, type: row.type, slug: row.slug, title: row.title, summary: row.summary || "", body: row.body || "",
    fields: row.fields || {}, imagePath: row.imagePath || null, status: row.status, visibleFrom: row.visibleFrom ?? null,
    publishedAt: row.publishedAt || null, updatedAt: row.updatedAt, updatedByName: row.updatedByName || "", version: row.version || 1,
  };
}

export async function listAllEntries(session) {
  requirePreparer(session);
  const rows = await queryCollection("cmsEntries", session.idToken, { limit: 1000 });
  return rows.filter((r) => r.tenantId === TAX_TENANT).map(entryDto).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getEntry(session, rawId) {
  requirePreparer(session);
  const id = safeId(rawId);
  const row = id ? await getDocument(`cmsEntries/${id}`, session.idToken).catch(() => null) : null;
  return row && row.tenantId === TAX_TENANT ? { ...entryDto(row), updateTime: row.updateTime } : null;
}

// Saves the editor's content and applies the requested state change in one commit,
// together with a revision snapshot. `intent`: draft | publish | schedule | archive | restore.
export async function saveEntry(session, rawId, input, intent, publishAt) {
  requirePreparer(session);
  const { entry, errors } = parseEntry(input);
  if (errors.length) throw new CmsError(errors.join(" "));
  const nowMs = Date.now();
  const id = rawId ? safeId(rawId) : crypto.randomUUID();
  const current = rawId ? await getDocument(`cmsEntries/${id}`, session.idToken).catch(() => null) : null;
  if (rawId && !current) throw new CmsError("Content not found.", 404);
  if (current && current.type !== entry.type) throw new CmsError("The content type cannot change.");

  const sameSlug = await queryCollection("cmsEntries", session.idToken, { filters: [["slug", "EQUAL", entry.slug]], limit: 20 });
  if (sameSlug.some((row) => row.id !== id && row.type === entry.type && row.status !== "ARCHIVED"))
    throw new CmsError("Another item already uses this link.", 409);

  const state = nextState(intent, { previous: current, publishAt, nowMs });
  if (state.error) throw new CmsError(state.error);
  if (["PUBLISHED", "SCHEDULED"].includes(state.status)) {
    const problems = publicationProblems(entry);
    if (problems.length) throw new CmsError(problems.join(" "));
  }

  const now = new Date(nowMs).toISOString();
  const version = (current?.version || 0) + 1;
  const doc = {
    tenantId: TAX_TENANT,
    ...entry,
    imagePath: current?.imagePath || null,
    status: state.status,
    visibleFrom: state.visibleFrom,
    publishedAt: state.status === "PUBLISHED" ? current?.publishedAt || now : state.status === "SCHEDULED" ? new Date(state.visibleFrom).toISOString() : current?.publishedAt || null,
    createdAt: current?.createdAt || now,
    createdBy: current?.createdBy || session.uid,
    updatedAt: now,
    updatedBy: session.uid,
    updatedByName: session.name,
    version,
  };
  const path = `cmsEntries/${id}`;
  const writes = [
    current ? replaceWrite(path, doc, current.updateTime) : createWrite(path, doc),
    revisionWrite(id, doc, intent, session, now),
  ];
  const scheduleWrite = await scheduleIndexWrite(session, id, doc);
  if (scheduleWrite) writes.push(scheduleWrite);
  try {
    await commitWrites(writes, session.idToken);
  } catch (error) {
    // A concurrent save can surface as a precondition failure or, because the version
    // check runs first, as a rules refusal; either way the stored entry has moved on.
    const latest = current ? await getDocument(path, session.idToken).catch(() => null) : null;
    if (isConflict(error) || (latest && latest.updateTime !== current.updateTime))
      throw new CmsError("Someone else saved this item meanwhile. Reload to see their version.", 409);
    throw error;
  }
  return { id, ...entryDto({ ...doc, id }) };
}

// Keeps cmsSettings/schedule (entry ID -> visibleFrom) in step with scheduled entries,
// so public pages can find scheduled content once it is due. Returns null if unchanged.
async function scheduleIndexWrite(session, id, doc) {
  const current = await getDocument("cmsSettings/schedule", session.idToken).catch(() => null);
  const items = { ...(current?.items || {}) };
  if (doc.status === "SCHEDULED") items[id] = doc.visibleFrom;
  else if (id in items) delete items[id];
  else return null;
  const data = { tenantId: TAX_TENANT, items, updatedAt: doc.updatedAt, updatedBy: session.uid };
  return current ? replaceWrite("cmsSettings/schedule", data, current.updateTime) : createWrite("cmsSettings/schedule", data);
}

function revisionWrite(entryId, doc, action, session, now) {
  return createWrite(`cmsRevisions/${crypto.randomUUID()}`, {
    tenantId: TAX_TENANT,
    entryId,
    version: doc.version,
    action,
    snapshot: {
      type: doc.type, slug: doc.slug, title: doc.title, summary: doc.summary, body: doc.body, fields: doc.fields,
      imagePath: doc.imagePath, status: doc.status, visibleFrom: doc.visibleFrom,
    },
    savedBy: session.uid,
    savedByName: session.name,
    savedAt: now,
  });
}

export async function setEntryImage(session, rawId, imagePath) {
  requirePreparer(session);
  const id = safeId(rawId);
  const row = id ? await getDocument(`cmsEntries/${id}`, session.idToken).catch(() => null) : null;
  if (!row || row.tenantId !== TAX_TENANT) throw new CmsError("Content not found.", 404);
  const { id: _id, createTime: _c, updateTime, ...data } = row;
  const now = new Date().toISOString();
  const doc = { ...data, imagePath, updatedAt: now, updatedBy: session.uid, updatedByName: session.name, version: (data.version || 0) + 1 };
  await commitWrites([replaceWrite(`cmsEntries/${id}`, doc, updateTime), revisionWrite(id, doc, "image", session, now)], session.idToken);
  return entryDto({ ...doc, id });
}

export async function listRevisions(session, rawId) {
  requirePreparer(session);
  const id = safeId(rawId);
  if (!id) return [];
  const rows = await queryCollection("cmsRevisions", session.idToken, { filters: [["entryId", "EQUAL", id]], limit: 200 });
  return rows.sort((a, b) => b.version - a.version).map(({ id: revId, version, action, snapshot, savedByName, savedAt }) => ({ id: revId, version, action, snapshot, savedByName, savedAt }));
}

// ---- Public reads ---------------------------------------------------------------

// Published entries come from a list query; scheduled ones that are due are read one by
// one through the schedule index (the rules allow each read only once its time passed).
export async function publicEntries(type) {
  const [published, schedule] = await Promise.all([
    queryCollection("cmsEntries", null, {
      filters: [["status", "EQUAL", "PUBLISHED"], ["tenantId", "EQUAL", TAX_TENANT]], limit: 500,
    }).catch(() => []),
    getDocument("cmsSettings/schedule", null).catch(() => null),
  ]);
  const nowMs = Date.now();
  const dueIds = Object.entries(schedule?.items || {}).filter(([, at]) => at <= nowMs).map(([id]) => safeId(id)).filter(Boolean);
  const due = await Promise.all(dueIds.map((id) => getDocument(`cmsEntries/${id}`, null).catch(() => null)));
  return [...published, ...due.filter((r) => r?.status === "SCHEDULED")]
    .filter((r) => r.tenantId === TAX_TENANT && r.type === type)
    .map(entryDto)
    .sort((a, b) => (a.fields.order ?? 100) - (b.fields.order ?? 100) || b.visibleFrom - a.visibleFrom);
}

export async function publicEntry(type, slug) {
  return (await publicEntries(type)).find((e) => e.slug === slug) || null;
}

const SITE_DEFAULTS = { phone: "", email: "", address: "", hours: "" };

export async function getSiteSettings() {
  const row = await getDocument("cmsSettings/site", null).catch(() => null);
  return { ...SITE_DEFAULTS, ...(row ? { phone: row.phone, email: row.email, address: row.address, hours: row.hours } : {}) };
}

export async function saveSiteSettings(session, input) {
  requirePreparer(session);
  const email = input.email ? cleanEmail(input.email) : "";
  if (input.email && !email) throw new CmsError("Enter a valid email.");
  const settings = {
    phone: cleanText(input.phone, 30), email, address: cleanText(input.address, 200), hours: cleanText(input.hours, 120),
  };
  await setDocument("cmsSettings/site", { tenantId: TAX_TENANT, ...settings, updatedAt: new Date().toISOString(), updatedBy: session.uid }, session.idToken);
  return settings;
}

// ---- Contact form -----------------------------------------------------------------

export const CONTACT_TOPICS = ["Individual return", "Self-employed / gig work", "Small business", "IRS notice", "Something else"];

export async function submitContactMessage(input, { ip = "unknown" } = {}) {
  if (input.company || (Number(input.startedAt) && Date.now() - Number(input.startedAt) < 2500)) throw new CmsError("Please try again.");
  const name = cleanText(input.name, 100);
  const email = cleanEmail(input.email);
  const message = cleanText(input.message, 3000);
  if (name.length < 2 || !email || message.length < 10) throw new CmsError("Enter your name, a valid email and a message of at least 10 characters.");
  if (!throttle(`contact-ip:${ip}`, 5, 60 * 60_000) || !throttle(`contact-email:${email}`, 3, 24 * 60 * 60_000))
    throw new CmsError("Too many messages. Please try again later or call us.", 429);
  const sender = await signInAnonymously();
  await setDocument(`cmsMessages/${crypto.randomUUID()}`, {
    tenantId: TAX_TENANT, name, email, phone: cleanText(input.phone, 30) || null,
    topic: CONTACT_TOPICS.includes(input.topic) ? input.topic : CONTACT_TOPICS.at(-1),
    message, status: "NEW", senderUid: sender.localId, createdAt: new Date().toISOString(), handledBy: null, handledAt: null,
  }, sender.idToken, { createOnly: true });
}

export async function listMessages(session) {
  requirePreparer(session);
  const rows = await queryCollection("cmsMessages", session.idToken, { filters: [["tenantId", "EQUAL", TAX_TENANT]], limit: 500 });
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markMessage(session, rawId, status) {
  requirePreparer(session);
  const id = safeId(rawId);
  const row = id ? await getDocument(`cmsMessages/${id}`, session.idToken).catch(() => null) : null;
  if (!row) throw new CmsError("Message not found.", 404);
  if (!["NEW", "HANDLED"].includes(status)) throw new CmsError("Unknown status.");
  const { id: _id, createTime: _c, updateTime, ...data } = row;
  await commitWrites([replaceWrite(`cmsMessages/${id}`, {
    ...data, status, handledBy: status === "HANDLED" ? session.uid : null, handledAt: status === "HANDLED" ? new Date().toISOString() : null,
  }, updateTime)], session.idToken);
}

// ---- Starter drafts ---------------------------------------------------------------

// Drafts built from the service blurbs already on the home page. Everything else is a
// visible [Edit…] placeholder, and publishing is refused until those are replaced.
const STARTERS = [
  ["SERVICE", "individual-family", "Individual & Family", "W-2 income, dependents, credits like CTC and EITC. Maximize every dollar you're owed."],
  ["SERVICE", "self-employed-gig", "Self-Employed & Gig", "1099-NEC, rideshare, delivery and freelance income with expense tracking and SE tax planning."],
  ["SERVICE", "tax-planning", "Tax Planning", "Year-round strategy sessions to lower next year's bill before it happens."],
  ["SERVICE", "irs-notices-amendments", "IRS Notices & Amendments", "Got a letter? We review, respond and amend prior-year returns when needed."],
  ["PAGE", "about", "About us", ""],
  ["PAGE", "contact", "Contact", ""],
];

export async function createStarterDrafts(session) {
  requirePreparer(session);
  const existing = await listAllEntries(session);
  let created = 0;
  for (const [type, slug, title, summary] of STARTERS) {
    if (existing.some((e) => e.type === type && e.slug === slug)) continue;
    const fields = type === "SERVICE"
      ? { benefits: ["[Edit: a concrete benefit you can stand behind]"], steps: [{ title: "[Edit: first step]", text: "[Edit: what happens]" }], faqs: [{ q: "[Edit: a question clients ask]", a: "[Edit: your answer]" }], ctaLabel: "Book an appointment", ctaHref: "/book", order: created * 10 }
      : {};
    await saveEntry(session, null, {
      type, slug, title, summary, fields,
      body: type === "PAGE" ? `[Edit: write the ${title.toLowerCase()} page. Only include facts you can verify.]` : "[Edit: describe the service in your own words.]",
    }, "draft");
    created++;
  }
  return created;
}
