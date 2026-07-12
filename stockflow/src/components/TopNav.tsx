"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  Download,
  KeyRound,
  LogOut,
  PlugZap,
  ScrollText,
  UsersRound,
  Webhook,
} from "lucide-react";
import { useMe, clearMe } from "./useMe";

const DEV_LINKS = [
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound, area: "api_keys" },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook, area: "webhooks" },
  { href: "/settings/integrations", label: "Integrations", icon: PlugZap, area: "integrations" },
  { href: "/activity", label: "Event Log", icon: ScrollText, area: "events" },
  { href: "/docs", label: "API Docs", icon: BookOpen, area: "" },
];

const EXPORTS = [
  { entity: "", label: "Everything (JSON)" },
  { entity: "items", label: "Items (CSV)" },
  { entity: "stock", label: "Stock levels (CSV)" },
  { entity: "stock_moves", label: "Stock movements (CSV)" },
  { entity: "customers", label: "Customers (CSV)" },
  { entity: "vendors", label: "Vendors (CSV)" },
  { entity: "estimates", label: "Estimates (CSV)" },
  { entity: "sales_orders", label: "Sales orders (CSV)" },
  { entity: "invoices", label: "Invoices (CSV)" },
  { entity: "purchase_orders", label: "Purchase orders (CSV)" },
];

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  user: "User",
  api_key: "API key",
};

export function TopNav() {
  const me = useMe();
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<"" | "dev" | "export">("");
  if (pathname === "/login") return null;

  const areas = me?.areas ?? [];
  const devLinks = DEV_LINKS.filter((l) => !l.area || areas.includes(l.area));
  const showDev = devLinks.some((l) => l.area); // more than just docs
  const isSuperAdmin = me?.user?.role === "super_admin";

  const logout = async () => {
    await fetch("/api/login", { method: "DELETE" });
    clearMe();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-2" onMouseLeave={() => setOpenMenu("")}>
        {showDev && (
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "dev" ? "" : "dev")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                openMenu === "dev" ? "bg-slate-100 text-slate-800" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Developer <ChevronDown size={14} />
            </button>
            {openMenu === "dev" && (
              <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {devLinks.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpenMenu("")}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    <Icon size={15} className="text-slate-400" /> {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {isSuperAdmin && (
          <>
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === "export" ? "" : "export")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  openMenu === "export" ? "bg-slate-100 text-slate-800" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Download size={14} /> Export <ChevronDown size={14} />
              </button>
              {openMenu === "export" && (
                <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {EXPORTS.map((e) => (
                    <a
                      key={e.entity}
                      href={`/api/v1/export${e.entity ? `?entity=${e.entity}` : ""}`}
                      onClick={() => setOpenMenu("")}
                      className="block rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      {e.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/settings/users"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <UsersRound size={14} /> Users & Roles
            </Link>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {me?.user && (
          <div className="text-right">
            <p className="text-sm font-medium leading-tight">{me.user.name}</p>
            <p className="text-[11px] leading-tight text-slate-400">{ROLE_LABEL[me.user.role] || me.user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          title="Sign out"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
