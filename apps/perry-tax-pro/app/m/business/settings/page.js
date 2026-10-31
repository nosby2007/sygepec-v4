import Link from "next/link";
import Icon from "@/components/Icon";
import SettingsList from "@/components/mobile/SettingsList";

export const metadata = { title: "Settings" };

// Each entry opens the full screen for that setting (most are shared with the website).
const ITEMS = [
  { icon: "card", title: "Payments & checkout", text: "Connect your payment account, payouts and tax set-aside", href: "/portal/business/plan" },
  { icon: "layers", title: "Services", text: "Add services, prices, durations and photos", href: "/portal/business/workspace" },
  { icon: "clock", title: "Schedule & hours", text: "Opening hours, closed days, notice and cancellation rules", href: "/portal/business/profile" },
  { icon: "users", title: "Staff", text: "Add team members, their services and working hours", href: "/portal/business/team" },
  { icon: "store", title: "Business details", text: "Name, address, contact details, description and public link", href: "/portal/business/profile" },
  { icon: "link", title: "Online booking", text: "Publish your page and choose whether bookings confirm automatically", href: "/portal/business/profile" },
  { icon: "receipt", title: "Invoices & bookkeeping", text: "Invoices, income, expenses, receipts and your books", href: "/portal/business/accounting" },
  { icon: "wallet", title: "Plan & billing", text: "Your InnovaCare plan, statements and payment method", href: "/portal/business/plan" },
  { icon: "shield", title: "Security", text: "Two-step sign-in and your password", href: "/portal/security" },
  { icon: "help", title: "Help center", text: "How-tos, tips and contact", href: "/m/business/help" },
  { icon: "file", title: "Terms & privacy", text: "InnovaCare terms of service and privacy policy", href: "/terms" },
];

export default function Page() {
  return (
    <main className="m-main">
      <div className="m-head"><Link className="m-back" href="/m/business/profile"><Icon name="back" size={24} /> Settings</Link></div>
      <SettingsList items={ITEMS} />
    </main>
  );
}
