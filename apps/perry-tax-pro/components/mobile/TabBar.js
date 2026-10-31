"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

const TABS = [
  { href: "/m/business/appointments", label: "Appointments", icon: "calendar" },
  { href: "/m/business/clients", label: "Clients", icon: "users" },
  { href: "/m/business/checkout", label: "Checkout", icon: "receipt" },
  { href: "/m/business/marketing", label: "Marketing", icon: "megaphone" },
  { href: "/m/business/profile", label: "Profile", icon: "store" },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <div className="m-tabbar">
      <nav aria-label="Main">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`) || (t.icon === "store" && /^\/m\/business\/(settings|help|levels|portfolio|reviews)/.test(path));
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
