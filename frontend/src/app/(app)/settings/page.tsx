"use client";

import { useEffect, useState } from "react";
import { Bot, Braces, Building2, GitBranch, Mail, MessageSquareQuote, Palette, Settings2, UserRound, Users, Workflow } from "lucide-react";
import { PageHeader } from "@/components/ui/layout";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { PipelineSettings } from "@/components/settings/pipeline-settings";
import { CustomFieldsSettings } from "@/components/settings/custom-fields-settings";
import { AppearanceSettings, WorkspaceSettings } from "@/components/settings/workspace-settings";
import { AutomationsSettings } from "@/components/settings/automations-settings";
import { AutonomousSettingsPanel } from "@/components/settings/autonomous-settings";
import { CannedResponsesSettings } from "@/components/settings/canned-responses-settings";
import { EmailSettings } from "@/components/settings/email-settings";

const TABS = [
  { value: "profile", label: "Profile", icon: UserRound, description: "Your details and password" },
  { value: "team", label: "Team", icon: Users, description: "Members, roles and access" },
  { value: "pipelines", label: "Pipelines", icon: GitBranch, description: "Stages and deal flow" },
  { value: "fields", label: "Custom fields", icon: Braces, description: "Workspace-specific data" },
  { value: "autonomous", label: "Autonomous", icon: Bot, description: "Self-driving revenue operations" },
  { value: "automations", label: "Automations", icon: Workflow, description: "Trigger tasks and alerts" },
  { value: "canned", label: "Canned responses", icon: MessageSquareQuote, description: "Reusable ticket replies" },
  { value: "email", label: "Email", icon: Mail, description: "Mailboxes, outbox and review" },
  { value: "workspace", label: "Workspace", icon: Building2, description: "Identity and regional defaults" },
  { value: "appearance", label: "Appearance", icon: Palette, description: "Theme and display" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function SettingsPage() {
  const { me } = useWorkspace();
  const [tab, setTab] = useState<TabValue>("profile");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab") as TabValue | null;
    if (requested && TABS.some((item) => item.value === requested)) setTab(requested);
  }, []);

  function select(next: TabValue) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  const active = TABS.find((item) => item.value === tab) ?? TABS[0];

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, team, pipelines, automations and workspace preferences."
        actions={<Badge tone="brand" dot>{me.organization.name}</Badge>}
      />

      <div className="mt-4 grid grid-cols-1 items-start gap-3 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 shadow-soft lg:flex-col lg:overflow-visible">
          {TABS.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => select(item.value)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors lg:w-full",
                  selected ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-3.5 shrink-0", selected ? "text-brand" : "text-faint")} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium">{item.label}</span>
                  <span className="hidden truncate text-[10px] text-faint lg:block">{item.description}</span>
                </span>
              </button>
            );
          })}
          <div className="mt-auto hidden border-t border-border px-2.5 py-2 lg:block">
            <div className="flex items-center gap-1.5 text-[10px] text-faint">
              <Settings2 className="size-3" /> Helix CRM v1.0
            </div>
          </div>
        </nav>

        <div className="min-w-0">
          <div className="mb-2.5 flex items-center gap-2">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">{active.label}</h2>
            <span className="text-[11px] text-faint">·</span>
            <span className="text-[11px] text-muted">{active.description}</span>
          </div>
          {tab === "profile" ? <ProfileSettings /> : null}
          {tab === "team" ? <TeamSettings /> : null}
          {tab === "pipelines" ? <PipelineSettings /> : null}
          {tab === "fields" ? <CustomFieldsSettings /> : null}
          {tab === "autonomous" ? <AutonomousSettingsPanel /> : null}
          {tab === "automations" ? <AutomationsSettings /> : null}
          {tab === "canned" ? <CannedResponsesSettings /> : null}
          {tab === "email" ? <EmailSettings /> : null}
          {tab === "workspace" ? <WorkspaceSettings /> : null}
          {tab === "appearance" ? <AppearanceSettings /> : null}
        </div>
      </div>
    </div>
  );
}
