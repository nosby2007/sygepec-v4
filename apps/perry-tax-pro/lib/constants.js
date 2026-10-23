export const STATUSES = [
  { key: "INTAKE", label: "Intake", desc: "Complete your tax questionnaire" },
  { key: "DOCS_PENDING", label: "Documents", desc: "Upload your tax documents" },
  { key: "IN_REVIEW", label: "In Review", desc: "Your preparer is working on your return" },
  { key: "READY_TO_SIGN", label: "Ready to Sign", desc: "Review and sign Form 8879" },
  { key: "FILED", label: "Filed", desc: "Submitted to the IRS" },
  { key: "ACCEPTED", label: "Accepted", desc: "IRS accepted your return" },
];

export const statusLabel = (k) => STATUSES.find((s) => s.key === k)?.label || k;
export const statusIndex = (k) => Math.max(0, STATUSES.findIndex((s) => s.key === k));

export const SIGNATURE_STATUSES = [
  { key: "NOT_REQUESTED", label: "Not requested" },
  { key: "REQUESTED", label: "Signature requested" },
  { key: "SIGNED", label: "Signed" },
  { key: "DECLINED", label: "Declined" },
];

export const SIGNATURE_METHODS = [
  { key: "REMOTE", label: "Remote / e-sign" },
  { key: "IN_PERSON", label: "In person" },
  { key: "OTHER", label: "Other verified method" },
];

export const SUBMISSION_STATUSES = [
  { key: "NOT_READY", label: "Not ready" },
  { key: "READY", label: "Ready to e-file" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "REJECTED", label: "Rejected / action needed" },
];

export const workflowLabel = (items, key) => items.find((item) => item.key === key)?.label || key;

export const FILING_STATUSES = [
  { key: "SINGLE", label: "Single" },
  { key: "MFJ", label: "Married Filing Jointly" },
  { key: "MFS", label: "Married Filing Separately" },
  { key: "HOH", label: "Head of Household" },
  { key: "QSS", label: "Qualifying Surviving Spouse" },
];

export const DOC_TYPES = {
  ID: "Photo ID (Driver's License / Passport)",
  SSN: "Social Security Cards (all filers & dependents)",
  W2: "W-2 Wage Statement",
  "1099NEC": "1099-NEC / 1099-K (Self-Employment)",
  "1099INT": "1099-INT (Interest)",
  "1099DIV": "1099-DIV (Dividends)",
  "1099G": "1099-G (Unemployment)",
  "1099R": "1099-R (Retirement / Pension)",
  "1098": "1098 (Mortgage Interest)",
  "1098E": "1098-E (Student Loan Interest)",
  CHILDCARE: "Childcare Provider Receipts",
  CHARITY: "Charitable Donation Receipts",
  BIZEXP: "Business Expense Records",
  PRIOR: "Prior Year Tax Return",
  OTHER: "Other Document",
};

export const SERVICES = [
  "Individual Return",
  "Self-Employed / Gig Worker",
  "Small Business Return",
  "Tax Planning Consultation",
  "IRS Notice / Amendment",
];

export const money = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmtDate = (s, opts = { month: "short", day: "numeric", year: "numeric" }) => {
  if (!s) return "";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", opts);
};
