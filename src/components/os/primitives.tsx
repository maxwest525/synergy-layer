import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One spacing scale for every workspace, so pages stack the same way:
 * page > section > card > row. Values live here rather than being retyped
 * per route, which is what made the screens look staggered.
 */
export const layout = {
  page: "space-y-10",
  sectionGap: "space-y-4",
  cardGrid: "grid gap-4",
  stack: "space-y-3",
} as const;

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
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-xl",
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
    <header className="grid grid-cols-[minmax(0,1fr)] gap-4 border-b border-border/60 pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0 max-w-2xl space-y-2">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
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

/** Outer wrapper for every workspace page: one rhythm between page blocks. */
export function PageStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(layout.page, className)}>{children}</div>;
}

/**
 * A titled block inside a workspace. The heading, hint, and optional actions
 * always sit on the same baseline so sections line up down the page.
 */
export function Section({
  title,
  hint,
  actions,
  id,
  className,
  children,
}: {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn(layout.sectionGap, id ? "scroll-mt-24" : null, className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Consistent card grid: same gutter everywhere, column count per breakpoint. */
export function CardGrid({
  columns = 3,
  className,
  children,
}: {
  columns?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const columnClass =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={cn(layout.cardGrid, columnClass, className)}>{children}</div>;
}

/** Vertical list of rows with one shared rhythm. */
export function Stack({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(layout.stack, className)}>{children}</div>;
}

/** Ordered run/step history with a single connected rail. */
export function Timeline({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ol className={cn("relative ml-2 border-l border-border/60 pl-5", className)}>{children}</ol>
  );
}

export function TimelineItem({
  title,
  meta,
  tone = "neutral",
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <li className="relative py-3 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "absolute -left-[1.6rem] top-4 size-2 rounded-full bg-current first:top-1",
          toneStyles[tone],
        )}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{title}</p>
        {meta ? <span className="shrink-0 text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      {children ? <div className="mt-1 text-xs text-muted-foreground">{children}</div> : null}
    </li>
  );
}

/** Tables share one chrome: hairline dividers, aligned header, no clipping. */
export function TableShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <GlassCard className={cn("p-0", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">{children}</table>
      </div>
    </GlassCard>
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

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border border-dashed border-border/70 px-6 py-12 text-center",
        className,
      )}
    >
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * Empty messaging for a block that already sits inside a card, where a second
 * dashed box would read as a nested panel.
 */
export function EmptyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** One skeleton bar. Every placeholder in the OS is built from these. */
export function SkeletonLine({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted/60", className)} />;
}

function LoadingFrame({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/**
 * Placeholder for a card grid. It reserves the same columns, gutter, and card
 * height as the loaded grid so the page does not jump when data arrives.
 */
export function CardGridSkeleton({
  columns = 3,
  count = 3,
  label = "Loading cards",
}: {
  columns?: 2 | 3 | 4;
  count?: number;
  label?: string;
}) {
  return (
    <LoadingFrame label={label}>
      <CardGrid columns={columns}>
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border/70 bg-card/40 p-5"
          >
            <SkeletonLine className="h-3 w-24" />
            <SkeletonLine className="mt-3 h-6 w-32" />
            <SkeletonLine className="mt-3 h-3 w-full" />
            <SkeletonLine className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </CardGrid>
    </LoadingFrame>
  );
}

/** Placeholder rows that keep the table chrome and column rhythm on screen. */
export function TableSkeleton({
  columns = 4,
  rows = 5,
  label = "Loading table",
}: {
  columns?: number;
  rows?: number;
  label?: string;
}) {
  return (
    <LoadingFrame label={label}>
      <TableShell>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/50 last:border-b-0">
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <td key={columnIndex} className="px-4 py-3">
                  <SkeletonLine className={columnIndex === 0 ? "h-3 w-40" : "h-3 w-20"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableShell>
    </LoadingFrame>
  );
}

/** Placeholder for a run/step history: same rail, same row height. */
export function TimelineSkeleton({
  items = 4,
  label = "Loading history",
}: {
  items?: number;
  label?: string;
}) {
  return (
    <LoadingFrame label={label}>
      <ol className="relative ml-2 border-l border-border/60 pl-5">
        {Array.from({ length: items }).map((_, index) => (
          <li key={index} className="relative py-3 first:pt-0 last:pb-0">
            <span
              aria-hidden
              className="absolute -left-[1.6rem] top-4 size-2 animate-pulse rounded-full bg-muted/60 first:top-1"
            />
            <SkeletonLine className="h-3 w-48" />
            <SkeletonLine className="mt-2 h-3 w-32" />
          </li>
        ))}
      </ol>
    </LoadingFrame>
  );
}

/** Placeholder for a simple stacked list of rows inside a card. */
export function ListSkeleton({
  rows = 3,
  label = "Loading list",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <LoadingFrame label={label} className={layout.stack}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <SkeletonLine className="h-3 w-1/2" />
          <SkeletonLine className="h-3 w-20 shrink-0" />
        </div>
      ))}
    </LoadingFrame>
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
