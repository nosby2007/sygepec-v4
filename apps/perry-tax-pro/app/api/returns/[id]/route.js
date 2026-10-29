import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession } from "@/lib/data";
import { getDocument, mergeDocument } from "@/lib/firebase";
import { SIGNATURE_METHODS, SIGNATURE_STATUSES, STATUSES, SUBMISSION_STATUSES } from "@/lib/constants";
import { cleanText, mutationGuard, privateHeaders, sanitizeIntake } from "@/lib/security";
import { paymentGate } from "@/lib/payments";
import { notifyStatusChange } from "@/lib/notifications";

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
    // Once Form 8879 is out for signature the signed figures must not change underneath it.
    if (r.status === "READY_TO_SIGN")
      return Response.json({ error: "Your return is ready to sign. Message your preparer to request changes." }, { status: 409 });
    const intake = sanitizeIntake(body.intake);
    const status = intake.submitted && r.status === "INTAKE" ? "DOCS_PENDING" : r.status;
    try {
      await mergeDocument(`taxReturns/${r.id}`, {
        intake,
        filingStatus: cleanText(intake.filingStatus, 10) || null,
        status,
        updatedAt: new Date().toISOString(),
      }, session.idToken);
    } catch {
      return Response.json({ error: "Your answers could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
    }
    return Response.json({ ok: true, status }, { headers: privateHeaders });
  }

  // Preparer updates
  if (body.status && !STATUSES.some((s) => s.key === body.status))
    return Response.json({ error: "Invalid status" }, { status: 400 });
  if (body.signatureStatus && !SIGNATURE_STATUSES.some((s) => s.key === body.signatureStatus))
    return Response.json({ error: "Invalid signature status" }, { status: 400 });
  if (body.signatureMethod && !SIGNATURE_METHODS.some((s) => s.key === body.signatureMethod))
    return Response.json({ error: "Invalid signature method" }, { status: 400 });
  if (body.submissionStatus && !SUBMISSION_STATUSES.some((s) => s.key === body.submissionStatus))
    return Response.json({ error: "Invalid submission status" }, { status: 400 });

  const hasPreparer = Object.prototype.hasOwnProperty.call(body, "preparerId");
  const requestedPreparerId = hasPreparer ? cleanText(body.preparerId, 128) || null : r.preparer_id;
  const effectiveSignatureStatus = body.signatureStatus || r.signature_status;
  const effectiveSubmissionStatus = body.submissionStatus || r.submission_status;
  if (["REQUESTED", "SIGNED"].includes(effectiveSignatureStatus) && !r.intake.submitted)
    return Response.json({ error: "The client must submit the questionnaire before signature can be requested." }, { status: 400 });
  if (["REQUESTED", "SIGNED"].includes(effectiveSignatureStatus) && !requestedPreparerId)
    return Response.json({ error: "Assign a preparer before starting the signature workflow." }, { status: 400 });
  if (["READY", "SUBMITTED", "ACCEPTED"].includes(effectiveSubmissionStatus) && effectiveSignatureStatus !== "SIGNED")
    return Response.json({ error: "A verified Form 8879 signature is required before e-file submission." }, { status: 400 });
  // Payment gate: only steps that move forward are checked, so a return can always go back.
  const gate = (body.signatureStatus === "SIGNED" && r.signature_status !== "SIGNED" && await paymentGate("TAX_RETURN", r.id, "SIGN"))
    || (["READY", "SUBMITTED"].includes(body.submissionStatus) && body.submissionStatus !== r.submission_status && await paymentGate("TAX_RETURN", r.id, "FILE"));
  if (gate) return Response.json({ error: gate }, { status: 402, headers: privateHeaders });

  const now = new Date().toISOString();
  const changes = { updatedAt: new Date().toISOString() };
  if (body.status) changes.status = body.status;
  if (hasPreparer) {
    if (requestedPreparerId) {
      const profile = await getDocument(`taxUsers/${requestedPreparerId}`, session.idToken);
      if (!profile || profile.role !== "PREPARER" || profile.tenantId !== "perry-tax-pro")
        return Response.json({ error: "Invalid preparer" }, { status: 400 });
      changes.preparerId = requestedPreparerId;
      changes.preparerName = profile.name;
    } else {
      changes.preparerId = null;
      changes.preparerName = null;
    }
  }
  if (body.signatureMethod) changes.signatureMethod = body.signatureMethod;
  if (body.signatureStatus) {
    changes.signatureStatus = body.signatureStatus;
    if (body.signatureStatus === "REQUESTED") {
      changes.signatureRequestedAt = r.signature_requested_at || now;
      changes.signedAt = null;
      changes.status = "READY_TO_SIGN";
    } else if (body.signatureStatus === "SIGNED") {
      changes.signatureRequestedAt = r.signature_requested_at || now;
      changes.signedAt = r.signed_at || now;
      changes.status = "READY_TO_SIGN";
    } else if (body.signatureStatus === "NOT_REQUESTED") {
      changes.signatureRequestedAt = null;
      changes.signedAt = null;
    } else if (body.signatureStatus === "DECLINED") {
      changes.signedAt = null;
    }
  }
  if (body.submissionStatus) {
    changes.submissionStatus = body.submissionStatus;
    if (["NOT_READY", "READY"].includes(body.submissionStatus)) {
      changes.submittedAt = null;
      changes.acceptedAt = null;
    } else if (body.submissionStatus === "SUBMITTED") {
      changes.submittedAt = r.submitted_at || now;
      changes.acceptedAt = null;
      changes.status = "FILED";
    } else if (body.submissionStatus === "ACCEPTED") {
      changes.submittedAt = r.submitted_at || now;
      changes.acceptedAt = r.accepted_at || now;
      changes.status = "ACCEPTED";
    } else if (body.submissionStatus === "REJECTED") {
      changes.submittedAt = r.submitted_at || now;
      changes.acceptedAt = null;
      changes.status = "IN_REVIEW";
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "submissionReference"))
    changes.submissionReference = cleanText(body.submissionReference, 120) || null;
  if (Object.prototype.hasOwnProperty.call(body, "submissionNotes"))
    changes.submissionNotes = cleanText(body.submissionNotes, 1000) || null;
  try {
    await mergeDocument(`taxReturns/${r.id}`, changes, session.idToken);
  } catch {
    return Response.json({ error: "The return could not be updated. Please try again." }, { status: 503, headers: privateHeaders });
  }
  if (changes.status && changes.status !== r.status) await notifyStatusChange(r, changes.status).catch(() => {});
  return Response.json({ ok: true, status: changes.status || r.status }, { headers: privateHeaders });
}
