import { getFirebaseSession } from "@/lib/auth";
import { SETTINGS_PATH } from "@/lib/appointments";
import { parseBookingSettings } from "@/lib/booking";
import { setDocument, TAX_TENANT } from "@/lib/firebase";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function PUT(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  const { settings, errors } = parseBookingSettings(await req.json().catch(() => ({})));
  if (errors.length) return Response.json({ error: errors.join(" ") }, { status: 400, headers: privateHeaders });
  try {
    await setDocument(SETTINGS_PATH, {
      ...settings,
      // Firestore map keys must be strings.
      weekly: Object.fromEntries(Object.entries(settings.weekly).map(([day, windows]) => [String(day), windows])),
      tenantId: TAX_TENANT,
      updatedAt: new Date().toISOString(),
      updatedBy: session.uid,
      updatedByName: session.name,
    }, session.idToken);
    return Response.json({ ok: true, settings }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Settings could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
