// InnovaCare Software: the platform home and the products it opens. One app serves both
// the main domain (the platform pages) and the "tax." subdomain (InnovaTax), see proxy.js.
//
// Links to other products come from environment variables read at run time, so they can
// be set on Cloud Run without a rebuild. A product without a link shows "Coming soon"
// and sends visitors to the contact form instead of a made-up address.

const env = (name) => (process.env[name] || "").trim() || null;

// The tax site: its own subdomain once TAX_SITE_URL is set (https://tax.<domain>),
// otherwise the /tax pages of this same site.
export const taxUrl = (path = "") => (env("TAX_SITE_URL") ? `${env("TAX_SITE_URL").replace(/\/$/, "")}${path || ""}` : `/tax${path && path !== "/" ? path : ""}`);

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
      key: "education", name: "InnovaCare Training", area: "Education", icon: "book", href: env("TRAINING_URL"),
      text: "Courses, certifications and continuing education for health and service professionals.",
    },
    {
      key: "compliance", name: "Compliance", area: "Compliance", icon: "shield", href: env("COMPLIANCE_URL"),
      text: "Document review, policies and audit readiness for regulated teams.",
    },
    {
      key: "ehr", name: "Electronic health records", area: "EHR", icon: "heart", href: "/ehr",
      text: "InnovaSoftware Clinic and CameroHealth: charting, scheduling and care coordination.",
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

export const isExternal = (href) => /^https?:\/\//i.test(String(href || ""));
