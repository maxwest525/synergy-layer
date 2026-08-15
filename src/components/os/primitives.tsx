import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-xl",
        "shadow-[0_1px_0_0_hsl(var(--border))] transition-colors duration-300",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-3/4 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl space-y-2">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

const toneStyles: Record<string, string> = {
  neutral: "text-muted-foreground",
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  primary: "text-primary",
};

export type Tone = keyof typeof toneStyles;

export function StatePill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium capitalize",
        toneStyles[tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label.replace(/_/g, " ")}
    </span>
  );
}

export function toneForState(state: string | null | undefined): Tone {
  switch (state) {
    case "healthy":
    case "succeeded":
    case "active":
    case "real":
    case "approved":
    case "verified":
    case "applied":
      return "positive";
    case "degraded":
    case "awaiting_approval":
    case "pending":
    case "under_review":
    case "proposed":
    case "paused":
    case "simulated":
      return "warning";
    case "failing":
    case "failed":
    case "error":
    case "rejected":
    case "rolled_back":
      return "danger";
    case "running":
    case "scheduled":
      return "primary";
    default:
      return "neutral";
  }
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-border/70 px-6 py-12 text-center"
    >
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <GlassCard className="p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </GlassCard>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border/50 py-3 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value ?? "Not set"}</dd>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "Never";
  // Manual UTC formatting: Intl output differs between the server and browser ICU builds.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const hours24 = date.getUTCHours();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${String(hours).padStart(2, "0")}:${minutes} ${suffix}`;
}
