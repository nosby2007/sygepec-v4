import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Preparer Dashboard", robots: { index: false } };

const links = [
  { href: "/admin", label: "Clients & Returns", icon: "📊" },
  { href: "/admin/appointments", label: "Appointments", icon: "📅" },
  { href: "/admin/signatures", label: "Signatures", icon: "✍️" },
  { href: "/admin/submissions", label: "Submissions", icon: "📤" },
];

export default async function AdminLayout({ children }) {
  const s = await requireRole("PREPARER");
  return <AppShell links={links} user={s}>{children}</AppShell>;
}
