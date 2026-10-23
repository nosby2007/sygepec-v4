import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Client Portal", robots: { index: false } };

const taxLinks = [
  { href: "/portal", label: "Dashboard", icon: "🏠" },
  { href: "/portal/returns", label: "Tax Years", icon: "🗓️" },
  { href: "/portal/intake", label: "Tax Questionnaire", icon: "📝" },
  { href: "/portal/documents", label: "Documents", icon: "📁" },
  { href: "/portal/appointments", label: "Appointments", icon: "📅" },
  { href: "/portal/messages", label: "Messages", icon: "💬" },
];

const businessLinks = [
  { href: "/portal/business", label: "Business Overview", icon: "📊" },
  { href: "/portal/business/customers", label: "Customers", icon: "👥" },
  { href: "/portal/business/workspace", label: "Services & Billing", icon: "🧾" },
  { href: "/portal/business/accounting", label: "Accounting", icon: "📚" },
];

export default async function PortalLayout({ children }) {
  const s = await requireRole("CLIENT");
  return <AppShell links={s.accountType === "BUSINESS" ? businessLinks : taxLinks} user={s}>{children}</AppShell>;
}
