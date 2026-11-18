// The way from "sandbox works" to "authorized to transmit", step by step. Pure data and
// functions: the admin page, the store and the tests share them.
//
// Some steps belong to the business owner, some to the IRS or Georgia, some to
// engineering. Engineering steps are read from the code itself; the others are recorded
// by the general admin. Recording a step never turns anything on: production
// transmission still needs the server settings and the official transport and schema
// (lib/efile/transport.js), which this file cannot change.
export const OWNERS = { OWNER: "Business owner", IRS: "IRS", GEORGIA: "Georgia DOR", ENGINEERING: "Engineering" };
export const STEP_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "NOT_APPLICABLE"];
export const STEP_LABEL = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", DONE: "Done", NOT_APPLICABLE: "Not applicable" };

// gate: what the step is needed for (ATS testing, production, Georgia).
export const ONBOARDING_STEPS = [
  { id: "ESERVICES", owner: "OWNER", gate: "ATS", title: "IRS e-Services accounts for every principal and responsible official", reference: "Pub. 3112", detail: "Identity verified through ID.me." },
  { id: "EFILE_APPLICATION", owner: "OWNER", gate: "ATS", title: "IRS e-file application with the roles ERO, Software Developer and Transmitter", reference: "Pub. 3112", detail: "An EFIN alone (the ERO role) does not allow transmitting. The Software Developer and Transmitter roles are needed for direct transmission." },
  { id: "SUITABILITY", owner: "IRS", gate: "ATS", title: "Suitability check passed (fingerprints or professional credential)", reference: "Pub. 3112" },
  { id: "EFIN", owner: "IRS", gate: "PRODUCTION", title: "EFIN issued", reference: "Pub. 3112", setting: "MEF_EFIN" },
  { id: "ETIN", owner: "IRS", gate: "ATS", title: "ETIN issued for the Software Developer and Transmitter roles (test status first)", reference: "Pub. 3112; Pub. 4164", setting: "MEF_ETIN" },
  { id: "SCHEMAS", owner: "OWNER", gate: "ATS", title: "Tax-year 1040 MeF schemas and business rules downloaded from e-Services", reference: "Pub. 4164", detail: "Released to registered software developers; versions change during the year." },
  { id: "SCHEMA_ADAPTER", owner: "ENGINEERING", gate: "ATS", title: "Official schema adapter built from the XSD files and registered", reference: "lib/efile/package.js", auto: "schema" },
  { id: "A2A_SPECS", owner: "OWNER", gate: "ATS", title: "MeF A2A web service specifications and system credentials obtained", reference: "Pub. 4164; MeF A2A guide", setting: "MEF_A2A_CERT_SECRET" },
  { id: "A2A_TRANSPORT", owner: "ENGINEERING", gate: "ATS", title: "Official MeF transport built and registered", reference: "lib/efile/transport.js", auto: "transport" },
  { id: "REFERENCE_CASES", owner: "ENGINEERING", gate: "ATS", title: "InnovaTax reference cases pass through the whole chain", reference: "npm run ats", auto: "reference" },
  { id: "ATS_SCENARIOS", owner: "OWNER", gate: "ATS", title: "Official ATS scenarios for the tax year entered as scenario files", reference: "Pub. 1436", detail: "From the official publication only." },
  { id: "ATS_TESTING", owner: "IRS", gate: "PRODUCTION", title: "ATS: scenarios transmitted to the IRS test environment and accepted", reference: "Pub. 1436; Pub. 4164" },
  { id: "COMMUNICATION_TEST", owner: "IRS", gate: "PRODUCTION", title: "Communication test passed and production status granted", reference: "Pub. 4164" },
  { id: "SECURITY", owner: "OWNER", gate: "PRODUCTION", title: "Written information security plan and safeguards in place", reference: "Pub. 4557; Pub. 1345", detail: "Implementing controls is not certification. The owner signs off." },
  { id: "PRODUCTION_SWITCH", owner: "OWNER", gate: "PRODUCTION", title: "Production authorization recorded on the server", reference: "EFILE_PRODUCTION_AUTHORIZED", setting: "EFILE_PRODUCTION_AUTHORIZED" },
  { id: "GA_LETTER_OF_INTENT", owner: "OWNER", gate: "GEORGIA", title: "Letter of Intent for the tax year sent to Georgia DOR", reference: "Georgia DOR Letter of Intent", detail: "Sent every tax year, by the deadline Georgia sets that year." },
  { id: "GA_PRODUCT_REGISTRATION", owner: "OWNER", gate: "GEORGIA", title: "InnovaTax registered as a product with Georgia DOR", reference: "Georgia DOR Fed/State MeF guidelines", detail: "Registration comes before Georgia testing." },
  { id: "GA_SCHEMAS", owner: "OWNER", gate: "GEORGIA", title: "Georgia Form 500 schema and business rules for the tax year obtained from Georgia DOR", reference: "Georgia DOR Fed/State MeF guidelines" },
  { id: "GA_SCHEMA_ADAPTER", owner: "ENGINEERING", gate: "GEORGIA", title: "Georgia schema adapter built from Georgia's schema and registered", reference: "lib/efile/georgia.js", auto: "gaSchema" },
  { id: "GA_TESTING", owner: "GEORGIA", gate: "GEORGIA", title: "Georgia test returns transmitted and accepted in Georgia's own testing", reference: "Georgia DOR Fed/State MeF guidelines", detail: "Separate from the IRS ATS." },
  { id: "GA_APPROVAL", owner: "GEORGIA", gate: "GEORGIA", title: "Georgia approval of InnovaTax recorded on the server", reference: "GA_EFILE_AUTHORIZED", setting: "GA_EFILE_AUTHORIZED", detail: "Georgia takes state returns through the IRS Fed/State program, but federal approval does not authorize Georgia filing." },
  { id: "GA_TRANSPORT", owner: "ENGINEERING", gate: "GEORGIA", title: "Georgia state submissions sent through the official transport", reference: "lib/efile/transport.js", auto: "gaTransport" },
];

// facts: { schema, transport, gaSchema, gaTransport, reference } booleans read from the code, and
// settings: { MEF_EFIN: true, ... } (whether each server setting is present).
// recorded: { [stepId]: { status, note, by, byName, at } }.
export function onboardingView(recorded = {}, facts = {}, settings = {}) {
  const steps = ONBOARDING_STEPS.map((s) => {
    const rec = recorded[s.id] || null;
    let status = rec?.status && STEP_STATUSES.includes(rec.status) ? rec.status : "NOT_STARTED";
    let derived = false;
    if (s.auto) { status = facts[s.auto] ? "DONE" : "NOT_STARTED"; derived = true; }
    const settingPresent = s.setting ? Boolean(settings[s.setting]) : null;
    // A step recorded done whose server setting is missing is flagged, not trusted.
    const warning = s.setting && status === "DONE" && !settingPresent ? `Recorded as done, but ${s.setting} is not set on the server.` : "";
    return { ...s, ownerLabel: OWNERS[s.owner], status, statusLabel: STEP_LABEL[status], derived, settingPresent, warning, note: rec?.note || "", by: rec?.byName || "", at: rec?.at || "" };
  });
  const open = (gate) => steps.filter((s) => s.gate === gate && !["DONE", "NOT_APPLICABLE"].includes(s.status));
  return {
    steps,
    readyForAts: open("ATS").length === 0,
    readyForProduction: open("ATS").length === 0 && open("PRODUCTION").length === 0,
    readyForGeorgia: open("ATS").length === 0 && open("PRODUCTION").length === 0 && open("GEORGIA").length === 0,
    openCount: { ATS: open("ATS").length, PRODUCTION: open("PRODUCTION").length, GEORGIA: open("GEORGIA").length },
  };
}

// Checks a change asked from the admin page. Engineering steps cannot be recorded by hand.
export function onboardingChangeError(stepId, status, note) {
  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
  if (!step) return "Unknown step.";
  if (step.auto) return "This step is read from the code and cannot be recorded by hand.";
  if (!STEP_STATUSES.includes(status)) return "Choose a status.";
  if (status === "NOT_APPLICABLE" && !String(note || "").trim()) return "Say why this step does not apply.";
  if (status === "NOT_APPLICABLE" && ["EFILE_APPLICATION", "ATS_TESTING", "EFIN", "ETIN", "PRODUCTION_SWITCH", "GA_TESTING", "GA_APPROVAL"].includes(step.id)) return "This step is required for direct transmission.";
  return null;
}
