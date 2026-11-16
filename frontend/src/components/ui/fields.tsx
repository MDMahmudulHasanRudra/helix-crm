"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputBase =
  "w-full rounded-lg border border-border bg-surface px-3 text-[13px] text-foreground placeholder:text-faint transition-[border,box-shadow] duration-150 " +
  "hover:border-border-strong focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputBase, "h-9", className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputBase, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
});

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        inputBase,
        "h-9 cursor-pointer appearance-none bg-[length:14px] bg-[right_0.65rem_center] bg-no-repeat pr-8",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(inputBase, "h-8 pl-8 pr-3 text-[13px]")}
        {...props}
      />
    </div>
  );
}

export function Label({
  className,
  children,
  hint,
  required,
}: {
  className?: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <label className={cn("text-[12px] font-medium text-foreground", className)}>
        {children}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  error,
  children,
  className,
}: {
  label?: React.ReactNode;
  hint?: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <Label hint={hint} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
