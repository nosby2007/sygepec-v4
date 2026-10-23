import "server-only";

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export function mutationGuard(request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  return null;
}

export function cleanText(value, max = 200) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

export function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };

const FILING = new Set(["SINGLE", "MFJ", "MFS", "HOH", "QSS"]);
const INCOME_FIELDS = ["w2Wages", "w2Withheld", "selfEmployment", "interest", "dividends", "unemployment", "retirement", "other"];
const DEDUCTION_FIELDS = ["mortgageInterest", "propertyTax", "charity", "studentLoan", "childcare"];

function cleanMoneyFields(source, fields) {
  return Object.fromEntries(fields.map((field) => {
    const value = cleanText(source?.[field], 20);
    return [field, /^\d{0,10}(\.\d{0,2})?$/.test(value) ? value : ""];
  }));
}

export function sanitizeIntake(value) {
  const source = value && typeof value === "object" ? value : {};
  const personal = source.personal && typeof source.personal === "object" ? source.personal : {};
  const spouse = source.spouse && typeof source.spouse === "object" ? source.spouse : {};
  const refund = source.refund && typeof source.refund === "object" ? source.refund : {};
  const filingStatus = cleanText(source.filingStatus, 10);
  return {
    personal: {
      firstName: cleanText(personal.firstName, 60),
      lastName: cleanText(personal.lastName, 60),
      dob: /^\d{4}-\d{2}-\d{2}$/.test(personal.dob || "") ? personal.dob : "",
      ssnLast4: String(personal.ssnLast4 || "").replace(/\D/g, "").slice(-4),
      phone: cleanText(personal.phone, 30),
      occupation: cleanText(personal.occupation, 100),
      address: cleanText(personal.address, 150),
      city: cleanText(personal.city, 80),
      state: cleanText(personal.state, 2).toUpperCase(),
      zip: cleanText(personal.zip, 10),
    },
    filingStatus: FILING.has(filingStatus) ? filingStatus : "",
    spouse: {
      name: cleanText(spouse.name, 120),
      occupation: cleanText(spouse.occupation, 100),
    },
    dependents: (Array.isArray(source.dependents) ? source.dependents : []).slice(0, 20).map((dependent) => ({
      name: cleanText(dependent?.name, 120),
      relationship: cleanText(dependent?.relationship, 60),
      age: cleanText(dependent?.age, 3),
    })),
    income: cleanMoneyFields(source.income, INCOME_FIELDS),
    deductions: cleanMoneyFields(source.deductions, DEDUCTION_FIELDS),
    refund: {
      method: ["direct_deposit", "check", "apply"].includes(refund.method) ? refund.method : "direct_deposit",
      accountLast4: String(refund.accountLast4 || "").replace(/\D/g, "").slice(-4),
    },
    submitted: source.submitted === true,
  };
}
