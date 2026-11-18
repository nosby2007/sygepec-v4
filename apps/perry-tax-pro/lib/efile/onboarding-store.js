import "server-only";
import { audit } from "@/lib/audit";
import { REFERENCE_SCENARIOS, runAll } from "@/lib/efile/ats";
import { onboardingChangeError, onboardingView } from "@/lib/efile/onboarding";
import { officialAdapter } from "@/lib/efile/package";
import { efileConfig, transportInstalled } from "@/lib/efile/transport";
import { getDocument, setDocument, TAX_TENANT } from "@/lib/firebase";
import { cleanText } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";

//   taxEfileOnboarding/{tenant}   steps recorded by the general admin (server-only)
const PATH = `taxEfileOnboarding/${TAX_TENANT}`;

export class OnboardingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// What the code and the server settings say, never what someone typed.
export function onboardingFacts(taxYear = 2026, env = process.env) {
  const reference = runAll(REFERENCE_SCENARIOS);
  return {
    facts: { schema: Boolean(officialAdapter(taxYear)), transport: transportInstalled("US"), gaTransport: transportInstalled("GA"), reference: reference.failed === 0 },
    settings: { MEF_EFIN: Boolean(env.MEF_EFIN), MEF_ETIN: Boolean(env.MEF_ETIN), MEF_A2A_CERT_SECRET: Boolean(env.MEF_A2A_CERT_SECRET), EFILE_PRODUCTION_AUTHORIZED: env.EFILE_PRODUCTION_AUTHORIZED === "true" },
    reference,
    mode: efileConfig(env).mode,
  };
}

export async function getOnboarding(taxYear = 2026) {
  const stored = await getDocument(PATH, await serviceToken()).catch(() => null);
  const { facts, settings, reference, mode } = onboardingFacts(taxYear);
  return { ...onboardingView(stored?.steps || {}, facts, settings), reference, mode, history: (stored?.history || []).slice(-20).reverse() };
}

// The caller has checked the general admin role.
export async function recordStep(session, { stepId, status, note }) {
  const clean = cleanText(note, 500);
  const error = onboardingChangeError(String(stepId || ""), String(status || ""), clean);
  if (error) throw new OnboardingError(error);
  const token = await serviceToken();
  const stored = (await getDocument(PATH, token).catch(() => null)) || {};
  const at = new Date().toISOString();
  const steps = { ...(stored.steps || {}), [stepId]: { status, note: clean, by: session.uid, byName: session.name || session.email || "Admin", at } };
  const history = [...(stored.history || []), { at, by: session.uid, byName: session.name || "Admin", stepId, status, note: clean }].slice(-200);
  await setDocument(PATH, { tenantId: TAX_TENANT, steps, history, updatedAt: at }, token);
  await audit(session, "EFILE_ONBOARDING", { target: PATH, details: { step: stepId, status } });
  return getOnboarding();
}
