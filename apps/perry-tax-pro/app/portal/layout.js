import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Client Portal", robots: { index: false } };

const taxLinks = [
  { href: "/portal", label: "Dashboard", icon: "home" },
  { href: "/portal/returns", label: "Tax Years", icon: "layers" },
  { href: "/portal/intake", label: "Tax Questionnaire", icon: "clipboard" },
  { href: "/portal/documents", label: "Documents", icon: "folder" },
  { href: "/portal/appointments", label: "Appointments", icon: "calendar" },
  { href: "/portal/messages", label: "Messages", icon: "chat" },
];

const businessLinks = [
  { href: "/portal/business", label: "Business Overview", icon: "chart" },
  { href: "/portal/business/growth", label: "Growth hub", icon: "trending" },
  { href: "/portal/business/bookings", label: "Bookings", icon: "calendar" },
  { href: "/portal/business/customers", label: "Customers", icon: "users" },
  { href: "/portal/business/workspace", label: "Services & Billing", icon: "receipt" },
  { href: "/portal/business/team", label: "Team", icon: "user" },
  { href: "/portal/business/profile", label: "Public page", icon: "megaphone" },
  { href: "/portal/business/accounting", label: "Accounting", icon: "book" },
];

export default async function PortalLayout({ children }) {
  const s = await requireRole("CLIENT");
  return <AppShell links={s.accountType === "BUSINESS" ? businessLinks : taxLinks} user={s}>{children}</AppShell>;
}
