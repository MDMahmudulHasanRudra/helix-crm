"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Upload, Users } from "lucide-react";
import { download, useContacts } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { ImportDialog } from "@/components/shared/import-dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Avatar, Badge } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { OwnerCell } from "@/components/shared/badges";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import type { ContactListItem } from "@/lib/types";

const PAGE_SIZE = 25;

export default function ContactsPage() {
  const router = useRouter();
  const { users } = useWorkspace();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, mutate } = useContacts({ search, ownerId, page, pageSize: PAGE_SIZE });

  const columns = useMemo<Column<ContactListItem>[]>(
    () => [
      {
        key: "name",
        header: "Contact",
        width: "26%",
        render: (contact) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={contact.fullName} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-medium text-foreground">{contact.fullName}</span>
                {contact.isPrimary ? <Badge tone="brand" className="h-4 px-1 text-[9px]">Primary</Badge> : null}
              </div>
              <div className="truncate text-[10.5px] text-muted">{contact.email ?? "No email"}</div>
            </div>
          </div>
        ),
      },
      {
        key: "account",
        header: "Account",
        width: "18%",
        render: (contact) =>
          contact.accountId ? (
            <span className="truncate text-muted">{contact.accountName}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "title",
        header: "Title",
        render: (contact) => <span className="truncate text-muted">{contact.title ?? "—"}</span>,
      },
      {
        key: "phone",
        header: "Phone",
        width: "150px",
        render: (contact) => <span className="text-[11.5px] tabular-nums text-muted">{contact.phone ?? "—"}</span>,
      },
      {
        key: "owner",
        header: "Owner",
        width: "160px",
        render: (contact) => <OwnerCell name={contact.ownerName} avatarUrl={contact.ownerAvatarUrl} />,
      },
      {
        key: "tags",
        header: "Tags",
        width: "140px",
        render: (contact) =>
          contact.tags.length ? (
            <div className="flex gap-1 overflow-hidden">
              {contact.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} tone="outline" className="h-4 px-1.5 text-[9px]">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "updated",
        header: "Updated",
        align: "right",
        width: "110px",
        render: (contact) => <span className="text-[11.5px] text-muted">{formatDate(contact.updatedAt)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Contacts"
        subtitle={data ? `${data.total} people across your accounts` : "Everyone you work with, in one place"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => download("/contacts/export")}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" /> New contact
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search name, email or title…"
          className="w-full sm:w-[280px]"
        />
        <NativeSelect
          value={ownerId}
          onChange={(event) => {
            setOwnerId(event.target.value);
            setPage(1);
          }}
          className="h-8 w-auto min-w-[140px] text-[12px]"
        >
          <option value="">All owners</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName}
            </option>
          ))}
        </NativeSelect>
        <Badge tone="outline" className="ml-auto">
          {data?.total ?? 0} contacts
        </Badge>
      </div>

      <div className="mt-2.5">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          loading={isLoading}
          onRowClick={(contact) => router.push(`/contacts/${contact.id}`)}
          emptyTitle="No contacts found"
          emptyDescription="Try a different search, or add someone new."
          emptyAction={
            <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" /> New contact
            </Button>
          }
          footer={
            data && data.total > 0 ? (
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                onPage={setPage}
              />
            ) : null
          }
        />
      </div>

      {!isLoading && (data?.total ?? 0) === 0 && !search && !ownerId ? (
        <div className="mt-6 grid place-items-center rounded-xl border border-dashed border-border py-10 text-center">
          <Users className="mb-2 size-5 text-faint" />
          <p className="text-[13px] font-medium">Your contact book is empty</p>
          <p className="mt-1 text-[12px] text-muted">Add people to link them to accounts, deals and tickets.</p>
        </div>
      ) : null}

      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={() => void mutate()} />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityName="contacts"
        title="Import contacts"
        templateColumns={["firstName", "lastName", "email", "phone", "title", "department", "accountName", "city", "country"]}
        sampleRows={[["Priya", "Shah", "priya@acme.io", "+1 415 555 0101", "VP Operations", "Operations", "Acme Robotics", "San Francisco", "United States"]]}
      />
    </div>
  );
}
