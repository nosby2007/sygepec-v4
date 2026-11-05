import { searchClients } from "@/lib/admin-clients";
import { RATES, staffApi } from "@/lib/staff";

export const GET = staffApi({ operation: "client.search", rate: RATES.search }, async ({ req, session }) => ({
  clients: await searchClients(session, new URL(req.url).searchParams.get("q")),
}));
