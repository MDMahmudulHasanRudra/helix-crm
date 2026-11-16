"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn, initials } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
  style,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "outline";
  className?: string;
  dot?: boolean;
  style?: React.CSSProperties;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-border",
    brand: "bg-brand-soft text-brand border-brand/15",
    success: "bg-success-soft text-success border-success/15",
    warning: "bg-warning-soft text-warning border-warning/20",
    danger: "bg-danger-soft text-danger border-danger/15",
    info: "bg-info-soft text-info border-info/15",
    outline: "bg-transparent text-muted border-border-strong",
  } as const;

  return (
    <span
      style={style}
      className={cn(
        "inline-flex h-[21px] max-w-full items-center gap-1 truncate rounded-full border px-2 text-[11px] font-medium leading-none",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
  ring,
}: {
  name?: string | null;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  ring?: boolean;
}) {
  const sizes = {
    xs: "size-5 text-[9px]",
    sm: "size-6 text-[10px]",
    md: "size-8 text-[11px]",
    lg: "size-10 text-[13px]",
    xl: "size-14 text-lg",
  };
  const hues = ["bg-indigo-500", "bg-teal-600", "bg-rose-500", "bg-amber-600", "bg-sky-600", "bg-violet-600", "bg-emerald-600"];
  const hue = name ? hues[[...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % hues.length] : hues[0];

  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        sizes[size],
        ring && "ring-2 ring-surface",
        className,
      )}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name ?? ""} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className={cn("flex size-full items-center justify-center tracking-tight", hue)}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-surface shadow-soft", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-4 pb-3 pt-4", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <div className="mt-0.5 text-muted">{icon}</div> : null}
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-[12px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-6 py-10" : "px-6 py-16", className)}>
      {icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color ?? "var(--brand)" }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
  icon,
  tone = "default",
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const toneClass = {
    default: "text-foreground",
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-w-0 flex-col rounded-xl border border-border bg-surface p-3.5 text-left shadow-soft transition-colors",
        onClick ? "cursor-pointer hover:border-border-strong hover:bg-surface-2/40" : "cursor-default",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-muted">{label}</span>
        {icon ? <span className="text-faint transition-colors group-hover:text-muted">{icon}</span> : null}
      </div>
      <div className={cn("mt-1.5 truncate text-[22px] font-semibold leading-none tracking-[-0.03em]", toneClass)}>
        {value}
      </div>
      {detail ? <div className="mt-1.5 truncate text-[11px] text-muted">{detail}</div> : null}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors",
            size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[12px]",
            value === option.value
              ? "bg-surface text-foreground shadow-soft"
              : "text-muted hover:text-foreground",
            "[&_svg]:size-3.5",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] font-medium text-muted">
      {children}
    </kbd>
  );
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={{ backgroundColor: color }} />;
}
