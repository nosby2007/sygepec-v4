// What each business plan includes. Shared by the server (checks) and the screens
// (upgrade prompts), so nothing here may import server-only modules.
import { ACTIVE_SUBSCRIPTION, BUSINESS_PLANS } from "@/lib/billing";

export const PLAN_ORDER = ["BASIC", "ADVANCED", "PREMIUM"];

// Feature → the lowest plan that includes it.
export const FEATURES = {
  WORKSPACE: { plan: "BASIC", label: "Your business workspace" },
  BOOKKEEPING: { plan: "BASIC", label: "Bookkeeping and receipts" },
  INVOICES: { plan: "BASIC", label: "Invoices and online pay links" },
  PUBLIC_PAGE: { plan: "ADVANCED", label: "Public page and online booking" },
  BOOKINGS: { plan: "ADVANCED", label: "Booking calendar" },
  AUTO_REMINDERS: { plan: "ADVANCED", label: "Automatic booking reminders" },
  RECONCILIATION: { plan: "ADVANCED", label: "Bank reconciliation" },
  FEEDBACK: { plan: "ADVANCED", label: "Customer feedback and reviews" },
  TEAM: { plan: "ADVANCED", label: "Team members" },
  CAMPAIGNS: { plan: "PREMIUM", label: "Email marketing campaigns" },
  QUARTERLY_REVIEW: { plan: "PREMIUM", label: "Quarterly estimated-tax review with your preparer" },
};

// Which feature a business page or API path needs. The first matching prefix wins;
// anything else in the business area needs at least an active plan or trial. The plan
// page and payments always stay open so an owner can pay.
const PATH_FEATURES = [
  ["/portal/business/plan", null],
  ["/api/payments", null],
  // Always open, so an owner without a plan can still see and export their books.
  ["/portal/business/accounting", null],
  ["/portal/business/bookings", "BOOKINGS"],
  ["/api/business/bookings", "BOOKINGS"],
  ["/api/business/appointments", "BOOKINGS"],
  ["/api/business/reminders", "BOOKINGS"],
  ["/portal/business/team", "TEAM"],
  ["/api/business/staff", "TEAM"],
  ["/api/business/reconciliation", "RECONCILIATION"],
  ["/api/business/growth/campaigns", "CAMPAIGNS"],
  ["/portal/business", "WORKSPACE"],
  ["/api/business", "WORKSPACE"],
];

export function featureForPath(pathname) {
  const hit = PATH_FEATURES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

// Team members (staff calendars) on top of the owner. null = no limit.
export const TEAM_LIMIT = { BASIC: 0, ADVANCED: 3, PREMIUM: null };

// What the plan cards list.
export const PLAN_HIGHLIGHTS = {
  BASIC: ["Bookkeeping, income, expenses and receipts", "Invoices with online pay links to your bank", "Tax set-aside and quarterly reminders", "Customer list", "Year-end handoff to your preparer"],
  ADVANCED: ["Everything in Basic", "Public page and online booking", "Automatic booking reminders", "Bank reconciliation", "Customer feedback and reviews", "Up to 3 team members"],
  PREMIUM: ["Everything in Advanced", "Email marketing campaigns", "Unlimited team members", "Quarterly estimated-tax review with your preparer", "Priority support"],
};

export const TRIAL_DAYS = 30;
// Accounts that existed before plans were enforced get their trial from this date.
export const PLANS_LAUNCHED = "2026-10-29T00:00:00.000Z";
const DAY = 86_400_000;

// The plan a business may use right now: a paid plan, the trial (all Premium features),
// or none (only the plan page and data export).
export function entitlement({ billing, createdAt, nowMs = Date.now() }) {
  if (billing?.plan && BUSINESS_PLANS[billing.plan] && ACTIVE_SUBSCRIPTION.has(billing.status)) {
    return { plan: billing.plan, trial: false, trialEndsAt: null, active: true, pastDue: billing.status === "past_due" };
  }
  const start = Math.max(Date.parse(createdAt || PLANS_LAUNCHED) || 0, Date.parse(PLANS_LAUNCHED));
  const trialEndsMs = start + TRIAL_DAYS * DAY;
  if (nowMs < trialEndsMs) return { plan: "PREMIUM", trial: true, trialEndsAt: new Date(trialEndsMs).toISOString(), active: true, pastDue: false };
  return { plan: null, trial: false, trialEndsAt: new Date(trialEndsMs).toISOString(), active: false, pastDue: false };
}

export function allows(ent, feature) {
  const need = FEATURES[feature]?.plan;
  if (!need || !ent?.plan) return false;
  return PLAN_ORDER.indexOf(ent.plan) >= PLAN_ORDER.indexOf(need);
}

export function teamLimit(ent) {
  return ent?.plan ? TEAM_LIMIT[ent.plan] : 0;
}

export const planName = (key) => BUSINESS_PLANS[key]?.name || key;

export function upgradeMessage(feature) {
  const f = FEATURES[feature];
  return f ? `${f.label} is part of the ${planName(f.plan)} plan. Upgrade under Plan & payments.` : "Choose a plan under Plan & payments.";
}
