import Link from "next/link";
import { getFirebaseSession, requireBusinessClient } from "@/lib/auth";
import { emailHash, loadGrowth, reminderText } from "@/lib/business-growth";
import { agenda, audience, growthChecklist, monthlySeries } from "@/lib/growth-shared";
import { formatInZone } from "@/lib/timezone";
import Icon from "@/components/Icon";
import { BarChart, PALETTE } from "@/components/charts";
import { Kpi, PageHead } from "@/components/ui";
import GrowthHub from "./GrowthHub";

export const metadata = { title: "Growth hub" };
const DAY = 86_400_000;
const usd = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((cents || 0) / 100);

export default async function Page({ searchParams }) {
  await requireBusinessClient();
  const session = await getFirebaseSession();
  const d = await loadGrowth(session);
  const tab = ["today", "marketing", "feedback"].includes((await searchParams)?.tab) ? (await searchParams).tab : "today";
  const now = d.nowMs;
  const zone = d.settings.timeZone;
  const thisMonth = d.timeZoneDate(now).slice(0, 7);
  const lastMonth = d.timeZoneDate(new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 1, 15)).getTime()).slice(0, 7);
  const income = (month) => d.entries.filter((e) => e.kind === "income" && String(e.date).startsWith(month)).reduce((a, e) => a + e.amountCents, 0);
  const live = d.bookings.filter((b) => b.status !== "CANCELLED");
  const closed = d.bookings.filter((b) => ["COMPLETED", "NO_SHOW"].includes(b.status) && b.start_ms > now - 90 * DAY);
  const visited = d.customers.filter((c) => c.visits >= 1);
  const ratings = d.feedback.map((f) => f.rating);
  const checklist = growthChecklist({ profile: d.profile, services: d.services, staff: d.staff, customers: d.customers, campaigns: d.campaigns, feedbackRequests: d.feedbackRequests.length });
  const todo = agenda({ bookings: d.bookings, customers: d.customers, feedback: d.feedback, nowMs: now, timeZoneDate: d.timeZoneDate });
  const bookingsByMonth = monthlySeries(live, () => 1, (b) => b.start_ms, 6, now);
  const incomeByMonth = monthlySeries(d.entries.filter((e) => e.kind === "income"), (e) => e.amountCents, (e) => e.date, 6, now);
  const when = (ms) => formatInZone(ms, zone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const slim = (b) => ({ id: b.id, name: b.name, email: b.email, phone: b.phone, service: b.service, staff: b.staff_name, when: when(b.start_ms), status: b.status });

  const props = {
    tab,
    mailer: d.mailer,
    businessName: d.profile?.name || "",
    bookingLink: d.profile?.status === "PUBLISHED" && d.profile.publicBooking ? `/business/${d.profile.slug}/book` : null,
    todo: {
      toConfirm: todo.toConfirm.map(slim),
      today: todo.today.map(slim),
      remind: todo.remind.map((b) => ({ ...slim(b), text: reminderText(b, d.profile, d.settings) })),
      toClose: todo.toClose.map(slim),
      followUps: todo.followUps.map((c) => ({ id: c.id, name: c.name, followUpAt: c.followUpAt, phone: c.phone, email: c.email })),
      lapsed: todo.lapsed.map((c) => ({ id: c.id, name: c.name, lastVisit: c.lastVisitMs ? formatInZone(c.lastVisitMs, zone, { month: "short", day: "numeric", year: "numeric" }) : "" })),
    },
    customers: d.customers.map((c) => ({ id: c.id, stage: c.stage, tags: c.tags || [], reachable: audience([c], {}, d.optedOut, emailHash).length === 1 })),
    campaigns: d.campaigns.map(({ id, name, subject, body, stages, tags, status, sentAt, sentCount, sentVia }) => ({ id, name, subject, body, stages, tags, status, sentAt, sentCount, sentVia })),
    completedWithoutRequest: d.bookings.filter((b) => b.status === "COMPLETED" && !d.feedbackRequests.some((r) => r.bookingId === b.id)).slice(-20).reverse().map(slim),
    feedback: d.feedback.map(({ id, rating, comment, displayName, serviceName, publishConsent, featured, seenAt, createdAt }) => ({ id, rating, comment, displayName, serviceName, publishConsent, featured, seenAt, createdAt })),
  };

  return (
    <>
      <PageHead kicker="Business" icon="trending" title="Growth hub" desc="What needs you today, how the business is doing, and the tools to bring customers back.">
        {props.bookingLink && <Link href={props.bookingLink} className="btn btn-ghost" target="_blank"><Icon name="link" size={16} /> Your booking page</Link>}
        <Link href="/portal/business/customers" className="btn btn-primary"><Icon name="users" size={16} /> Customers</Link>
      </PageHead>

      <div className="grid-main" style={{ alignItems: "stretch" }}>
        <div className="card growth-score">
          <div className="growth-ring" style={{ "--p": checklist.score }} aria-label={`Setup ${checklist.score}%`}><b>{checklist.score}%</b></div>
          <div className="stack-sm">
            <div><h3 style={{ margin: 0 }}>Growth setup</h3><span className="small muted">Each step makes it easier for customers to find, book and come back.</span></div>
            <ul className="growth-checklist">
              {checklist.items.map((i) => <li key={i.key}><Link href={i.href} className={i.done ? "done" : ""}><Icon name={i.done ? "check" : "arrow"} size={14} />{i.label}</Link></li>)}
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-title"><div><h3>Last 6 months</h3><div className="sub">Income recorded in your books, and bookings</div></div></div>
          <BarChart height={140} data={incomeByMonth.map((m) => ({ label: m.label, values: [m.value / 100] }))} series={[{ name: "Income", color: PALETTE.teal }]} format={(v) => usd(v * 100)} label="Income by month" />
          <BarChart height={110} data={bookingsByMonth.map((m) => ({ label: m.label, values: [m.value] }))} series={[{ name: "Bookings", color: PALETTE.blue }]} format={(v) => String(Math.round(v))} label="Bookings by month" />
        </div>
      </div>

      <div className="grid-4 stagger mt">
        <Kpi label="Income this month" icon="dollar" tone="teal" value={usd(income(thisMonth))} foot={`Last month ${usd(income(lastMonth))}`} />
        <Kpi label="Bookings next 7 days" icon="calendar" value={String(live.filter((b) => b.start_ms > now && b.start_ms < now + 7 * DAY).length)} foot={`${todo.toConfirm.length} waiting for you`} />
        <Kpi label="Repeat customers" icon="users" tone="violet" value={visited.length ? `${Math.round((visited.filter((c) => c.visits >= 2).length / visited.length) * 100)}%` : "—"} foot={`${d.customers.length} in your list`} />
        <Kpi label="Average rating" icon="star" tone="gold" value={ratings.length ? (ratings.reduce((a, r) => a + r, 0) / ratings.length).toFixed(1) : "—"} foot={closed.length ? `No-shows ${Math.round((closed.filter((b) => b.status === "NO_SHOW").length / closed.length) * 100)}% (90 days)` : "No closed bookings yet"} />
      </div>

      <GrowthHub {...props} />
    </>
  );
}
