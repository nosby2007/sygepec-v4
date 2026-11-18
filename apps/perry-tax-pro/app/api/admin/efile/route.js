import { getFirebaseSession } from "@/lib/auth";
import { getOnboarding, OnboardingError, recordStep } from "@/lib/efile/onboarding-store";
import { mutationGuard, privateHeaders } from "@/lib/security";
import { editRefused, isGeneralAdmin } from "@/lib/staff";

// E-file onboarding: every preparer reads it; only the general admin records a step.
// Recording a step changes no permission and turns nothing on.
export async function PUT(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  if (!await isGeneralAdmin(session)) return editRefused(session, "taxEfileOnboarding", "Only the general admin records onboarding steps.");
  const body = await req.json().catch(() => ({}));
  try {
    const view = await recordStep(session, body);
    const { reference: _r, ...rest } = view;
    return Response.json(rest, { headers: privateHeaders });
  } catch (e) {
    if (e instanceof OnboardingError) return Response.json({ error: e.message }, { status: e.status, headers: privateHeaders });
    return Response.json({ error: "The step could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}

export async function GET() {
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  const { reference: _r, ...rest } = await getOnboarding();
  return Response.json(rest, { headers: privateHeaders });
}
