"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  size = "md",
  showClose = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showClose?: boolean;
}) {
  const sizes = {
    sm: "max-w-[420px]",
    md: "max-w-[560px]",
    lg: "max-w-[720px]",
    xl: "max-w-[920px]",
    full: "max-w-[calc(100vw-2rem)]",
  };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in-fade" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-2xl border border-border bg-elevated shadow-pop outline-none",
          "data-[state=open]:animate-in-up",
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className="absolute right-3.5 top-3.5 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  title,
  description,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-5 py-4 pr-14", className)}>
      <DialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-1 text-[12px] leading-relaxed text-muted">
          {description}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  );
}

export function DialogBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("max-h-[calc(90vh-9rem)] overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 border-t border-border bg-surface-2/40 px-5 py-3", className)}>
      {children}
    </div>
  );
}
