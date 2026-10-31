import { getFirebaseSession } from "@/lib/auth";
import { loadGrowth } from "@/lib/business-growth";
import ClientList from "@/components/mobile/ClientList";

export const metadata = { title: "Clients" };

export default async function Page() {
  const g = await loadGrowth(await getFirebaseSession());
  return (
    <ClientList
      customers={g.customers.map((c) => ({
        id: c.id, name: c.name, email: c.email || "", phone: c.phone || "", notes: c.notes || "", stage: c.stage, tags: c.tags || [],
        marketingConsent: c.marketingConsent === true, visits: c.visits, lastVisitMs: c.lastVisitMs, nextVisitMs: c.nextVisitMs, valueCents: c.valueCents,
        followUpAt: c.followUpAt || null, source: c.source || "manual",
      }))}
    />
  );
}
