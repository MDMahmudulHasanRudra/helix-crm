"use client";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">{breadcrumb}</div> : null}
        <h1 className="truncate text-[21px] font-semibold leading-tight tracking-[-0.025em] text-foreground">{title}</h1>
        {subtitle ? <div className="mt-1 text-[12.5px] text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{children}</h2>
      {action}
    </div>
  );
}

export function DataGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-x-8 gap-y-4", className)}>{children}</div>;
}

export function DetailField({
  label,
  children,
  className,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-faint">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate text-[12.5px] text-foreground",
          mono && "font-mono text-[11.5px]",
          !children && "text-faint",
        )}
      >
        {children || "—"}
      </dd>
    </div>
  );
}
