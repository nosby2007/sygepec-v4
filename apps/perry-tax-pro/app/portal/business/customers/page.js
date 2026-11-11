import { getFirebaseSession, requireBusinessClient } from "@/lib/auth";
import { loadGrowth } from "@/lib/business-growth";
import { normEmail } from "@/lib/growth-shared";
import { formatInZone } from "@/lib/timezone";
import { PageHead } from "@/components/ui";
import CustomerCrm from "./CustomerCrm";

export const metadata = { title: "Customers" };

export default async function Page({ searchParams }) {
  await requireBusinessClient();
  const d = await loadGrowth(await getFirebaseSession());
  const zone = d.settings.timeZone;
  const when = (ms) => (ms ? formatInZone(ms, zone, { month: "short", day: "numeric", year: "numeric" }) : null);
  const customers = d.customers.map((c) => ({
    id: c.id, name: c.name, email: c.email || "", phone: c.phone || "", notes: c.notes || "", stage: c.stage, suggestedStage: c.suggestedStage,
    tags: c.tags || [], followUpAt: c.followUpAt || "", marketingConsent: c.marketingConsent === true, consentAt: c.consentAt || null,
    source: c.source || "manual", visits: c.visits, valueCents: c.valueCents, lastVisit: when(c.lastVisitMs), nextVisit: when(c.nextVisitMs),
    history: d.bookings.filter((b) => c.email && normEmail(b.email) === normEmail(c.email)).sort((a, b) => b.start_ms - a.start_ms).slice(0, 12)
      .map((b) => ({ id: b.id, when: formatInZone(b.start_ms, zone, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }), service: b.service, status: b.status, priceCents: b.price_cents })),
  }));
  return (
    <>
      <PageHead kicker="Business" icon="users" title="Customers" desc="Your customer pipeline: who they are, how often they come, what to do next." />
      <CustomerCrm customers={customers} focus={(await searchParams)?.c || null} />
    </>
  );
}
