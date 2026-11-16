"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Cable, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import type { Me } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("avery@helixcrm.dev");
  const [password, setPassword] = useState("Admin@123");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api<Me>("/auth/login", {
        method: "POST",
        body: { email, password },
        redirectOnUnauthorized: false,
      });
      router.push(next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
      setLoading(false);
    }
  }

  function fillDemo(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  }

  useEffect(() => {
    document.title = "Sign in · Helix CRM";
  }, []);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#12122a] p-10 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(124,124,240,.55), transparent 45%), radial-gradient(circle at 80% 70%, rgba(16,185,129,.25), transparent 40%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[9px] bg-white/10 ring-1 ring-white/15">
            <Cable className="size-[17px]" strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[14px] font-semibold tracking-tight">Helix CRM</div>
            <div className="text-[10px] text-white/45">Revenue, support & success in one place</div>
          </div>
        </div>

        <div className="relative my-auto max-w-[460px] py-16">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
            <Sparkles className="size-3 text-emerald-300" />
            The customer workspace for modern teams
          </div>
          <h1 className="text-[38px] font-semibold leading-[1.08] tracking-[-0.035em]">
            Every relationship,
            <br />
            from first touch to renewal.
          </h1>
          <p className="mt-4 max-w-[390px] text-[13.5px] leading-relaxed text-white/55">
            Helix unifies pipeline, conversations, tasks and billing context so your team can
            stop switching tabs and start closing.
          </p>

          <div className="mt-8 grid max-w-[420px] grid-cols-3 gap-2.5">
            {[
              { value: "$2.1M", label: "Open pipeline" },
              { value: "75%", label: "Win rate" },
              { value: "12", label: "Active accounts" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur">
                <div className="text-[17px] font-semibold tracking-tight">{stat.value}</div>
                <div className="mt-0.5 text-[10.5px] text-white/45">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 max-w-[420px] rounded-xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur">
            <p className="text-[12.5px] leading-relaxed text-white/70">
              “We replaced three tools with Helix. Forecast calls take ten minutes now, and no
              customer email goes unanswered.”
            </p>
            <div className="mt-3 flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-[10px] font-semibold">
                AM
              </span>
              <div>
                <div className="text-[11.5px] font-medium">Avery Morgan</div>
                <div className="text-[10px] text-white/40">VP Revenue, Northstar Labs</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-4 text-[10px] text-white/35">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3" /> SOC 2 ready
          </span>
          <span>Multi-tenant by design</span>
          <span>Audit trail included</span>
        </div>
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[366px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-[9px] bg-brand text-brand-foreground">
              <Cable className="size-[17px]" strokeWidth={2.2} />
            </span>
            <span className="text-[14px] font-semibold">Helix CRM</span>
          </div>

          <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-foreground">Welcome back</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            Sign in to the Northstar Labs workspace.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {error ? (
              <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
                {error}
              </div>
            ) : null}

            <Field label="Work email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="h-10 pl-9"
                />
              </div>
            </Field>

            <Field label="Password" hint="Forgot? Ask your admin">
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </Field>

            <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={loading}>
              Sign in
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Demo accounts</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-3 space-y-1.5">
              <button
                type="button"
                onClick={() => fillDemo("avery@helixcrm.dev", "Admin@123")}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span>
                  <span className="block text-[12px] font-medium text-foreground">Avery Morgan · Admin</span>
                  <span className="block text-[10.5px] text-muted">Full access, billing & settings</span>
                </span>
                <ArrowRight className="size-3.5 text-faint" />
              </button>
              <button
                type="button"
                onClick={() => fillDemo("jordan@helixcrm.dev", "Demo@123")}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span>
                  <span className="block text-[12px] font-medium text-foreground">Jordan Lee · Manager</span>
                  <span className="block text-[10.5px] text-muted">Pipeline, team & forecasts</span>
                </span>
                <ArrowRight className="size-3.5 text-faint" />
              </button>
              <button
                type="button"
                onClick={() => fillDemo("sofia@helixcrm.dev", "Demo@123")}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span>
                  <span className="block text-[12px] font-medium text-foreground">Sofia Ramirez · Rep</span>
                  <span className="block text-[10.5px] text-muted">Deals, tasks & conversations</span>
                </span>
                <ArrowRight className="size-3.5 text-faint" />
              </button>
            </div>
            <p className="mt-3 text-center text-[10.5px] text-faint">
              Demo password is filled automatically. Data resets with the container.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}
