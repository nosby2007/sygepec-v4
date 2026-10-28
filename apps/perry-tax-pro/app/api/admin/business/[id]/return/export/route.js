import { getFirebaseSession } from "@/lib/auth";
import { exportCsv, exportPackage, loadReturn } from "@/lib/business-return-server";
import { privateHeaders, safeId } from "@/lib/security";

// GET ?format=json|csv: the working papers for import into the preparer's e-file software.
export async function GET(req, { params }) {
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Preparer access required." }, { status: 403, headers: privateHeaders });
  const id = safeId((await params).id);
  const loaded = id ? await loadReturn(session, id).catch(() => null) : null;
  if (!loaded?.computed) return Response.json({ error: "Choose the entity type and save the return first." }, { status: 404, headers: privateHeaders });
  const pkg = exportPackage(loaded);
  const name = `${loaded.ret.entity.legalName || "business"}-${loaded.ret.taxYear}-${loaded.ret.entityType}`.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 80);
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  return new Response(csv ? exportCsv(pkg) : JSON.stringify(pkg, null, 2), {
    headers: {
      ...privateHeaders,
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.${csv ? "csv" : "json"}"`,
    },
  });
}
