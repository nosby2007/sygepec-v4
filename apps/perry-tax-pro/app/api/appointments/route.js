import crypto from "node:crypto";
import { getFirebaseSession } from "@/lib/auth";
import { SERVICES } from "@/lib/constants";
import { mergeDocument, setDocument, TAX_TENANT } from "@/lib/firebase";
import { cleanText, mutationGuard, privateHeaders, safeId } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (session?.role !== "CLIENT") return Response.json({ error: "Please log in as a client before booking." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const when = new Date(b.scheduledAt);
  if (isNaN(when)) return Response.json({ error: "A valid date/time is required." }, { status: 400 });
  if (when < new Date()) return Response.json({ error: "Please choose a future time." }, { status: 400 });
  const type = b.type === "IN_PERSON" ? "IN_PERSON" : "VIRTUAL";
  const service = SERVICES.includes(b.service) ? b.service : SERVICES[0];
  const id = crypto.randomUUID();
  try {
    await setDocument(`taxAppointments/${id}`, {
      tenantId: TAX_TENANT,
      clientId: session.uid,
      name: session.name,
      email: session.email,
      phone: cleanText(b.phone, 30) || null,
      scheduledAt: when.toISOString(),
      type,
      service,
      notes: cleanText(b.notes, 1000),
      status: "REQUESTED",
      createdAt: new Date().toISOString(),
    }, session.idToken, { createOnly: true });
  } catch {
    return Response.json({ error: "The appointment could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
  return Response.json({ ok: true, id }, { headers: privateHeaders });
}

export async function PATCH(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id, status } = await req.json().catch(() => ({}));
  if (!["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"].includes(status))
    return Response.json({ error: "Invalid status" }, { status: 400 });
  const appointmentId = safeId(id);
  if (!appointmentId) return Response.json({ error: "Not found" }, { status: 404 });
  const updated = await mergeDocument(`taxAppointments/${appointmentId}`, { status, updatedAt: new Date().toISOString() }, session.idToken).catch(() => null);
  if (!updated || updated.tenantId !== TAX_TENANT) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true }, { headers: privateHeaders });
}
