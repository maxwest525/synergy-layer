import { cn } from "@/lib/utils";
import {
  availabilityLabel,
  availabilityTone,
  AVAILABILITY_TONE_CLASS,
} from "@/lib/tool-estate-display";

type AvailabilityInput = {
  kind?: string;
  installed_state: string;
  aoos_connection_state: string;
  verification_state: string;
};

/** Plain sentence-case availability text, so a full sentence is not title cased. */
export function AvailabilityBadge({ system }: { system: AvailabilityInput }) {
  const tone = availabilityTone(system);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
        AVAILABILITY_TONE_CLASS[tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {availabilityLabel(system)}
    </span>
  );
}
