"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Download, Plus, Upload } from "lucide-react";
import { download, useAccounts } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { formatDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { ImportDialog } from "@/components/shared/import-dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { EntityMark, OwnerCell, StatusBadge } from "@/components/shared/badges";
import { AccountDialog } from "@/components/accounts/account-dialog";
import type { AccountListItem } from "@/lib/types";

const PAGE_SIZE = 25;

export default function AccountsPage() {
  const router = useRouter();
  const { me, users } = useWorkspace();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
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

  const { data, isLoading, mutate } = useAccounts({
    search,
    status,
    ownerId,
    page,
    pageSize: PAGE_SIZE,
    sort: "updatedAt",
  });

  const columns = useMemo<Column<AccountListItem>[]>(
    () => [
      {
        key: "name",
        header: "Account",
        width: "29%",
        render: (account) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <EntityMark name={account.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium text-foreground">{account.name}</div>
              <div className="truncate text-[10.5px] text-muted">{account.domain ?? account.city ?? "—"}</div>
            </div>
          </div>
        ),
      },
      {
        key: "industry",
        header: "Industry",
        render: (account) => <span className="truncate text-muted">{account.industry ?? "—"}</span>,
      },
      {
        key: "contacts",
        header: "Contacts",
        align: "right",
        width: "90px",
        render: (account) => <span className="tabular-nums">{account.contactCount}</span>,
      },
      {
        key: "deals",
        header: "Open deals",
        align: "right",
        width: "100px",
        render: (account) => <span className="tabular-nums">{account.openDealCount}</span>,
      },
      {
        key: "value",
        header: "Pipeline",
        align: "right",
        width: "120px",
        render: (account) => (
          <span className="tabular-nums font-medium">
            {account.openPipelineValue > 0 ? money(account.openPipelineValue, me.organization.currency) : "—"}
          </span>
        ),
      },
      {
        key: "owner",
        header: "Owner",
        width: "160px",
        render: (account) => <OwnerCell name={account.ownerName} avatarUrl={account.ownerAvatarUrl} />,
      },
      {
        key: "status",
        header: "Status",
        width: "110px",
        render: (account) => <StatusBadge status={account.status} />,
      },
      {
        key: "updated",
        header: "Updated",
        align: "right",
        width: "120px",
        render: (account) => <span className="text-[11.5px] text-muted">{formatDate(account.updatedAt)}</span>,
      },
    ],
    [me.organization.currency],
  );

  const totalPipeline = data?.items.reduce((acc, item) => acc + item.openPipelineValue, 0) ?? 0;

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Accounts"
        subtitle={
          data
            ? `${data.total} companies · ${money(totalPipeline, me.organization.currency, { compact: true })} open pipeline on this page`
            : "Companies and organisations in your workspace"
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => download("/accounts/export")}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" /> New account
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search accounts by name, domain…"
          className="w-full sm:w-[280px]"
        />
        <NativeSelect
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-8 w-auto min-w-[130px] text-[12px]"
        >
          <option value="">All statuses</option>
          {["Active", "Prospect", "Churned", "Inactive"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
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
        <div className="ml-auto flex items-center gap-1.5">
          <Badge tone="outline">{data?.total ?? 0} accounts</Badge>
        </div>
      </div>

      <div className="mt-2.5">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          loading={isLoading}
          onRowClick={(account) => router.push(`/accounts/${account.id}`)}
          emptyTitle="No accounts found"
          emptyDescription="Try a different search, or create your first account."
          emptyAction={
            <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3.5" /> New account
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

      {!isLoading && (data?.total ?? 0) === 0 && !search && !status && !ownerId ? (
        <div className="mt-6 rounded-xl border border-dashed border-border">
          <EmptyState
            icon={<Building2 />}
            title="Build your account list"
            description="Accounts are the companies you sell to. Add one to start tracking contacts, deals and support conversations."
            action={
              <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="size-3.5" /> Add your first account
              </Button>
            }
          />
        </div>
      ) : null}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          void mutate();
          setDialogOpen(false);
        }}
      />

      <p className="mt-3 text-[10.5px] text-faint">
        Tip: press <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[9px]">⌘K</kbd> to jump to any account from anywhere.
      </p>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityName="accounts"
        title="Import accounts"
        templateColumns={["name", "domain", "industry", "phone", "email", "city", "country", "status"]}
        sampleRows={[["Acme Robotics", "acme.io", "Manufacturing", "+1 415 555 0100", "hello@acme.io", "San Francisco", "United States", "Prospect"]]}
      />
    </div>
  );
}
