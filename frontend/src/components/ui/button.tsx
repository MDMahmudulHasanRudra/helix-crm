"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-foreground hover:bg-brand-hover shadow-[0_1px_2px_rgba(0,0,0,.16),inset_0_1px_0_rgba(255,255,255,.12)] disabled:bg-brand/50",
  secondary:
    "bg-surface-2 text-foreground border border-border hover:bg-surface-3 hover:border-border-strong",
  outline:
    "bg-transparent text-foreground border border-border hover:bg-surface-2 hover:border-border-strong",
  ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-soft",
  subtle: "bg-brand-soft text-brand hover:bg-brand/15",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2 text-[12px] gap-1 rounded-md",
  sm: "h-8 px-2.5 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-lg",
  lg: "h-10 px-5 text-sm gap-2 rounded-lg",
  icon: "h-9 w-9 rounded-lg",
  "icon-sm": "h-7 w-7 rounded-md",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", asChild, loading, disabled, children, ...props },
  ref,
) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,border,box-shadow,opacity] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {/* Slot (asChild) needs exactly one child element, so the spinner is only rendered for real buttons. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
          ) : null}
          {children}
        </>
      )}
    </Component>
  );
});

export function IconButton({
  className,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: ButtonProps) {
  return <Button variant={variant} size={size} className={cn("text-muted", className)} {...props} />;
}
