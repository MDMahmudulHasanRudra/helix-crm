"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Contact,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Plus,
  Receipt,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useSearch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { KeyHint } from "@/components/ui/primitives";

const quickLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Accounts", href: "/accounts", icon: Building2 },
  { label: "Contacts", href: "/contacts", icon: Contact },
  { label: "Leads", href: "/leads", icon: Sparkles },
  { label: "Deals", href: "/deals", icon: CircleDollarSign },
  { label: "Activities", href: "/activities", icon: Activity },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Tickets", href: "/tickets", icon: LifeBuoy },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Settings", href: "/settings", icon: Settings },
];

type Row = { key: string; label: string; hint?: string; icon: React.ReactNode; href: string; group: string };

const groupIcons: Record<string, React.ReactNode> = {
  Account: <Building2 className="size-3.5" />,
  Contact: <Contact className="size-3.5" />,
  Lead: <Sparkles className="size-3.5" />,
  Deal: <CircleDollarSign className="size-3.5" />,
  Ticket: <LifeBuoy className="size-3.5" />,
  Quote: <FileText className="size-3.5" />,
};

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useSearch(query);

  const rows = useMemo<Row[]>(() => {
    const term = query.trim();
    if (term.length < 2) {
      return quickLinks.map((item) => ({
        key: item.href,
        label: item.label,
        icon: <item.icon className="size-3.5" />,
        href: item.href,
        group: "Go to",
      }));
    }
    return (data?.groups ?? []).flatMap((group) =>
      group.items.map((item) => ({
        key: `${group.type}-${item.id}`,
        label: item.title,
        hint: item.subtitle,
        icon: groupIcons[group.type] ?? <Search className="size-3.5" />,
        href: item.url,
        group: group.label,
      })),
    );
  }, [query, data]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
    setQuery("");
  }, [open]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (rows.length ? (current + 1) % rows.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (rows.length ? (current - 1 + rows.length) % rows.length : 0));
    } else if (event.key === "Enter" && rows[active]) {
      event.preventDefault();
      go(rows[active].href);
    }
  }

  const grouped = rows.reduce<Record<string, Row[]>>((acc, row) => {
    (acc[row.group] ??= []).push(row);
    return acc;
  }, {});

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in-fade" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[18vh] z-[60] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-elevated shadow-pop outline-none data-[state=open]:animate-in-up">
          <DialogPrimitive.Title className="sr-only">Search workspace</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search accounts, contacts, deals…"
              className="h-12 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-faint"
            />
            {isLoading ? <Loader2 className="size-3.5 animate-spin text-faint" /> : null}
            <KeyHint>esc</KeyHint>
          </div>

          <div className="max-h-[52vh] overflow-y-auto p-2">
            {rows.length === 0 && !isLoading ? (
              <div className="px-3 py-10 text-center">
                <p className="text-[13px] font-medium text-foreground">No results for “{query}”</p>
                <p className="mt-1 text-[12px] text-muted">Try a company, contact, email or deal name.</p>
              </div>
            ) : (
              Object.entries(grouped).map(([group, items]) => (
                <div key={group} className="mb-1.5">
                  <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-faint">
                    {group}
                  </div>
                  {items.map((row) => {
                    const index = rows.indexOf(row);
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(row.href)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          active === index ? "bg-surface-2" : "hover:bg-surface-2/70",
                        )}
                      >
                        <span className="flex size-6 items-center justify-center rounded-md border border-border bg-surface text-muted">
                          {row.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-foreground">{row.label}</span>
                          {row.hint ? <span className="block truncate text-[11px] text-muted">{row.hint}</span> : null}
                        </span>
                        {active === index ? <ArrowRight className="size-3.5 text-faint" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2 text-[10.5px] text-muted">
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><KeyHint>↑</KeyHint><KeyHint>↓</KeyHint> navigate</span>
              <span className="flex items-center gap-1"><KeyHint>↵</KeyHint> open</span>
            </span>
            <span className="flex items-center gap-1">
              <Plus className="size-3" /> create from any page
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
