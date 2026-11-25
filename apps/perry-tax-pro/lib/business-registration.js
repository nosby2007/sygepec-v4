// Small-business registration: the lists and the validation shared by the sign-up form
// (live checks) and the server (the real check). No server-only imports here.
//
// What is stored, and where:
//   taxUsers/{uid}           the owner's account (accountType BUSINESS)
//   bizProfiles/{uid}        the public page, created as a DRAFT (nothing is public yet)
//   bizRegistrations/{uid}   server-only legal and company details (legal name, entity type,
//                            last 4 digits of the EIN, year started, team size, …)
// A full EIN is never stored: only its last 4 digits, like SSNs elsewhere in the app.

export const ENTITY_TYPES = [
  ["SOLE_PROPRIETOR", "Sole proprietor"],
  ["SINGLE_MEMBER_LLC", "Single-member LLC"],
  ["MULTI_MEMBER_LLC", "Multi-member LLC"],
  ["PARTNERSHIP", "Partnership"],
  ["S_CORPORATION", "S corporation"],
  ["C_CORPORATION", "C corporation"],
  ["NONPROFIT", "Nonprofit"],
  ["NOT_SURE", "Not sure yet"],
];

export const INDUSTRIES = [
  ["BEAUTY", "Beauty, hair & barber"],
  ["WELLNESS", "Health & wellness"],
  ["FITNESS", "Fitness & coaching"],
  ["HOME_SERVICES", "Home services & repairs"],
  ["CLEANING", "Cleaning"],
  ["CONSTRUCTION", "Construction & trades"],
  ["LANDSCAPING", "Landscaping & outdoor"],
  ["AUTO", "Auto services"],
  ["FOOD", "Food, bakery & catering"],
  ["RETAIL", "Retail & online shop"],
  ["EVENTS", "Events, photo & video"],
  ["EDUCATION", "Education & tutoring"],
  ["CHILDCARE", "Childcare"],
  ["TRANSPORT", "Transport & delivery"],
  ["PROFESSIONAL", "Professional services"],
  ["CREATIVE", "Design, media & creative"],
  ["OTHER", "Other"],
];

export const TEAM_SIZES = [["1", "Just me"], ["2-5", "2–5 people"], ["6-10", "6–10 people"], ["11-50", "11–50 people"], ["51+", "More than 50"]];

export const SERVICE_MODES = [
  ["LOCATION", "Customers come to my location"],
  ["MOBILE", "I go to my customers"],
  ["BOTH", "Both"],
  ["ONLINE", "Online only"],
];

export const TIME_ZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Puerto_Rico", "Atlantic (Puerto Rico)"],
];

export const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

// The state's usual time zone, to preselect one (the owner can change it).
const STATE_ZONE = {
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", IN: "America/New_York", KY: "America/New_York", ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/New_York", NH: "America/New_York", NJ: "America/New_York", NY: "America/New_York", NC: "America/New_York", OH: "America/New_York", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York", VT: "America/New_York", VA: "America/New_York", WV: "America/New_York",
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago", KS: "America/Chicago", LA: "America/Chicago", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", NE: "America/Chicago", ND: "America/Chicago", OK: "America/Chicago", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", WI: "America/Chicago",
  CO: "America/Denver", ID: "America/Denver", MT: "America/Denver", NM: "America/Denver", UT: "America/Denver", WY: "America/Denver",
  AZ: "America/Phoenix", CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  AK: "America/Anchorage", HI: "Pacific/Honolulu", PR: "America/Puerto_Rico",
};
export const zoneForState = (state) => STATE_ZONE[String(state || "").toUpperCase()] || "America/New_York";

export const TERMS_VERSION = "2026-11";

const keys = (list) => list.map(([k]) => k);
const text = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const longText = (v, max) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
const pick = (list, v) => (keys(list).includes(v) ? v : "");
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const slugify = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
// Same rule and reserved words as the server (lib/business-booking.js cleanSlug).
const RESERVED = ["directory", "register", "admin", "portal", "api", "new", "book", "booking"];
export const slugValid = (slug) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && !RESERVED.includes(slug);

// 9 digits, typed with or without the dash. Only the last 4 are kept.
export function einLast4(value) {
  const digits = String(value || "").replace(/[\s-]/g, "");
  if (!digits) return { ok: true, last4: "" };
  return /^\d{9}$/.test(digits) && !/^(\d)\1{8}$/.test(digits) ? { ok: true, last4: digits.slice(5) } : { ok: false, last4: "" };
}

export const phoneDigits = (v) => String(v || "").replace(/\D/g, "");

// The checks of each step of the form, so the form can stop at the right step.
// Returns { field: message }.
export function stepErrors(step, f, { currentYear = new Date().getUTCFullYear() } = {}) {
  const e = {};
  if (step === "owner") {
    if (text(f.ownerName, 100).length < 2) e.ownerName = "Enter your full name.";
    if (!emailOk(text(f.email, 254).toLowerCase())) e.email = "Enter a valid email.";
    if (f.ownerPhone && phoneDigits(f.ownerPhone).length < 10) e.ownerPhone = "Enter a 10-digit phone number, or leave it empty.";
  }
  if (step === "business") {
    if (text(f.legalName, 120).length < 2) e.legalName = "Enter the legal name of the business.";
    if (text(f.displayName, 100).length < 2) e.displayName = "Enter the name customers know you by.";
    if (!pick(ENTITY_TYPES, f.entityType)) e.entityType = "Choose a business structure.";
    if (!pick(INDUSTRIES, f.industry)) e.industry = "Choose what your business does.";
    if (!pick(TEAM_SIZES, f.teamSize)) e.teamSize = "Choose your team size.";
    if (!einLast4(f.ein).ok) e.ein = "An EIN has 9 digits, like 12-3456789. Leave it empty if you do not have one.";
    if (f.yearStarted !== "" && f.yearStarted !== undefined && f.yearStarted !== null) {
      const y = Number(f.yearStarted);
      if (!Number.isInteger(y) || y < 1900 || y > currentYear) e.yearStarted = `Enter a year between 1900 and ${currentYear}.`;
    }
  }
  if (step === "location") {
    if (!pick(SERVICE_MODES, f.serviceMode)) e.serviceMode = "Choose where you serve customers.";
    const needsAddress = f.serviceMode !== "ONLINE";
    if (needsAddress && text(f.street, 120).length < 3) e.street = "Enter the street address.";
    if (text(f.city, 80).length < 2) e.city = "Enter the city.";
    if (!US_STATES.includes(String(f.state || "").toUpperCase())) e.state = "Choose the state.";
    if (!/^\d{5}(-\d{4})?$/.test(text(f.zip, 10))) e.zip = "Enter a 5-digit ZIP code.";
    if (!keys(TIME_ZONES).includes(f.timeZone)) e.timeZone = "Choose the time zone.";
    if (f.serviceMode === "MOBILE" || f.serviceMode === "BOTH") {
      const radius = Number(f.serviceRadius);
      if (f.serviceRadius !== "" && (!Number.isInteger(radius) || radius < 1 || radius > 500)) e.serviceRadius = "Enter a distance between 1 and 500 miles.";
    }
  }
  if (step === "page") {
    if (!slugValid(f.slug || "")) e.slug = "Use 3–40 lowercase letters, numbers or dashes.";
    if (f.publicPhone && phoneDigits(f.publicPhone).length < 10) e.publicPhone = "Enter a 10-digit phone number, or leave it empty.";
    if (f.publicEmail && !emailOk(text(f.publicEmail, 254).toLowerCase())) e.publicEmail = "Enter a valid email, or leave it empty.";
    if (f.website && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(text(f.website, 200))) e.website = "The website must start with https://";
    if (f.terms !== true) e.terms = "Accept the terms to create the workspace.";
  }
  return e;
}

export const STEPS = ["owner", "business", "location", "page"];

// The whole registration, checked and cleaned. Used by the server.
export function parseBusinessRegistration(input, opts = {}) {
  const f = input && typeof input === "object" ? input : {};
  const errors = Object.assign({}, ...STEPS.map((s) => stepErrors(s, f, opts)));
  const state = String(f.state || "").toUpperCase();
  const mobile = f.serviceMode === "MOBILE" || f.serviceMode === "BOTH";
  const street = f.serviceMode === "ONLINE" ? "" : text(f.street, 120);
  const suite = f.serviceMode === "ONLINE" ? "" : text(f.suite, 30);
  return {
    errors,
    owner: { name: text(f.ownerName, 100), email: text(f.email, 254).toLowerCase(), phone: text(f.ownerPhone, 30) },
    profile: {
      name: text(f.displayName, 100),
      slug: String(f.slug || ""),
      tagline: text(f.tagline, 140),
      description: longText(f.description, 2000),
      phone: text(f.publicPhone, 30),
      email: text(f.publicEmail, 254).toLowerCase(),
      // The street goes on the public page only when customers come to the business.
      address: f.serviceMode === "LOCATION" || f.serviceMode === "BOTH" ? [street, suite].filter(Boolean).join(", ").slice(0, 150) : "",
      city: text(f.city, 80),
      state,
      zip: text(f.zip, 10),
      website: text(f.website, 200),
      status: "DRAFT",
      publicBooking: false,
      autoConfirm: false,
      booking: { timeZone: f.timeZone },
    },
    registration: {
      legalName: text(f.legalName, 120),
      displayName: text(f.displayName, 100),
      entityType: pick(ENTITY_TYPES, f.entityType),
      industry: pick(INDUSTRIES, f.industry),
      einLast4: einLast4(f.ein).last4 || null,
      yearStarted: f.yearStarted === "" || f.yearStarted === undefined || f.yearStarted === null ? null : Number(f.yearStarted),
      teamSize: pick(TEAM_SIZES, f.teamSize),
      serviceMode: pick(SERVICE_MODES, f.serviceMode),
      serviceRadiusMiles: mobile && f.serviceRadius !== "" && f.serviceRadius !== undefined ? Number(f.serviceRadius) : null,
      street, suite, city: text(f.city, 80), state, zip: text(f.zip, 10),
      timeZone: f.timeZone,
      termsVersion: TERMS_VERSION,
    },
  };
}

// The details an owner may change later (Business details card). Same rules as sign-up.
export function parseRegistrationUpdate(input, current = {}, opts = {}) {
  const merged = { ...registrationToForm(current), ...(input && typeof input === "object" ? input : {}) };
  const errors = { ...stepErrors("business", merged, opts), ...stepErrors("location", merged, opts) };
  const { registration } = parseBusinessRegistration({ ...merged, ein: merged.ein || "" }, opts);
  // An empty EIN field on an update keeps the digits already on file.
  if (!merged.ein) registration.einLast4 = current.einLast4 || null;
  return { errors, registration };
}

export function registrationToForm(r = {}) {
  return {
    legalName: r.legalName || "", displayName: r.displayName || "", entityType: r.entityType || "", industry: r.industry || "",
    ein: "", yearStarted: r.yearStarted ?? "", teamSize: r.teamSize || "", serviceMode: r.serviceMode || "",
    serviceRadius: r.serviceRadiusMiles ?? "", street: r.street || "", suite: r.suite || "", city: r.city || "", state: r.state || "", zip: r.zip || "", timeZone: r.timeZone || "America/New_York",
  };
}

export const labelOf = (list, key) => list.find(([k]) => k === key)?.[1] || "";
