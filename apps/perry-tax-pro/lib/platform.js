// InnovaCare Software: the platform home and the products it opens. One app serves both
// the main domain (the platform pages) and the "tax." subdomain (InnovaTax), see proxy.js.
//
// Links to other products come from environment variables read at run time, so they can
// be set on Cloud Run without a rebuild. A product without a link shows "Coming soon"
// and sends visitors to the contact form instead of a made-up address.

const env = (name) => (process.env[name] || "").trim() || null;

// The tax site: its own subdomain once TAX_SITE_URL is set (https://tax.<domain>).
// Otherwise this same site, where only the tax home moved (to /tax): every other tax
// page, such as /login, keeps its own path.
export function taxUrl(path = "") {
  const base = env("TAX_SITE_URL");
  if (base) return `${base.replace(/\/$/, "")}${path || ""}`;
  return !path || path === "/" ? "/tax" : path;
}

// True when this request came in on the tax subdomain.
export const isTaxHost = (host) => /^tax\./i.test(String(host || ""));

// From the tax subdomain, the platform home is the same domain without "tax.".
export function platformHome(host) {
  const h = String(host || "");
  return isTaxHost(h) ? `https://${h.replace(/^tax\./i, "")}` : "/";
}

export function products() {
  return [
    {
      key: "tax", name: "InnovaTax", area: "Tax", icon: "receipt", href: taxUrl(),
      text: "Individual, self-employed and small-business tax preparation with a secure client portal.",
    },
    {
      key: "education", name: "InnovaCare Training", area: "Education", icon: "book", href: "/training",
      text: "NCLEX, nursing and medical exam review: question banks, practice exams and tutor support.",
    },
    {
      key: "compliance", name: "Compliance", area: "Compliance", icon: "shield", href: "/compliance",
      text: "Compliance training for healthcare teams: assign courses, track completion, keep certificates.",
    },
    {
      key: "ehr", name: "Electronic health records", area: "EHR", icon: "heart", href: "/ehr",
      text: "InnovaSoftware Clinic and CameroHealth: charting, scheduling and care coordination.",
    },
    {
      key: "software", name: "Software services", area: "Software", icon: "bolt", href: "/software",
      text: "Websites, SaaS, cloud computing, AI agents, agentic automation, mobile apps and more.",
    },
    {
      key: "services", name: "Find your service", area: "General services", icon: "search", href: "/find",
      text: "Travel, braids, doctors, wound care, lawn care and more, from local providers.",
    },
  ];
}

export function ehrProducts() {
  return [
    {
      key: "clinic", name: "InnovaSoftware Clinic", icon: "clipboard", href: env("CLINIC_URL"),
      text: "Clinic management for practices: patient charts, appointments, notes and billing in one place.",
    },
    {
      key: "camerohealth", name: "CameroHealth", icon: "heart", href: env("CAMEROHEALTH_URL"),
      text: "Health records and care coordination for clinics and care teams.",
    },
  ];
}

// Shortcuts on the service search. Each one runs a search for its word.
export const SERVICE_CATEGORIES = [
  { q: "travel", label: "Travel", icon: "send" },
  { q: "braids", label: "Braids & hair", icon: "sparkle" },
  { q: "doctor", label: "Doctor", icon: "heart" },
  { q: "wound care", label: "Wound care", icon: "shield" },
  { q: "lawn", label: "Lawn mowing", icon: "home" },
  { q: "cleaning", label: "Cleaning", icon: "refresh" },
  { q: "tax", label: "Tax & accounting", icon: "receipt" },
  { q: "tutoring", label: "Tutoring", icon: "book" },
  { q: "photography", label: "Photography", icon: "camera" },
  { q: "auto", label: "Auto repair", icon: "car" },
];

// The contact topic for a link's ?about= value, so each message says what it is about.
export function contactTopicFor(about) {
  const a = String(about || "").toLowerCase();
  if (!a) return null;
  if (a.includes("training") && !a.includes("compliance")) return "InnovaCare Training";
  if (a.includes("compliance")) return "Compliance training";
  if (a.includes("clinic") || a.includes("camerohealth") || a.includes("health record")) return "Health records (EHR)";
  if (a.includes("business")) return "List my business";
  return "Software project";
}

export const isExternal = (href) => /^https?:\/\//i.test(String(href || ""));
