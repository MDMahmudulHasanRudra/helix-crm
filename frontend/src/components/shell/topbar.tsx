"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import {
  Bell,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  Command,
  Contact,
  FileText,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  User as UserIcon,
} from "lucide-react";
import { mutate as globalMutate } from "swr";
import { mutate as apiMutate, useNotifications } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import { Avatar, Badge, KeyHint } from "@/components/ui/primitives";
import { Button, IconButton } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/overlays";
import { useTheme } from "@/components/providers";
import { useWorkspace } from "./workspace-provider";

const titles: Record<string, string> = {
  dashboard: "Dashboard",
  accounts: "Accounts",
  contacts: "Contacts",
  leads: "Leads",
  deals: "Deals",
  activities: "Activities",
  tickets: "Tickets",
  quotes: "Quotes",
  invoices: "Invoices",
  calendar: "Calendar",
  products: "Products",
  reports: "Reports",
  settings: "Settings",
};

export function Topbar({
  onOpenSidebar,
  onOpenPalette,
}: {
  onOpenSidebar: () => void;
  onOpenPalette: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, logout } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const { data: notifications, mutate } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const current = useMemo(() => {
    const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
    return titles[segment] ?? "Workspace";
  }, [pathname]);

  async function markAllRead() {
    await apiMutate("/notifications/read-all", "POST");
    await mutate();
    await globalMutate("/notifications");
  }

  async function markRead(id: string) {
    await apiMutate(`/notifications/${id}/read`, "PATCH");
    await mutate();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border glass px-4 lg:px-5">
      <IconButton className="lg:hidden" onClick={onOpenSidebar} aria-label="Open navigation">
        <Menu className="size-4" />
      </IconButton>

      <div className="hidden items-center gap-2 text-[12.5px] md:flex">
        <span className="font-medium text-foreground">{me.organization.name}</span>
        <span className="text-faint">/</span>
        <span className="text-muted">{current}</span>
      </div>

      <div className="flex flex-1 justify-center px-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex h-8 w-full max-w-[380px] items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-left text-[12px] text-faint shadow-soft transition-colors hover:border-border-strong hover:text-muted"
        >
          <Search className="size-3.5" />
          <span className="flex-1 truncate">Search or jump to…</span>
          <span className="flex items-center gap-0.5">
            <KeyHint>⌘</KeyHint>
            <KeyHint>K</KeyHint>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button size="sm" variant="secondary" className="hidden sm:inline-flex">
              <Plus className="size-3.5" />
              Create
              <ChevronDown className="size-3 text-faint" />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end" className="min-w-[210px]">
            <DropdownLabel>Create new</DropdownLabel>
            <DropdownItem icon={<Building2 />} onSelect={() => router.push("/accounts")}>
              Account
            </DropdownItem>
            <DropdownItem icon={<Contact />} onSelect={() => router.push("/contacts")}>
              Contact
            </DropdownItem>
            <DropdownItem icon={<Sparkles />} onSelect={() => router.push("/leads")}>
              Lead
            </DropdownItem>
            <DropdownItem icon={<CircleDollarSign />} onSelect={() => router.push("/deals")}>
              Deal
            </DropdownItem>
            <DropdownItem icon={<LifeBuoy />} onSelect={() => router.push("/tickets")}>
              Ticket
            </DropdownItem>
            <DropdownItem icon={<FileText />} onSelect={() => router.push("/quotes")}>
              Quote
            </DropdownItem>
          </DropdownContent>
        </Dropdown>

        <IconButton onClick={onOpenPalette} aria-label="Command menu" className="hidden md:inline-flex">
          <Command className="size-4" />
        </IconButton>

        <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <PopoverTrigger asChild>
            <IconButton aria-label="Notifications" className="relative">
              <Bell className="size-4" />
              {notifications && notifications.unread > 0 ? (
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-danger ring-2 ring-surface" />
              ) : null}
            </IconButton>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground">Notifications</span>
                {notifications && notifications.unread > 0 ? (
                  <Badge tone="brand" className="h-[18px] px-1.5 text-[10px]">
                    {notifications.unread} new
                  </Badge>
                ) : null}
              </div>
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-foreground"
              >
                <CheckCheck className="size-3" /> Mark all read
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {notifications?.items.length ? (
                notifications.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.link ?? "#"}
                    onClick={() => {
                      if (!item.isRead) void markRead(item.id);
                      setNotificationsOpen(false);
                    }}
                    className={cn(
                      "flex gap-2.5 border-b border-border px-3.5 py-2.5 transition-colors last:border-0 hover:bg-surface-2",
                      !item.isRead && "bg-brand-soft/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 size-1.5 shrink-0 rounded-full",
                        item.type === "success"
                          ? "bg-success"
                          : item.type === "warning"
                            ? "bg-warning"
                            : "bg-info",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium leading-snug text-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{item.body}</span>
                      <span className="mt-1 block text-[10px] text-faint">{relativeTime(item.createdAt)}</span>
                    </span>
                    {item.isRead ? <Check className="mt-1 size-3 shrink-0 text-faint" /> : null}
                  </Link>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-[12px] text-muted">You’re all caught up.</div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <IconButton
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>

        <Dropdown>
          <DropdownTrigger asChild>
            <button
              type="button"
              className="ml-1 flex items-center gap-1.5 rounded-lg py-0.5 pl-1 pr-1.5 transition-colors hover:bg-surface-2"
            >
              <Avatar name={me.user.fullName} src={me.user.avatarUrl} size="sm" />
              <ChevronDown className="size-3 text-faint" />
            </button>
          </DropdownTrigger>
          <DropdownContent align="end" className="w-[240px]">
            <div className="flex items-center gap-2.5 px-2 pb-2 pt-1.5">
              <Avatar name={me.user.fullName} src={me.user.avatarUrl} size="md" />
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold text-foreground">{me.user.fullName}</div>
                <div className="truncate text-[11px] text-muted">{me.user.email}</div>
              </div>
            </div>
            <DropdownSeparator />
            <DropdownItem icon={<UserIcon />} onSelect={() => router.push("/settings?tab=profile")}>
              Your profile
            </DropdownItem>
            <DropdownItem icon={<Settings />} onSelect={() => router.push("/settings")}>
              Workspace settings
            </DropdownItem>
            <DropdownItem icon={<Command />} onSelect={onOpenPalette}>
              Command menu
            </DropdownItem>
            <DropdownSeparator />
            <DropdownLabel>Theme</DropdownLabel>
            <DropdownItem icon={<Sun />} onSelect={() => setTheme("light")}>
              Light {theme === "light" ? <Check className="ml-auto size-3" /> : null}
            </DropdownItem>
            <DropdownItem icon={<Moon />} onSelect={() => setTheme("dark")}>
              Dark {theme === "dark" ? <Check className="ml-auto size-3" /> : null}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<LogOut />} danger onSelect={() => void logout()}>
              Sign out
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </header>
  );
}
