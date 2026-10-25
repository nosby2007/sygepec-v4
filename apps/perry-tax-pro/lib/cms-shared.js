// Content types, publication states and validation for the public-site CMS.
// Pure functions shared by the admin editor (client) and the server.

export const CMS_TYPES = {
  PAGE: { label: "Page", plural: "Pages", path: (slug) => `/${slug}` },
  SERVICE: { label: "Service", plural: "Services", path: (slug) => `/services/${slug}` },
  POST: { label: "Blog post", plural: "Blog", path: (slug) => `/blog/${slug}` },
  UPDATE: { label: "Update", plural: "Updates", path: (slug) => `/updates#${slug}` },
  TEAM: { label: "Team member", plural: "Team", path: () => "/team" },
};

// DRAFT and ARCHIVED are never public. SCHEDULED becomes public on its own once its time
// passes: the rules compare `visibleFrom` with the request time, so no job is needed.
export const CMS_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

// Pages with these slugs replace built-in routes; anything else is refused for pages.
export const PAGE_SLUGS = ["about", "contact", "privacy", "terms"];

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const list = (value, max) => (Array.isArray(value) ? value : []).slice(0, max);

export function slugify(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function cleanInternalPath(value) {
  const path = clean(value, 120);
  return /^\/[a-z0-9/_-]*$/i.test(path) && !path.startsWith("//") ? path : "";
}

// Validates editor input for one entry. Returns the stored shape plus readable errors.
export function parseEntry(input) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const type = CMS_TYPES[src.type] ? src.type : null;
  if (!type) errors.push("Unknown content type.");
  const title = clean(src.title, 200);
  if (!title) errors.push("Enter a title.");
  const slug = clean(src.slug, 80).toLowerCase();
  if (!SLUG.test(slug)) errors.push("The link must use lowercase letters, numbers and dashes.");
  if (type === "PAGE" && !PAGE_SLUGS.includes(slug)) errors.push(`Pages can use these links: ${PAGE_SLUGS.join(", ")}.`);
  const f = src.fields && typeof src.fields === "object" ? src.fields : {};
  let fields = {};
  if (type === "SERVICE") {
    fields = {
      benefits: list(f.benefits, 10).map((b) => clean(b, 200)).filter(Boolean),
      steps: list(f.steps, 10).map((s) => ({ title: clean(s?.title, 120), text: clean(s?.text, 600) })).filter((s) => s.title),
      faqs: list(f.faqs, 15).map((q) => ({ q: clean(q?.q, 200), a: clean(q?.a, 1500) })).filter((q) => q.q && q.a),
      ctaLabel: clean(f.ctaLabel, 40) || "Book an appointment",
      ctaHref: cleanInternalPath(f.ctaHref) || "/book",
      order: Number.isInteger(Number(f.order)) ? Math.max(0, Math.min(999, Number(f.order))) : 100,
    };
  } else if (type === "TEAM") {
    fields = {
      role: clean(f.role, 80),
      credentials: clean(f.credentials, 200),
      credentialsVerified: f.credentialsVerified === true,
      order: Number.isInteger(Number(f.order)) ? Math.max(0, Math.min(999, Number(f.order))) : 100,
    };
  } else if (type === "POST") {
    fields = {
      author: clean(f.author, 80),
      tags: list(f.tags, 8).map((t) => clean(t, 30)).filter(Boolean),
    };
  }
  return {
    errors,
    entry: {
      type,
      slug,
      title,
      summary: clean(src.summary, 400),
      body: clean(src.body, 30000).replace(/\r\n/g, "\n"),
      fields,
    },
  };
}

// What a publish/schedule/archive request turns into. `previous` is the stored entry.
export function nextState(intent, { previous, publishAt, nowMs }) {
  switch (intent) {
    case "publish":
      return { status: "PUBLISHED", visibleFrom: previous?.status === "PUBLISHED" && previous.visibleFrom ? previous.visibleFrom : nowMs };
    case "schedule": {
      const at = Number(publishAt);
      if (!Number.isInteger(at) || at <= nowMs + 60_000) return { error: "Choose a publication time in the future." };
      return { status: "SCHEDULED", visibleFrom: at };
    }
    case "archive":
      return { status: "ARCHIVED", visibleFrom: null };
    case "draft":
    case "restore":
      return { status: "DRAFT", visibleFrom: null };
    default:
      return { error: "Unknown action." };
  }
}

// Status as readers see it: a scheduled entry whose time has come is live.
export function liveStatus(entry, nowMs) {
  if (entry.status === "SCHEDULED" && entry.visibleFrom && entry.visibleFrom <= nowMs) return "PUBLISHED";
  return entry.status;
}

export function publicationProblems(entry) {
  const problems = [];
  if (entry.type === "TEAM" && entry.fields?.credentials && !entry.fields.credentialsVerified)
    problems.push("Confirm the credentials are current and verifiable before publishing, or remove them.");
  if (entry.type === "SERVICE" && !entry.summary) problems.push("Add a short description before publishing a service.");
  if (/\[(edit|todo|placeholder)[^\]]*\]/i.test(`${entry.title} ${entry.summary} ${entry.body}`))
    problems.push("Replace the [Edit…] placeholders before publishing.");
  return problems;
}
