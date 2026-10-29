import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Preparer Dashboard", robots: { index: false } };

const links = [
  { href: "/admin", label: "Clients & Returns", icon: "chart" },
  { href: "/admin/appointments", label: "Appointments", icon: "calendar" },
  { href: "/admin/signatures", label: "Signatures", icon: "pen" },
  { href: "/admin/submissions", label: "Submissions", icon: "send" },
  { href: "/admin/business", label: "Business Tax", icon: "building" },
  { href: "/admin/payments", label: "Payments & growth", icon: "dollar" },
  { href: "/admin/content", label: "Website", icon: "megaphone" },
  { href: "/admin/security", label: "Security", icon: "shield" },
];

export default async function AdminLayout({ children }) {
  const s = await requireRole("PREPARER");
  return <AppShell links={links} user={s}>{children}</AppShell>;
}
