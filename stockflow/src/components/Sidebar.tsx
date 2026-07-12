"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  FileText,
  FileUp,
  Receipt,
  Factory,
  Gauge,
  KeyRound,
  MapPin,
  Package,
  PlugZap,
  ScrollText,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Webhook,
  BookOpen,
  BarChart3,
} from "lucide-react";

const SECTIONS: { label: string; links: { href: string; label: string; icon: React.ElementType }[] }[] = [
  {
    label: "Operations",
    links: [
      { href: "/", label: "Dashboard", icon: Gauge },
      { href: "/items", label: "Items", icon: Package },
      { href: "/stock", label: "Stock", icon: Warehouse },
      { href: "/estimates", label: "Estimates", icon: FileText },
      { href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/purchase-orders", label: "Purchasing", icon: Truck },
      { href: "/manufacturing", label: "Manufacturing", icon: Factory },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Directory",
    links: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/vendors", label: "Vendors", icon: ClipboardList },
      { href: "/locations", label: "Locations", icon: MapPin },
      { href: "/import", label: "Import Data", icon: FileUp },
    ],
  },
  {
    label: "Developer",
    links: [
      { href: "/settings/api-keys", label: "API Keys", icon: KeyRound },
      { href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/settings/integrations", label: "Integrations", icon: PlugZap },
      { href: "/activity", label: "Event Log", icon: ScrollText },
      { href: "/docs", label: "API Docs", icon: BookOpen },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Boxes size={18} />
        </div>
        <span className="text-lg font-bold tracking-tight">StockFlow</span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.links.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon size={16} className={active ? "text-indigo-600" : "text-slate-400"} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
        API-first inventory · v0.1
      </div>
    </aside>
  );
}
