"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

const BUSINESS_TABS = [
  { href: "/m/business/appointments", label: "Appointments", icon: "calendar" },
  { href: "/m/business/clients", label: "Clients", icon: "users" },
  { href: "/m/business/checkout", label: "Checkout", icon: "receipt" },
  { href: "/m/business/marketing", label: "Marketing", icon: "megaphone" },
  { href: "/m/business/profile", label: "Profile", icon: "store" },
];

// The client app (/m/client): business pages and booking stay under Explore.
const CLIENT_TABS = [
  { href: "/m/client", label: "Explore", icon: "search", also: /^\/m\/client\/(business|book)\// },
  { href: "/m/client/bookings", label: "Bookings", icon: "calendar" },
  { href: "/m/client/taxes", label: "Taxes", icon: "receipt" },
  { href: "/m/client/profile", label: "Profile", icon: "user" },
];

export default function TabBar({ app = "business" }) {
  const path = usePathname();
  const tabs = app === "client" ? CLIENT_TABS : BUSINESS_TABS;
  return (
    <div className={`m-tabbar${tabs.length === 4 ? " four" : ""}`}>
      <nav aria-label="Main">
        {tabs.map((t) => {
          const active = path === t.href || (t.also ? t.also.test(path) : path.startsWith(`${t.href}/`)) || (t.icon === "store" && /^\/m\/business\/(settings|help|levels|portfolio|reviews)/.test(path));
          return (
            <Link key={t.href} href={t.href} className="m-tab" aria-current={active ? "page" : undefined} prefetch={false}>
              <Icon name={t.icon} size={26} stroke={1.6} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
