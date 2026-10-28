import { getFirebaseSession } from "@/lib/business-auth";
import { BusinessError } from "@/lib/business-booking";
import { campaignRecipients } from "@/lib/business-growth";
import { privateHeaders } from "@/lib/security";

// CSV of the consented, not-opted-out audience, for owners sending from their own email tool.
export async function GET(_req, { params }) {
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  try {
    const { recipients } = await campaignRecipients(session, (await params).id);
    const cell = (v) => `"${String(v ?? "").replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
    const csv = [["Name", "Email", "Stage", "Tags"], ...recipients.map((c) => [c.name, c.email, c.stage, (c.tags || []).join(" ")])].map((r) => r.map(cell).join(",")).join("\r\n");
    return new Response(csv, { headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="campaign-recipients.csv"' } });
  } catch (error) {
    return Response.json({ error: error instanceof BusinessError ? error.message : "Could not build the list." }, { status: error.status || 503, headers: privateHeaders });
  }
}
