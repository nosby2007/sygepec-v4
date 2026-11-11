import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession } from "@/lib/data";
import { ReadingError, readReturnDocument } from "@/lib/document-reading";
import { mutationGuard, privateHeaders } from "@/lib/security";
import { editRefused, mayEditReturn } from "@/lib/staff";

// Reads an uploaded W-2, 1099... to pre-fill its boxes. The client checks every value.
export async function POST(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401, headers: privateHeaders });
  const r = await getReturnForSession((await params).id, session);
  if (!r) return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  if (session.role === "PREPARER" && !await mayEditReturn(session, r)) return editRefused(session, `taxReturns/${r.id}`);
  if (session.role === "CLIENT" && ["FILED", "ACCEPTED", "READY_TO_SIGN"].includes(r.status))
    return Response.json({ error: "Your answers are frozen." }, { status: 409, headers: privateHeaders });
  const body = await req.json().catch(() => ({}));
  try {
    return Response.json(await readReturnDocument(session, r, body), { headers: privateHeaders });
  } catch (e) {
    if (e instanceof ReadingError) return Response.json({ error: e.message }, { status: e.status, headers: privateHeaders });
    return Response.json({ error: "The document could not be read. Please type the amounts." }, { status: 503, headers: privateHeaders });
  }
}
