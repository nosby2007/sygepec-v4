import AppShell from "@/components/AppShell";
import { getSupportSession, requireRole } from "@/lib/auth";
import { isGeneralAdmin } from "@/lib/staff";
import { PERMISSIONS as P, can } from "@/lib/support-rules";

export const metadata = { title: "Preparer Dashboard", robots: { index: false } };

const staffLinks = (isAdmin) => [
  { href: "/admin/my-work", label: "My work", icon: "clipboard" },
  { href: "/admin", label: "Clients & Returns", icon: "chart", exact: true },
  { href: "/admin/clients", label: "Client files", icon: "users" },
  { href: "/admin/appointments", label: "Appointments", icon: "calendar" },
  { href: "/admin/signatures", label: "Signatures", icon: "pen" },
  { href: "/admin/submissions", label: "Submissions", icon: "send" },
  { href: "/admin/business", label: "Business Tax", icon: "building" },
  { href: "/admin/payments", label: "Payments & growth", icon: "dollar" },
  ...(isAdmin ? [
    { href: "/admin/refunds", label: "Refunds", icon: "refresh" },
    { href: "/admin/team", label: "Team and reports", icon: "users" },
    { href: "/admin/content", label: "Website", icon: "megaphone" },
    { href: "/admin/security", label: "Security", icon: "shield" },
  ] : []),
];

const supportLinks = (s) => [
  { href: "/admin/support", label: "Overview", icon: "help", section: "Support Operations", exact: true },
  { href: "/admin/support/customers", label: "Customers", icon: "users" },
  { href: "/admin/support/tickets", label: "Tickets", icon: "clipboard" },
  { href: "/admin/support/queues", label: "Queues", icon: "layers" },
  { href: "/admin/support/sla", label: "SLA Monitor", icon: "clock" },
  ...(can(s, P.AUDIT_VIEW) ? [{ href: "/admin/support/audit", label: "Audit", icon: "shield" }] : []),
  { href: "/admin/support/settings", label: "Support Settings", icon: "gear" },
];

export default async function AdminLayout({ children }) {
  const support = await getSupportSession();
  // A support account has no ordinary session, so it never sees the preparer's links.
  if (support?.role === "SUPPORT") {
    const { id, uid, email, name, role, accountType } = support;
    return <AppShell links={supportLinks(support)} user={{ id, uid, email, name, role, accountType }}>{children}</AppShell>;
  }
  const s = await requireRole("PREPARER");
  const links = staffLinks(support?.supportRole === "PLATFORM_ADMIN" || await isGeneralAdmin(s));
  return <AppShell links={support ? [...links, ...supportLinks(support)] : links} user={s}>{children}</AppShell>;
}
