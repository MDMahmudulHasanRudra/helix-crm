"use client";

import { useId } from "react";
import { cn, money } from "@/lib/utils";

export function AreaChart({
  data,
  currency = "USD",
  height = 186,
  color = "var(--brand)",
  labels = true,
}: {
  data: { label: string; value: number; meta?: string }[];
  currency?: string;
  height?: number;
  color?: string;
  labels?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const width = 640;
  const padX = 14;
  const padTop = 14;
  const padBottom = labels ? 26 : 8;
  const chartHeight = height - padTop - padBottom;
  const max = Math.max(1, ...data.map((item) => item.value));
  const step = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;

  const points = data.map((item, index) => ({
    x: padX + index * step,
    y: padTop + chartHeight - (item.value / max) * chartHeight,
    ...item,
  }));

  let line = "";
  points.forEach((point, index) => {
    if (index === 0) {
      line += `M ${point.x} ${point.y}`;
      return;
    }
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    line += ` C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  });

  const area = `${line} L ${points[points.length - 1]?.x ?? padX} ${padTop + chartHeight} L ${padX} ${padTop + chartHeight} Z`;
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <line
            key={line}
            x1={padX}
            x2={width - padX}
            y1={padTop + chartHeight * line}
            y2={padTop + chartHeight * line}
            stroke="var(--border)"
            strokeDasharray="3 5"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {points.map((point) => (
          <g key={point.label} className="group">
            <circle cx={point.x} cy={point.y} r="8" fill="transparent" />
            <circle
              cx={point.x}
              cy={point.y}
              r="3.6"
              fill="var(--surface)"
              stroke={color}
              strokeWidth="2"
              className="opacity-0 transition-opacity group-hover:opacity-100"
            />
            <circle cx={point.x} cy={point.y} r="2.2" fill={color} />
            <title>{`${point.label}: ${money(point.value, currency)}`}</title>
          </g>
        ))}
        {labels
          ? points.map((point) => (
              <text
                key={`label-${point.label}`}
                x={point.x}
                y={height - 6}
                textAnchor={point.x < padX + 10 ? "start" : point.x > width - padX - 10 ? "end" : "middle"}
                fill="var(--faint)"
                fontSize="10"
              >
                {point.label}
              </text>
            ))
          : null}
      </svg>
    </div>
  );
}

export function BarChart({
  data,
  currency = "USD",
  height = 200,
  color = "var(--brand)",
}: {
  data: { label: string; value: number; secondary?: number; color?: string }[];
  currency?: string;
  height?: number;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((item) => Math.max(item.value, item.secondary ?? 0)));
  return (
    <div className="flex w-full items-end gap-2" style={{ height }}>
      {data.map((item) => (
        <div key={item.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <div className="flex w-full flex-1 items-end justify-center gap-0.5">
            {item.secondary !== undefined ? (
              <div
                className="w-1/2 rounded-t-[3px] bg-surface-3 transition-colors group-hover:bg-border-strong"
                style={{ height: `${Math.max(2, (item.secondary / max) * 100)}%` }}
                title={`${item.label} created: ${money(item.secondary, currency)}`}
              />
            ) : null}
            <div
              className="w-1/2 rounded-t-[3px] transition-opacity group-hover:opacity-80"
              style={{
                height: `${Math.max(2, (item.value / max) * 100)}%`,
                backgroundColor: item.color ?? color,
              }}
              title={`${item.label}: ${money(item.value, currency)}`}
            />
          </div>
          <span className="w-full truncate text-center text-[9.5px] text-faint">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  data,
  total,
  totalLabel,
  size = 140,
  thickness = 14,
}: {
  data: { label: string; value: number; color: string }[];
  total?: number;
  totalLabel?: string;
  size?: number;
  thickness?: number;
}) {
  const sum = total ?? data.reduce((acc, item) => acc + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Distribution chart">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={thickness}
          />
          {data.map((item) => {
            const fraction = sum > 0 ? item.value / sum : 0;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              >
                <title>{`${item.label}: ${item.value}`}</title>
              </circle>
            );
            offset += dash;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-semibold leading-none tracking-tight text-foreground">
            {totalLabel ?? sum}
          </span>
          <span className="mt-1 text-[9.5px] uppercase tracking-[0.06em] text-faint">total</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[11.5px]">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="min-w-0 flex-1 truncate text-muted">{item.label}</span>
            <span className="tabular-nums font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StageBars({
  data,
  currency = "USD",
  className,
}: {
  data: { id: string; name: string; color: string; count: number; value: number; probability?: number }[];
  currency?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className={cn("space-y-2.5", className)}>
      {data.map((stage) => (
        <div key={stage.id}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[11.5px]">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="truncate text-foreground">{stage.name}</span>
              <span className="shrink-0 text-faint">{stage.count}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-foreground">{money(stage.value, currency, { compact: true })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${(stage.value / max) * 100}%`, backgroundColor: stage.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MiniSparkline({
  values,
  color = "var(--brand)",
}: {
  values: number[];
  color?: string;
}) {
  const width = 72;
  const height = 22;
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((value, index) => `${index * step},${height - ((value - min) / range) * (height - 4) - 2}`);

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
