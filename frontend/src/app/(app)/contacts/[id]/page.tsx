"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
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
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useContact } from "@/lib/api";
import { formatDate, formatDateTime, money, pluralize } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/overlays";
import { DetailField } from "@/components/ui/layout";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { AuditTrail, CustomFieldsCard } from "@/components/shared/record-sections";
import { StatusBadge } from "@/components/shared/badges";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { ActivityDialog } from "@/components/shared/activity-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useWorkspace } from "@/components/shell/workspace-provider";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useWorkspace();
  const { data: contact, isLoading, mutate: refresh } = useContact(params.id);
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading && !contact) return <DetailSkeleton />;

  if (!contact) {
    return (
      <div className="grid place-items-center py-24">
        <EmptyState
          icon={<Users />}
          title="Contact not found"
          description="It may have been deleted, or you may not have access."
          action={
            <Button variant="primary" size="sm" asChild>
              <Link href="/contacts">Back to contacts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const currency = me.organization.currency;
  const pipeline = contact.deals.filter((deal) => deal.status === "Open").reduce((acc, deal) => acc + deal.amount, 0);

  async function remove() {
    setDeleting(true);
    try {
      await mutate(`/contacts/${contact!.id}`, "DELETE");
      await globalMutate((key) => typeof key === "string" && (key.startsWith("/contacts") || key.startsWith("/accounts") || key.startsWith("/dashboard")));
      toast.success("Contact deleted");
      router.push("/contacts");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete contact");
      setDeleting(false);
    }
  }

  return (
    <div className="animate-in-fade">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Link href="/contacts" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Contacts
        </Link>
        <ChevronRight className="size-3 text-faint" />
        <span className="truncate text-foreground">{contact.fullName}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={contact.fullName} size="xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
                {contact.fullName}
              </h1>
              {contact.isPrimary ? <Badge tone="brand">Primary contact</Badge> : null}
              {contact.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} tone="outline">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              {contact.title ? (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="size-3" /> {contact.title}
                </span>
              ) : null}
              {contact.accountId ? (
                <Link href={`/accounts/${contact.accountId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Users className="size-3" /> {contact.accountName}
                </Link>
              ) : null}
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Mail className="size-3" /> {contact.email}
                </a>
              ) : null}
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3" /> {contact.phone}
                </a>
              ) : null}
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
              <DropdownItem icon={<Mail />} onSelect={() => window.open(`mailto:${contact.email ?? ""}`)}>
                Send email
              </DropdownItem>
              <DropdownItem icon={<CircleDollarSign />} onSelect={() => router.push(`/deals`)}>
                Create deal
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleteOpen(true)}>
                Delete contact
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Open pipeline", value: money(pipeline, currency, { compact: true }), detail: `${contact.deals.filter((deal) => deal.status === "Open").length} open deals` },
          { label: "Deals", value: contact.deals.length, detail: contact.deals[0]?.name ?? "No deals yet" },
          { label: "Activities", value: contact.activities.length, detail: `${contact.activities.filter((item) => item.status === "Open").length} open` },
          { label: "Tickets", value: contact.tickets.length, detail: contact.tickets[0]?.number ?? "No tickets" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
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
                <TabsTrigger value="deals" count={contact.deals.length}>Deals</TabsTrigger>
                <TabsTrigger value="activity" count={contact.activities.length}>Activity</TabsTrigger>
                <TabsTrigger value="tickets" count={contact.tickets.length}>Tickets</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="p-4">
              {contact.notes ? (
                <div className="mb-5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Notes</h3>
                  <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{contact.notes}</p>
                </div>
              ) : null}
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Contact details</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                <DetailField label="Email">{contact.email}</DetailField>
                <DetailField label="Phone">{contact.phone}</DetailField>
                <DetailField label="Mobile">{contact.mobile}</DetailField>
                <DetailField label="Title">{contact.title}</DetailField>
                <DetailField label="Department">{contact.department}</DetailField>
                <DetailField label="Account">
                  {contact.accountId ? (
                    <Link href={`/accounts/${contact.accountId}`} className="text-brand hover:underline">
                      {contact.accountName}
                    </Link>
                  ) : null}
                </DetailField>
                <DetailField label="City">{contact.city}</DetailField>
                <DetailField label="Country">{contact.country}</DetailField>
                <DetailField label="LinkedIn">
                  {contact.linkedInUrl ? (
                    <a href={contact.linkedInUrl.startsWith("http") ? contact.linkedInUrl : `https://${contact.linkedInUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                      Profile <ExternalLink className="size-2.5" />
                    </a>
                  ) : null}
                </DetailField>
                <DetailField label="Owner">{contact.ownerName}</DetailField>
                <DetailField label="Created">{formatDate(contact.createdAt, "long")}</DetailField>
                <DetailField label="Last updated">{formatDateTime(contact.updatedAt)}</DetailField>
              </dl>
              <div className="mt-6 border-t border-border pt-4">
                <AuditTrail entries={contact.audit} />
              </div>
            </TabsContent>

            <TabsContent value="deals">
              {contact.deals.length ? (
                <div className="divide-y divide-border">
                  {contact.deals.map((deal) => (
                    <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: deal.stageColor }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium">{deal.name}</div>
                        <div className="text-[10.5px] text-muted">{deal.stageName}</div>
                      </div>
                      <span className="text-[12px] font-semibold tabular-nums">{money(deal.amount, deal.currency, { compact: true })}</span>
                      <StatusBadge status={deal.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No deals yet" description="Deals linked to this contact will appear here." compact />
              )}
            </TabsContent>

            <TabsContent value="activity">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[11.5px] text-muted">{pluralize(contact.activities.length, "activity", "activities")}</span>
                <Button size="xs" variant="secondary" onClick={() => setActivityOpen(true)}>
                  <Plus className="size-3" /> Log activity
                </Button>
              </div>
              <div className="border-t border-border">
                <ActivityFeed items={contact.activities} showRelated={false} showComplete />
              </div>
            </TabsContent>

            <TabsContent value="tickets">
              {contact.tickets.length ? (
                <div className="divide-y divide-border">
                  {contact.tickets.map((ticket) => (
                    <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
                      <span className="font-mono text-[10.5px] text-faint">{ticket.number}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{ticket.subject}</span>
                      <StatusBadge status={ticket.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No tickets" description="Support conversations with this contact will show up here." compact />
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Details" />
            <div className="space-y-3.5 px-4 pb-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={contact.fullName} size="md" />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium">{contact.fullName}</div>
                  <div className="truncate text-[11px] text-muted">{contact.title ?? "Contact"}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <DetailField label="Owner">{contact.ownerName}</DetailField>
                <DetailField label="Primary">{contact.isPrimary ? "Yes" : "No"}</DetailField>
                <DetailField label="City">{contact.city}</DetailField>
                <DetailField label="Country">{contact.country}</DetailField>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Tags</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {contact.tags.length ? contact.tags.map((tag) => <Badge key={tag} tone="outline">{tag}</Badge>) : <span className="text-[11.5px] text-faint">None</span>}
                </div>
              </div>
            </div>
          </Card>
          <CustomFieldsCard fields={contact.customFields} />
          <Card>
            <CardHeader title="Quick actions" />
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
              {[
                { label: "Send email", icon: <Mail className="size-3.5" />, onClick: () => window.open(`mailto:${contact.email ?? ""}`) },
                { label: "Log activity", icon: <CalendarDays className="size-3.5" />, onClick: () => setActivityOpen(true) },
                { label: "Open account", icon: <Globe className="size-3.5" />, onClick: () => contact.accountId && router.push(`/accounts/${contact.accountId}`) },
                { label: "Support", icon: <LifeBuoy className="size-3.5" />, onClick: () => router.push("/tickets") },
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

      <ContactDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} onSaved={() => void refresh()} />
      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        relatedType="Contact"
        relatedId={contact.id}
        relatedName={contact.fullName}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${contact.fullName}?`}
        description="The contact and its links will be archived."
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
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-3 h-[420px] rounded-xl" />
    </div>
  );
}
