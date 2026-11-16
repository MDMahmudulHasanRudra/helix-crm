"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  Cable,
  ChevronDown,
  CircleDollarSign,
  Contact,
  FileText,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Receipt,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

const nav = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/accounts", label: "Accounts", icon: Building2 },
      { href: "/contacts", label: "Contacts", icon: Contact },
      { href: "/leads", label: "Leads", icon: Sparkles },
      { href: "/deals", label: "Deals", icon: CircleDollarSign },
      { href: "/activities", label: "Activities", icon: Activity },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Customer success",
    items: [
      { href: "/tickets", label: "Tickets", icon: LifeBuoy },
      { href: "/quotes", label: "Quotes", icon: FileText },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/products", label: "Products", icon: Package },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

export function Sidebar({
  orgName,
  open,
  onClose,
}: {
  orgName: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const content = (
    <div className="flex h-full w-[236px] flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center justify-between px-3">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1">
          <span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-brand text-brand-foreground shadow-soft">
            <Cable className="size-4" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
              {orgName}
            </span>
            <span className="block text-[10px] leading-tight text-faint">Helix CRM</span>
          </span>
          <ChevronDown className="ml-auto size-3 shrink-0 text-faint" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-2">
        {nav.map((section) => (
          <div key={section.label}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-sidebar-active text-foreground"
                        : "text-muted hover:bg-sidebar-active/60 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("size-[15px] shrink-0", active ? "text-brand" : "text-faint group-hover:text-muted")}
                      strokeWidth={1.9}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <div className="mb-2 rounded-lg border border-brand/15 bg-brand-soft p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand">
            <Inbox className="size-3.5" />
            Shared inbox
          </div>
          <p className="mt-1 text-[10.5px] leading-snug text-muted">
            Every customer conversation in one place.
          </p>
          <Link
            href="/tickets"
            className="mt-2 inline-flex h-6 items-center rounded-md bg-brand px-2 text-[10.5px] font-medium text-brand-foreground hover:bg-brand-hover"
          >
            Open inbox
          </Link>
        </div>
        <Link
          href="/settings"
          onClick={onClose}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-sidebar-active text-foreground"
              : "text-muted hover:bg-sidebar-active/60 hover:text-foreground",
          )}
        >
          <Settings className="size-[15px] text-faint" strokeWidth={1.9} />
          Settings
          <Badge tone="outline" className="ml-auto h-4 px-1.5 text-[9px]">
            ⌘,
          </Badge>
        </Link>
        <div className="mt-1 flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted">
          <Users className="size-[15px] text-faint" strokeWidth={1.9} />
          <span>5 teammates</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex">{content}</aside>
      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/50 animate-in-fade" onClick={onClose} />
          <div className="relative animate-slide-right">{content}</div>
        </div>
      ) : null}
    </>
  );
}
