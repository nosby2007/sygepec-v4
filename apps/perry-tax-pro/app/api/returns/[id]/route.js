import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession } from "@/lib/data";
import { getDocument, mergeDocument } from "@/lib/firebase";
import { STATUSES } from "@/lib/constants";
import { cleanText, mutationGuard, privateHeaders, sanitizeIntake } from "@/lib/security";

export async function GET(_req, { params }) {
  const r = await getReturnForSession((await params).id, await getFirebaseSession());
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(r, { headers: privateHeaders });
}

export async function PUT(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  const r = await getReturnForSession((await params).id, session);
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  if (session.role === "CLIENT") {
    if (["FILED", "ACCEPTED"].includes(r.status))
      return Response.json({ error: "This return has already been filed." }, { status: 400 });
    const intake = sanitizeIntake(body.intake);
    const status = intake.submitted && r.status === "INTAKE" ? "DOCS_PENDING" : r.status;
    await mergeDocument(`taxReturns/${r.id}`, {
      intake,
      filingStatus: cleanText(intake.filingStatus, 10) || null,
      status,
      updatedAt: new Date().toISOString(),
    }, session.idToken);
    return Response.json({ ok: true, status }, { headers: privateHeaders });
  }

  // Preparer updates
  if (body.status && !STATUSES.some((s) => s.key === body.status))
    return Response.json({ error: "Invalid status" }, { status: 400 });
  const changes = { updatedAt: new Date().toISOString() };
  if (body.status) changes.status = body.status;
  if (body.preparerId) {
    const preparerId = cleanText(body.preparerId, 128);
    const profile = await getDocument(`taxUsers/${preparerId}`, session.idToken);
    if (!profile || profile.role !== "PREPARER") return Response.json({ error: "Invalid preparer" }, { status: 400 });
    changes.preparerId = preparerId;
    changes.preparerName = profile.name;
  }
  await mergeDocument(`taxReturns/${r.id}`, changes, session.idToken);
  return Response.json({ ok: true }, { headers: privateHeaders });
}
