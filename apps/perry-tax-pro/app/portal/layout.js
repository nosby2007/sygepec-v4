import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Client Portal", robots: { index: false } };

const links = [
  { href: "/portal", label: "Dashboard", icon: "🏠" },
  { href: "/portal/returns", label: "Tax Years", icon: "🗓️" },
  { href: "/portal/intake", label: "Tax Questionnaire", icon: "📝" },
  { href: "/portal/documents", label: "Documents", icon: "📁" },
  { href: "/portal/appointments", label: "Appointments", icon: "📅" },
  { href: "/portal/messages", label: "Messages", icon: "💬" },
];

export default async function PortalLayout({ children }) {
  const s = await requireRole("CLIENT");
  return <AppShell links={links} user={s}>{children}</AppShell>;
}
