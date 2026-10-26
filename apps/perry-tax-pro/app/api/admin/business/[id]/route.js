import { getFirebaseSession } from "@/lib/auth";
import { BUSINESS_TAX_PRIORITIES, BUSINESS_TAX_STATUSES, stripBusinessTaxMeta } from "@/lib/business-admin";
import { commitWrites, getDocument, isConflict, replaceWrite, TAX_TENANT } from "@/lib/firebase";
import { cleanText, mutationGuard, privateHeaders, safeId } from "@/lib/security";

export async function PATCH(request, { params }) {
  const blocked = mutationGuard(request);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session || session.role !== "PREPARER") return Response.json({ error: "Preparer access required." }, { status: 403, headers: privateHeaders });
  const id = safeId((await params).id);
  if (!id) return Response.json({ error: "Invalid business tax case." }, { status: 400, headers: privateHeaders });
  const current = await getDocument(`taxBusinessYearEnd/${id}`, session.idToken);
  if (!current || current.tenantId !== TAX_TENANT) return Response.json({ error: "Business tax case not found." }, { status: 404, headers: privateHeaders });
  const body = await request.json().catch(() => ({}));
  const allowedStatuses = new Set(BUSINESS_TAX_STATUSES.map((item) => item.key));
  const status = body.status || current.status;
  const priority = Object.prototype.hasOwnProperty.call(body, "priority") ? body.priority : current.priority || "NORMAL";
  const dueDate = Object.prototype.hasOwnProperty.call(body, "dueDate") ? cleanText(body.dueDate, 10) : current.dueDate || "";
  const internalNote = Object.prototype.hasOwnProperty.call(body, "internalNote") ? cleanText(body.internalNote, 1200) : current.internalNote || "";
  if (!allowedStatuses.has(status)) return Response.json({ error: "Invalid review status." }, { status: 400, headers: privateHeaders });
  if (!BUSINESS_TAX_PRIORITIES.includes(priority)) return Response.json({ error: "Invalid priority." }, { status: 400, headers: privateHeaders });
  if (dueDate && !/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(dueDate)) return Response.json({ error: "Invalid target date." }, { status: 400, headers: privateHeaders });

  const changesAssignment = Object.prototype.hasOwnProperty.call(body, "assignedPreparerId");
  const requestedPreparerId = changesAssignment ? cleanText(body.assignedPreparerId, 128) : current.assignedPreparerId || "";
  let assignedPreparerId = changesAssignment ? null : current.assignedPreparerId || null;
  let assignedPreparerName = changesAssignment ? null : current.assignedPreparerName || null;
  if (changesAssignment && requestedPreparerId) {
    const preparer = await getDocument(`taxUsers/${requestedPreparerId}`, session.idToken);
    if (!preparer || preparer.tenantId !== TAX_TENANT || preparer.role !== "PREPARER") return Response.json({ error: "Invalid preparer assignment." }, { status: 400, headers: privateHeaders });
    assignedPreparerId = requestedPreparerId;
    assignedPreparerName = preparer.name;
  }

  const now = new Date().toISOString();
  const next = {
    ...stripBusinessTaxMeta(current),
    status,
    priority,
    dueDate: dueDate || null,
    assignedPreparerId,
    assignedPreparerName,
    internalNote,
    reviewedAt: current.reviewedAt || (status !== "SUBMITTED_FOR_REVIEW" ? now : null),
    completedAt: status === "COMPLETED" ? current.completedAt || now : null,
    updatedAt: now,
    updatedBy: session.uid,
    updatedByName: session.name,
  };
  try {
    await commitWrites([replaceWrite(`taxBusinessYearEnd/${id}`, next, current.updateTime)], session.idToken);
    return Response.json({ ok: true, status }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: isConflict(error) ? "This case changed. Reload and try again." : "The business tax case could not be updated." }, { status: isConflict(error) ? 409 : 503, headers: privateHeaders });
  }
}
