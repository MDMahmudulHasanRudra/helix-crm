"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Globe,
  LifeBuoy,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useAccount } from "@/lib/api";
import { formatDate, formatDateTime, money, pluralize } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { DetailField } from "@/components/ui/layout";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { AuditTrail, CustomFieldsCard } from "@/components/shared/record-sections";
import { EntityMark, OwnerCell, StatusBadge } from "@/components/shared/badges";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { ActivityDialog } from "@/components/shared/activity-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useWorkspace } from "@/components/shell/workspace-provider";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useWorkspace();
  const { data: account, isLoading, mutate: refresh } = useAccount(params.id);
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading && !account) return <DetailSkeleton />;

  if (!account) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState
          icon={<Building2 />}
          title="Account not found"
          description="It may have been deleted, or you may not have access."
          action={
            <Button variant="primary" size="sm" asChild>
              <Link href="/accounts">Back to accounts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const currency = me.organization.currency;
  const openPipeline = account.deals.filter((deal) => deal.status === "Open").reduce((acc, deal) => acc + deal.amount, 0);
  const openTickets = account.tickets.filter((ticket) => ticket.status === "Open" || ticket.status === "Pending").length;

  async function remove() {
    setDeleting(true);
    try {
      await mutate(`/accounts/${account!.id}`, "DELETE");
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/accounts") || key.startsWith("/dashboard")));
      toast.success("Account deleted");
      router.push("/accounts");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="animate-in-fade">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Link href="/accounts" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Accounts
        </Link>
        <ChevronRight className="size-3 text-faint" />
        <span className="truncate text-foreground">{account.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <EntityMark name={account.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
                {account.name}
              </h1>
              <StatusBadge status={account.status} />
              {account.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} tone="outline">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              {account.domain ? (
                <a
                  href={account.website ?? `https://${account.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Globe className="size-3" /> {account.domain}
                  <ExternalLink className="size-2.5" />
                </a>
              ) : null}
              {account.industry ? <span>{account.industry}</span> : null}
              {account.city ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {account.city}
                  {account.country ? `, ${account.country}` : ""}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <OwnerCell name={account.ownerName} avatarUrl={account.ownerAvatarUrl} size="xs" />
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)}>
            <Plus className="size-3.5" /> Log activity
          </Button>
          <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Dropdown>
            <DropdownTrigger asChild>
              <IconButton variant="outline" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </IconButton>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<UserPlus />} onSelect={() => setContactOpen(true)}>
                Add contact
              </DropdownItem>
              <DropdownItem icon={<CircleDollarSign />} onSelect={() => router.push(`/deals?accountId=${account.id}`)}>
                Create deal
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteOpen(true)}>
                Delete account
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          {
            label: "Open pipeline",
            value: money(openPipeline, currency, { compact: true }),
            detail: `${account.deals.filter((deal) => deal.status === "Open").length} open deals`,
            icon: <CircleDollarSign className="size-3.5" />,
          },
          {
            label: "Contacts",
            value: account.contacts.length,
            detail: account.contacts[0]?.fullName ?? "No contacts yet",
            icon: <Users className="size-3.5" />,
          },
          {
            label: "Open tickets",
            value: openTickets,
            detail: `${account.tickets.length} total`,
            icon: <LifeBuoy className="size-3.5" />,
          },
          {
            label: "Quotes",
            value: account.quotes.length,
            detail: money(account.quotes.reduce((acc, quote) => acc + quote.total, 0), currency, { compact: true }),
            icon: <ReceiptText className="size-3.5" />,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className="text-faint">{item.icon}</span>
            </div>
            <div className="mt-1.5 text-[19px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 truncate text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <Tabs defaultValue="overview">
            <div className="border-b border-border px-3 py-2.5">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="contacts" count={account.contacts.length}>
                  Contacts
                </TabsTrigger>
                <TabsTrigger value="deals" count={account.deals.length}>
                  Deals
                </TabsTrigger>
                <TabsTrigger value="activity" count={account.activities.length}>
                  Activity
                </TabsTrigger>
                <TabsTrigger value="tickets" count={account.tickets.length}>
                  Tickets
                </TabsTrigger>
                <TabsTrigger value="quotes" count={account.quotes.length}>
                  Quotes
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="p-4">
              <div className="grid gap-5">
                {account.description ? (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">About</h3>
                    <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">{account.description}</p>
                  </div>
                ) : null}
                <div>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Company details</h3>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                    <DetailField label="Industry">{account.industry}</DetailField>
                    <DetailField label="Employees">{account.employees?.toLocaleString()}</DetailField>
                    <DetailField label="Annual revenue">
                      {account.annualRevenue ? money(account.annualRevenue, currency) : null}
                    </DetailField>
                    <DetailField label="Phone">
                      {account.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3 text-faint" /> {account.phone}
                        </span>
                      ) : null}
                    </DetailField>
                    <DetailField label="Email">
                      {account.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3 text-faint" /> {account.email}
                        </span>
                      ) : null}
                    </DetailField>
                    <DetailField label="Website">
                      {account.website ? (
                        <a href={account.website} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                          {account.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : null}
                    </DetailField>
                    <DetailField label="Address" className="md:col-span-2">
                      {[account.street, account.city, account.state, account.postalCode, account.country]
                        .filter(Boolean)
                        .join(", ")}
                    </DetailField>
                    <DetailField label="Owner">{account.ownerName}</DetailField>
                    <DetailField label="Created">{formatDate(account.createdAt, "long")}</DetailField>
                    <DetailField label="Last updated">{formatDateTime(account.updatedAt)}</DetailField>
                  </dl>
                </div>
              </div>
              <div className="mt-6 border-t border-border pt-4">
                <AuditTrail entries={account.audit} />
              </div>
            </TabsContent>

            <TabsContent value="contacts">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[11.5px] text-muted">{pluralize(account.contacts.length, "contact")}</span>
                <Button size="xs" variant="secondary" onClick={() => setContactOpen(true)}>
                  <Plus className="size-3" /> Add contact
                </Button>
              </div>
              {account.contacts.length ? (
                <div className="divide-y divide-border border-t border-border">
                  {account.contacts.map((contact) => (
                    <Link
                      key={contact.id}
                      href={`/contacts/${contact.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/50"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-muted">
                        {contact.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-foreground">{contact.fullName}</div>
                        <div className="truncate text-[11px] text-muted">{contact.title ?? "—"} · {contact.email ?? "No email"}</div>
                      </div>
                      <ChevronRight className="size-3.5 text-faint" />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No contacts yet" description="Add the people you're working with at this company." compact />
              )}
            </TabsContent>

            <TabsContent value="deals">
              {account.deals.length ? (
                <div className="divide-y divide-border">
                  {account.deals.map((deal) => (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/50"
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: deal.stageColor }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-foreground">{deal.name}</div>
                        <div className="text-[10.5px] text-muted">
                          {deal.stageName} · {deal.expectedCloseDate ? `closes ${formatDate(deal.expectedCloseDate)}` : "no close date"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[12.5px] font-semibold tabular-nums">{money(deal.amount, deal.currency, { compact: true })}</div>
                        <StatusBadge status={deal.status} dot={false} className="mt-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No deals yet" description="Create an opportunity to start tracking pipeline for this account." compact
                  action={<Button size="xs" variant="primary" onClick={() => router.push(`/deals?accountId=${account.id}`)}><Plus className="size-3" /> Create deal</Button>} />
              )}
            </TabsContent>

            <TabsContent value="activity">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[11.5px] text-muted">{pluralize(account.activities.length, "activity", "activities")}</span>
                <Button size="xs" variant="secondary" onClick={() => setActivityOpen(true)}>
                  <Plus className="size-3" /> Log activity
                </Button>
              </div>
              <div className="border-t border-border">
                <ActivityFeed items={account.activities} showRelated={false} showComplete />
              </div>
            </TabsContent>

            <TabsContent value="tickets">
              {account.tickets.length ? (
                <div className="divide-y divide-border">
                  {account.tickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/tickets/${ticket.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/50"
                    >
                      <span className="font-mono text-[10.5px] text-faint">{ticket.number}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{ticket.subject}</span>
                      <StatusBadge status={ticket.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No support tickets" description="Conversations linked to this account will show up here." compact />
              )}
            </TabsContent>

            <TabsContent value="quotes">
              {account.quotes.length ? (
                <div className="divide-y divide-border">
                  {account.quotes.map((quote) => (
                    <Link
                      key={quote.id}
                      href={`/quotes/${quote.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/50"
                    >
                      <span className="font-mono text-[10.5px] text-faint">{quote.number}</span>
                      <span className="min-w-0 flex-1 text-[12.5px] text-foreground">{formatDate(quote.issueDate)}</span>
                      <span className="text-[12px] font-medium tabular-nums">{money(quote.total, quote.currency)}</span>
                      <StatusBadge status={quote.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No quotes yet" description="Send a quote to move this relationship forward." compact />
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Relationship" />
            <div className="space-y-3.5 px-4 pb-4">
              <div className="flex items-center gap-2.5">
                <EntityMark name={account.ownerName ?? "Unassigned"} size="md" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Account owner</div>
                  <div className="truncate text-[12.5px] font-medium text-foreground">{account.ownerName ?? "Unassigned"}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <DetailField label="Status">{account.status}</DetailField>
                <DetailField label="Created">{formatDate(account.createdAt)}</DetailField>
                <DetailField label="Updated">{formatDate(account.updatedAt)}</DetailField>
                <DetailField label="Domain">{account.domain}</DetailField>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Tags</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {account.tags.length ? account.tags.map((tag) => <Badge key={tag} tone="outline">{tag}</Badge>) : <span className="text-[11.5px] text-faint">None</span>}
                </div>
              </div>
            </div>
          </Card>

          <CustomFieldsCard fields={account.customFields} />

          <Card>
            <CardHeader title="Quick actions" />
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
              {[
                { label: "Add contact", icon: <UserPlus className="size-3.5" />, onClick: () => setContactOpen(true) },
                { label: "Log activity", icon: <CalendarDays className="size-3.5" />, onClick: () => setActivityOpen(true) },
                { label: "New deal", icon: <CircleDollarSign className="size-3.5" />, onClick: () => router.push(`/deals?accountId=${account.id}`) },
                { label: "Open tickets", icon: <LifeBuoy className="size-3.5" />, onClick: () => router.push("/tickets") },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-surface p-2.5 text-left text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <span className="text-faint">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <AccountDialog open={editOpen} onOpenChange={setEditOpen} account={account} onSaved={() => void refresh()} />
      <ContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        presetAccountId={account.id}
        onSaved={() => void refresh()}
      />
      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        relatedType="Account"
        relatedId={account.id}
        relatedName={account.name}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${account.name}?`}
        description="The account and its links will be archived."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    </div>
  );
}
