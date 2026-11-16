"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  ListOrdered,
  Plus,
  TrendingUp,
} from "lucide-react";
import { useCalendarEvents } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { ActivityDialog } from "@/components/shared/activity-dialog";
import type { CalendarEvent } from "@/lib/types";

const EVENT_TYPES = [
  { id: "All", label: "All events" },
  { id: "Meeting", label: "Meetings", color: "#8b5cf6" },
  { id: "Call", label: "Calls", color: "#3b82f6" },
  { id: "Task", label: "Tasks", color: "#f59e0b" },
  { id: "DealClose", label: "Deal Closes", color: "#10b981" },
];

export default function CalendarPage() {
  const { me } = useWorkspace();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"month" | "agenda">("month");
  const [selectedType, setSelectedType] = useState("All");
  const [activityOpen, setActivityOpen] = useState(false);
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[] | null>(null);

  // Month boundary calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthStart = useMemo(() => new Date(year, month, 1), [year, month]);
  const monthEnd = useMemo(() => new Date(year, month + 1, 0, 23, 59, 59), [year, month]);

  const queryStart = useMemo(() => new Date(year, month - 1, 1).toISOString(), [year, month]);
  const queryEnd = useMemo(() => new Date(year, month + 2, 0).toISOString(), [year, month]);

  const { data: events, isLoading, mutate: refresh } = useCalendarEvents({
    start: queryStart,
    end: queryEnd,
    type: selectedType === "All" ? undefined : selectedType,
  });

  // Build calendar matrix
  const daysInMonth = monthEnd.getDate();
  const startDayOfWeek = monthStart.getDay(); // 0 = Sunday

  const calendarDays = useMemo(() => {
    const days: { date: Date; isCurrentMonth: boolean; key: string }[] = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      days.push({ date: d, isCurrentMonth: false, key: d.toISOString() });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      days.push({ date: d, isCurrentMonth: true, key: d.toISOString() });
    }

    // Next month padding to fill 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, key: d.toISOString() });
    }

    return days;
  }, [year, month, daysInMonth, startDayOfWeek]);

  // Group events by YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events ?? []) {
      const d = new Date(ev.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  const monthLabel = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Upcoming agenda sorted
  const agendaEvents = useMemo(() => {
    const now = new Date();
    return (events ?? [])
      .filter((e) => new Date(e.date) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  return (
    <div className="animate-in-fade space-y-4">
      <PageHeader
        title="Calendar & Agenda"
        subtitle="Schedule meetings, follow-up calls, tasks, and track upcoming deal closing milestones."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
              <button
                onClick={() => setViewMode("month")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  viewMode === "month" ? "bg-surface text-foreground shadow-xs" : "text-muted hover:text-foreground"
                }`}
              >
                <CalendarIcon className="size-3.5" /> Month
              </button>
              <button
                onClick={() => setViewMode("agenda")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  viewMode === "agenda" ? "bg-surface text-foreground shadow-xs" : "text-muted hover:text-foreground"
                }`}
              >
                <ListOrdered className="size-3.5" /> Agenda
              </button>
            </div>
            <Button variant="primary" size="sm" onClick={() => setActivityOpen(true)}>
              <Plus className="size-3.5" /> New activity
            </Button>
          </div>
        }
      />

      {/* Navigation and Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button variant="outline" size="xs" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="xs" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="size-3.5" />
          </Button>
          <span className="ml-2 text-[15px] font-semibold text-foreground">{monthLabel}</span>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedType(t.id)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                selectedType === t.id
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {t.color ? <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} /> : null}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "month" ? (
        /* Month Grid */
        <div className="rounded-lg border border-border bg-surface shadow-xs">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2/40 text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="py-2.5">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 auto-rows-[minmax(105px,auto)] divide-x divide-y divide-border">
            {calendarDays.map(({ date, isCurrentMonth, key }) => {
              const dayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              const isToday = dayStr === todayStr;
              const dayEvents = eventsByDate.get(dayStr) ?? [];

              return (
                <div
                  key={key}
                  onClick={() => setSelectedDayEvents(dayEvents.length ? dayEvents : null)}
                  className={`group relative p-2 transition-colors hover:bg-surface-2/30 ${
                    !isCurrentMonth ? "bg-surface-2/10 text-faint" : "bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full text-[12px] font-semibold ${
                        isToday
                          ? "bg-brand text-brand-foreground shadow-xs"
                          : isCurrentMonth
                          ? "text-foreground"
                          : "text-faint"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span className="text-[10px] font-medium text-muted">{dayEvents.length}</span>
                    ) : null}
                  </div>

                  {/* Event pills inside calendar cell */}
                  <div className="mt-1.5 space-y-1">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        title={`${ev.title} (${ev.type})`}
                        className="flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: ev.color }}
                      >
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 ? (
                      <div className="text-[10px] font-medium text-muted">
                        +{dayEvents.length - 3} more
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda List View */
        <div className="space-y-3">
          {agendaEvents.length > 0 ? (
            agendaEvents.map((ev) => (
              <Card key={ev.id} className="p-4 transition-all hover:border-brand/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-soft"
                      style={{ backgroundColor: ev.color }}
                    >
                      {ev.type === "Meeting" ? (
                        <CalendarIcon className="size-4" />
                      ) : ev.type === "DealClose" ? (
                        <TrendingUp className="size-4" />
                      ) : (
                        <Clock className="size-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-foreground">{ev.title}</span>
                        <Badge tone={ev.status === "Completed" ? "success" : "neutral"}>
                          {ev.status}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
                        <span>{formatDateTime(ev.date)}</span>
                        {ev.relatedName ? (
                          <Link
                            href={`/${ev.relatedType.toLowerCase()}s/${ev.relatedId}`}
                            className="font-medium text-brand hover:underline"
                          >
                            {ev.relatedType}: {ev.relatedName}
                          </Link>
                        ) : null}
                        {ev.ownerName ? <span>Owner: {ev.ownerName}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ev.relatedId ? (
                      <Button variant="outline" size="xs" asChild>
                        <Link href={`/${ev.relatedType.toLowerCase()}s/${ev.relatedId}`}>
                          View record
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="py-12 text-center">
              <CalendarIcon className="mx-auto size-8 text-faint" />
              <div className="mt-2 text-[14px] font-medium text-foreground">No upcoming events scheduled</div>
              <p className="mt-1 text-[12px] text-muted">Click &ldquo;+ New activity&rdquo; to schedule meetings, tasks, or calls.</p>
            </Card>
          )}
        </div>
      )}

      {/* Selected day events modal/drawer if clicked */}
      {selectedDayEvents ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setSelectedDayEvents(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-[15px] font-semibold text-foreground">
                Events for {formatDate(selectedDayEvents[0]?.date, "long")}
              </h3>
              <Button variant="ghost" size="xs" onClick={() => setSelectedDayEvents(null)}>
                Close
              </Button>
            </div>
            <div className="mt-3 max-h-96 space-y-2.5 overflow-y-auto">
              {selectedDayEvents.map((ev) => (
                <div key={ev.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{ev.title}</span>
                    <Badge tone={ev.status === "Completed" ? "success" : "neutral"}>{ev.status}</Badge>
                  </div>
                  <div className="mt-1 text-[11.5px] text-muted">
                    Time: {formatDateTime(ev.date)} · Type: {ev.type}
                  </div>
                  {ev.relatedName ? (
                    <div className="mt-1.5">
                      <Link
                        href={`/${ev.relatedType.toLowerCase()}s/${ev.relatedId}`}
                        className="text-[12px] font-medium text-brand hover:underline"
                      >
                        {ev.relatedType}: {ev.relatedName}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

