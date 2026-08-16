import { CardGridSkeleton, ListSkeleton, SkeletonLine } from "@/components/os/primitives";
import { GlassCard } from "@/components/os/primitives";

/**
 * Shown while a workspace is still fetching. It keeps page structure on screen
 * so navigation reads as instant instead of as a frozen previous page, and it
 * reserves the same header, card grid, and list rhythm the loaded page uses.
 */
export function RoutePending() {
  return (
    <div className="space-y-10" role="status" aria-busy="true" aria-label="Loading workspace">
      <div className="space-y-3 border-b border-border/60 pb-6">
        <SkeletonLine className="h-3 w-32" />
        <SkeletonLine className="h-7 w-64" />
        <SkeletonLine className="h-3 w-full max-w-xl" />
      </div>
      <CardGridSkeleton columns={4} count={4} label="Loading workspace metrics" />
      <GlassCard className="p-5">
        <ListSkeleton rows={5} label="Loading workspace records" />
      </GlassCard>
    </div>
  );
}
