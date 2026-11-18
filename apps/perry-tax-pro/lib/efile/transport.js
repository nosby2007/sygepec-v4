// Transports: how a validated package leaves InnovaTax and how its acknowledgement comes
// back. Every transport has the same shape:
//
//   id, label, authoritative       authoritative: its acknowledgements come from the real
//                                  receiver. Only an authoritative ACCEPTED is an IRS (or
//                                  state) acceptance.
//   send(pkg)    -> { outcome: "RECEIPT" | "FAILED" | "UNKNOWN", receiptId?, message? }
//   fetchAck(pkg)-> acknowledgement XML, or null while none is available
//   lookup(pkg)  -> "RECEIVED" | "NOT_RECEIVED" | "UNKNOWN"   (reconciliation)
//
// A receipt only says the package arrived. It is never an acceptance.
//
// The only transport here is the sandbox. A real MeF transport needs the A2A web service
// specifications, system credentials and an ETIN issued by the IRS after the e-file
// application and ATS testing; none of that is in this repository, and no endpoint or
// protocol is written from memory. transportFor() refuses production until all of it is
// installed and the owner turns it on.
import crypto from "node:crypto";
import { EfileError } from "@/lib/efile/states";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Sandbox scenarios. A test (or a preparer trying the flow) picks one; the default is a
// receiver that accepts every valid package.
export const SANDBOX_SCENARIOS = {
  ACCEPT: "Accepted",
  REJECT: "Rejected with an error on a line",
  NETWORK_ERROR: "Connection refused before sending",
  TIMEOUT: "Timed out after sending (outcome unknown)",
  ACK_DELAYED: "Receipt now, acknowledgement on the next check",
};

// Where the sandbox receiver keeps what it got: { get, set } (may be async). The default
// is in memory, for tests; the server passes a Firestore-backed store so every instance
// sees the same receiver.
export const memoryStore = (map = new Map()) => ({ get: async (k) => map.get(k) || null, set: async (k, v) => { map.set(k, v); } });
const RECEIVED = memoryStore();

// The Georgia sandbox is a receiver of its own. Like a linked state return in the
// Fed/State program, a Georgia package names its federal submission: the Georgia sandbox
// rejects it when that federal submission never arrived or was rejected.
export function sandboxTransport({ scenario = "ACCEPT", store = RECEIVED, clock = () => new Date(), jurisdiction = "US" } = {}) {
  if (!SANDBOX_SCENARIOS[scenario]) throw new EfileError(`Unknown sandbox scenario ${scenario}.`, 400, "EFILE_BAD_SCENARIO");
  const georgia = jurisdiction === "GA";
  if (!georgia && jurisdiction !== "US") throw new EfileError(`There is no ${jurisdiction} sandbox.`, 409, "EFILE_NO_TRANSPORT");
  return {
    id: georgia ? "INNOVATAX-GA-SANDBOX" : "INNOVATAX-SANDBOX",
    label: georgia ? "InnovaTax Georgia sandbox (not Georgia DOR)" : "InnovaTax sandbox (not the IRS)",
    jurisdiction,
    authoritative: false,
    scenario,
    async send(pkg) {
      if (scenario === "NETWORK_ERROR") return { outcome: "FAILED", message: "The sandbox receiver refused the connection." };
      const previous = await store.get(pkg.submissionRef);
      // The receiver itself refuses a second copy of the same submission.
      if (previous) return { outcome: "RECEIPT", receiptId: previous.receiptId, duplicate: true };
      const receiptId = `SBXR-${crypto.randomUUID().slice(0, 18)}`;
      await store.set(pkg.submissionRef, { receiptId, hash: pkg.hash, at: clock().toISOString(), scenario, polls: 0, valid: Boolean(pkg.valid), jurisdiction, linkedFederalRef: pkg.linkedFederalRef || null, errors: (pkg.errors || []).map(({ code, message, path, kind }) => ({ code, message, path: path || "", kind: kind || "" })) });
      if (scenario === "TIMEOUT") return { outcome: "UNKNOWN", message: "No answer from the sandbox receiver before the time limit." };
      return { outcome: "RECEIPT", receiptId };
    },
    async fetchAck(pkg) {
      const entry = await store.get(pkg.submissionRef);
      if (!entry) return null;
      entry.polls = (entry.polls || 0) + 1;
      await store.set(pkg.submissionRef, entry);
      if (entry.scenario === "ACK_DELAYED" && entry.polls < 2) return null;
      // A Georgia return waits for its federal return, and falls with it.
      let linkError = null;
      if (georgia) {
        const federal = entry.linkedFederalRef ? await store.get(entry.linkedFederalRef) : null;
        if (!federal) linkError = { code: "GA-SBX-LINK-1", category: "Sandbox", message: "The linked federal submission was never received.", path: "Header/LinkedFederal" };
        else if (federal.scenario === "REJECT" || !federal.valid) linkError = { code: "GA-SBX-LINK-2", category: "Sandbox", message: "The linked federal submission was rejected, so this Georgia return was not processed.", path: "Header/LinkedFederal" };
        else if (federal.scenario === "ACK_DELAYED" && (federal.polls || 0) < 2) return null;
      }
      const rejected = entry.scenario === "REJECT" || !entry.valid || Boolean(linkError);
      const errors = linkError ? [linkError] : entry.scenario === "REJECT" && !entry.errors.length
        ? [georgia
          ? { code: "GA-SBX-0001", category: "Sandbox", message: "Sandbox rejection requested for this test: Georgia withholding does not match the W-2.", path: "Form/GA_500_23" }
          : { code: "SBX-0001", category: "Sandbox", message: "Sandbox rejection requested for this test: wages do not match the W-2.", path: "Form/Line_1040_1a" }]
        : entry.errors;
      return [
        `<Acknowledgement submissionRef="${esc(pkg.submissionRef)}" packageHash="${esc(entry.hash)}" status="${rejected ? "Rejected" : "Accepted"}" timestamp="${esc(clock().toISOString())}" sandbox="true">`,
        ...(rejected ? errors.map((e) => `  <Error code="${esc(e.code)}" category="${esc(e.category || e.kind || "")}" path="${esc(e.path || "")}">${esc(e.message)}</Error>`) : []),
        "</Acknowledgement>",
      ].join("\n");
    },
    async lookup(pkg) {
      return (await store.get(pkg.submissionRef)) ? "RECEIVED" : "NOT_RECEIVED";
    },
  };
}

// What is installed and allowed, read from the environment. Nothing here can turn on a
// production transport that does not exist.
export function efileConfig(env = process.env) {
  const mode = String(env.EFILE_MODE || "off").toLowerCase();
  return {
    mode: ["off", "sandbox", "production"].includes(mode) ? mode : "off",
    productionAuthorized: env.EFILE_PRODUCTION_AUTHORIZED === "true",
    etin: Boolean(env.MEF_ETIN),
    efin: Boolean(env.MEF_EFIN),
    credentials: Boolean(env.MEF_A2A_CERT_SECRET),
    // Georgia's own approval, recorded only after Georgia approves the product. It is
    // never implied by the federal settings above.
    georgiaAuthorized: env.GA_EFILE_AUTHORIZED === "true",
    transmitters: String(env.EFILE_TRANSMITTER_UIDS || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

// Who may transmit: a preparer who is the general admin or is listed in
// EFILE_TRANSMITTER_UIDS. Reviewing a return never includes it. isGeneralAdmin is passed
// in (it is read from Firestore by the caller).
export function transmitterAllowed(session, config, isGeneralAdmin = false) {
  if (session?.role !== "PREPARER" || !session.uid) return false;
  return config.transmitters.includes(session.uid) || isGeneralAdmin === true;
}

// No official MeF transport is implemented: production cannot be reached.
const OFFICIAL_TRANSPORTS = {};
export const transportInstalled = (jurisdiction) => Boolean(OFFICIAL_TRANSPORTS[jurisdiction]);

export function productionGaps(config, jurisdiction = "US") {
  if (jurisdiction !== "US") return stateProductionGaps(config, jurisdiction);
  const gaps = [];
  if (!config.productionAuthorized) gaps.push("The owner has not recorded production authorization (IRS acceptance letter after ATS).");
  if (!config.efin) gaps.push("No EFIN configured.");
  if (!config.etin) gaps.push("No ETIN configured (issued to transmitters after the e-file application).");
  if (!config.credentials) gaps.push("No A2A system credentials configured.");
  if (!OFFICIAL_TRANSPORTS.US) gaps.push("No IRS MeF transport is installed (needs the A2A specifications from e-Services).");
  return gaps;
}

// A state return in the Fed/State program travels through the federal channel, so every
// federal gap is also a state gap. The state's own approval comes on top: federal
// approval never stands in for it.
function stateProductionGaps(config, jurisdiction) {
  const own = [];
  if (jurisdiction !== "GA") own.push(`${jurisdiction} electronic filing is not supported. State filing needs that state's own approval.`);
  else {
    if (!config.georgiaAuthorized) own.push("Georgia has not approved InnovaTax (GA_EFILE_AUTHORIZED is not set). State filing needs Georgia's own approval: federal approval does not authorize Georgia.");
    if (!OFFICIAL_TRANSPORTS.GA) own.push("No Georgia state submission transport is installed (needs Georgia's specifications and approval).");
  }
  return [...own, ...productionGaps(config, "US").map((g) => `Federal: ${g}`)];
}

export function transportFor({ jurisdiction = "US", config = efileConfig(), scenario, store } = {}) {
  if (config.mode === "off") throw new EfileError("Electronic filing is turned off on this server.", 409, "EFILE_OFF");
  if (config.mode === "sandbox") return sandboxTransport({ scenario, jurisdiction, ...(store ? { store } : {}) });
  const gaps = productionGaps(config, jurisdiction);
  if (gaps.length) throw new EfileError(`Production transmission is not authorized: ${gaps.join(" ")}`, 403, "EFILE_NOT_AUTHORIZED");
  return OFFICIAL_TRANSPORTS[jurisdiction](config);
}
