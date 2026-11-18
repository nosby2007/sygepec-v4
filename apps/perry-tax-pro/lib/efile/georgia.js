// Georgia electronic filing: the Georgia Form 500 package, Georgia's own checks, its link
// to the federal submission, and what Georgia must approve before anything is filed.
//
// What Georgia publishes (checked November 2026; confirm each year):
//   - Georgia takes individual income tax returns through the Fed/State Modernized e-File
//     program. Its guide for software developers is the "Fed/State MeF Individual Income
//     Tax Electronic Filing Guidelines & Information for Software Developers".
//   - A software developer sends Georgia a Letter of Intent for each tax year and registers
//     each product before testing. Georgia then runs its own testing and approves the
//     product. Georgia sets its own deadlines every year.
//   - Approval by the IRS does not include Georgia. The IRS e-file application, ATS and
//     the federal production status are all needed, and Georgia's approval on top of them.
//
// Nothing below is Georgia's schema. The Georgia XML schema and business rules for Form
// 500 come from Georgia DOR to registered developers. Until they are installed, packages
// use the InnovaTax Georgia sandbox format, which is named as such and never sent to
// Georgia. No Georgia element name, rule number, endpoint or acknowledgement format is
// written from memory.
export const GEORGIA_PROGRAM = {
  program: "Fed/State Modernized e-File (MeF)",
  forms: ["Form 500", "Form 500 with Schedule 3"],
  contact: "Georgia DOR, software vendor support (GA.Vendors@dor.ga.gov)",
  sources: [
    { title: "Georgia DOR: Fed/State MeF Individual Income Tax Electronic Filing Guidelines & Information for Software Developers (the newest edition found was for tax year 2017; ask Georgia for the current one)", url: "https://dor.georgia.gov/document/publication/fedstate-mef-individual-income-tax-electronic-filing-guidelines-ty2017/download" },
    { title: "Georgia DOR: Print and Electronic Returns Letter of Intent (published each year)", url: "https://dor.georgia.gov/document/document/ty-2022-print-and-electronic-letter-intent-finalpdf/download" },
  ],
  notes: [
    "Federal approval does not authorize Georgia filing.",
    "Georgia's Letter of Intent and product registration come before Georgia testing, with deadlines Georgia sets each year.",
    "A state return linked to a federal return depends on that federal return: if the federal return is rejected, the linked Georgia return is not processed.",
    "Only returns linked to a federal submission sent from InnovaTax are supported here. A Georgia-only submission is not.",
  ],
};

// ---- Schema adapter ------------------------------------------------------------------------

const GA_SANDBOX_NS = "urn:innovatax:sandbox:ga-return";
export function georgiaSandboxAdapter(taxYear = 2026) {
  const name = (id) => `GA_${String(id).replace(/[^A-Za-z0-9]/g, "_")}`;
  return {
    id: `INNOVATAX-GA-SANDBOX-${taxYear}`,
    jurisdiction: "GA",
    taxYear,
    official: false,
    namespace: `${GA_SANDBOX_NS}:${taxYear}`,
    root: "SandboxGeorgiaReturn",
    elementFor: (lineId) => (/^[A-Za-z0-9.]+$/.test(lineId) ? name(lineId) : null),
    lineFor: (element) => (element.startsWith("GA_") ? element.slice(3).replace(/_/g, ".") : null),
  };
}

// The Georgia schema package for a tax year, once Georgia releases it to InnovaTax and an
// adapter is built from it. Until then: null.
const OFFICIAL_GA_ADAPTERS = {};
export const officialGeorgiaAdapter = (taxYear) => OFFICIAL_GA_ADAPTERS[Number(taxYear)] || null;

export function georgiaSchemaStatus(taxYear = 2026) {
  const adapter = officialGeorgiaAdapter(taxYear);
  return {
    installed: Boolean(adapter),
    adapterId: adapter?.id || null,
    expected: `Georgia Form 500 MeF schema and business rules for tax year ${taxYear}`,
    note: adapter ? "" : "Not installed. Georgia releases its schema and business rules to developers who sent a Letter of Intent and registered their product.",
  };
}

// ---- Link to the federal submission ----------------------------------------------------------

// The states a federal submission must have reached before its linked Georgia return may
// be sent, and the states that end the link.
export const FEDERAL_SENT = ["TRANSMITTED", "ACK_PENDING", "ACCEPTED"];

// Can the Georgia submission be sent, given the federal record for the same approved
// figures? Returns null when it can, or { code, message, action, blocking }.
//   blocking: true   the Georgia package itself cannot go anywhere (rebuild needed)
//   blocking: false  it waits: send the federal return first
export function federalLinkIssue({ federal, federalFiledElsewhere = false }) {
  if (!federal) {
    if (federalFiledElsewhere) return { code: "EFILE_GA_FEDERAL_ELSEWHERE", message: "The federal return was filed through other software, so this Georgia return cannot be linked to it here.", action: "File the Georgia return with the same software as the federal return. Georgia-only submissions are not supported here.", blocking: true };
    return { code: "EFILE_GA_FEDERAL_NOT_SENT", message: "The federal return for these figures has not been sent yet.", action: "Prepare and transmit the federal return first. The Georgia return is linked to it.", blocking: false };
  }
  if (federal.state === "REJECTED") return { code: "EFILE_GA_FEDERAL_REJECTED", message: `The linked federal submission ${federal.submissionRef} was rejected.`, action: "Correct the federal return, approve again, and send both returns again.", blocking: true };
  if (federal.state === "INDETERMINATE") return { code: "EFILE_GA_FEDERAL_UNKNOWN", message: `Nobody knows yet whether federal submission ${federal.submissionRef} arrived.`, action: "Reconcile the federal submission first.", blocking: false };
  if (!FEDERAL_SENT.includes(federal.state)) return { code: "EFILE_GA_FEDERAL_NOT_SENT", message: `The federal submission ${federal.submissionRef} is "${federal.state}", not sent yet.`, action: "Transmit the federal return first. The Georgia return is linked to it.", blocking: false };
  return null;
}

// ---- Georgia checks --------------------------------------------------------------------------

// InnovaTax's own checks on a Georgia package, with their own identifiers. They are not
// Georgia's business rules, which come with Georgia's schema package.
const v = (d, id) => d.forms.flatMap((f) => f.lines).find((l) => l.id === id)?.value ?? 0;
const has = (d, id) => d.forms.some((f) => f.lines.some((l) => l.id === id));
export const GEORGIA_RULES = [
  ["IX-GA-001", "A Georgia package must be a Form 500 return.", (d) => /^Form 500/.test(d.header.returnType || ""), "Header/returnType", "state-summary"],
  ["IX-GA-002", "A Georgia return must be linked to a federal submission.", (d) => /^[A-Z]*-?[0-9a-f]{20}$/.test(d.header.linkedFederalRef || ""), "Header/LinkedFederal", ""],
  ["IX-GA-003", "Federal adjusted gross income on Form 500, line 8 must match Form 1040, line 11.", (d) => v(d, "500.8") === d.header.federalAgi, "500.8", "income-summary"],
  ["IX-GA-004", "Georgia adjusted gross income must equal federal adjusted gross income plus the Schedule 1 adjustments.", (d) => v(d, "500.10") === v(d, "500.8") + v(d, "500.9"), "500.10", "state-summary"],
  ["IX-GA-005", "Georgia taxable income cannot be negative.", (d) => has(d, "500.15") && v(d, "500.15") >= 0, "500.15", "state-summary"],
  ["IX-GA-006", "The balance after credits must equal the tax less the credits used, and cannot be negative.", (d) => v(d, "500.22") === v(d, "500.16") - v(d, "500.21") && v(d, "500.22") >= 0, "500.22", "state-summary"],
  ["IX-GA-007", "Total payments must equal Georgia withholding plus estimated tax paid.", (d) => v(d, "500.28") === v(d, "500.23") + v(d, "500.25"), "500.28", "forms-W2"],
  ["IX-GA-008", "A Georgia return shows a refund or an amount owed, never both.", (d) => !(v(d, "500.overpaid") > 0 && v(d, "500.due") > 0), "500.overpaid", "state-summary"],
  ["IX-GA-009", "Refund or amount owed must equal total payments less the balance after credits.", (d) => v(d, "500.overpaid") - v(d, "500.due") === v(d, "500.28") - v(d, "500.22"), "500.overpaid", "state-summary"],
];

// Which questionnaire screen fixes an error on a Georgia line.
const GA_STEP_OF_LINE = [[/^500\.(8|9|10)$/, "income-summary"], [/^S1\./, "state-summary"], [/^500\.(23|25|28)$/, "forms-W2"], [/^S3\./, "state-residence"], [/^500\./, "state-summary"]];
export const georgiaStepForLine = (lineId) => (GA_STEP_OF_LINE.find(([re]) => re.test(lineId || "")) || [null, ""])[1];
