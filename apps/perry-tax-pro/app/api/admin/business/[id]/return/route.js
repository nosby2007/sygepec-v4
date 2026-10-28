import { getFirebaseSession } from "@/lib/auth";
import { ReturnError, updateReturn } from "@/lib/business-return-server";
import { mutationGuard, privateHeaders } from "@/lib/security";

// body: { action: "save" | "move" | "sign" | "transmit" | "acknowledge", ...input }
export async function PUT(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Preparer access required." }, { status: 403, headers: privateHeaders });
  const { action, ...input } = await req.json().catch(() => ({}));
  try {
    const ret = await updateReturn(session, (await params).id, String(action || ""), input);
    return Response.json({ ok: true, status: ret.status, version: ret.version }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof ReturnError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "The return could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
