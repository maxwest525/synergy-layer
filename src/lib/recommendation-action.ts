/**
 * Single source of truth for what a recommendation's suggested action actually
 * means to an operator, and whether anything in AOOS can execute it.
 *
 * An approval control that runs nothing is a lie. Every surface reads this
 * module so the UI and the server agree on which rows may be decided.
 */

export type SuggestedActionView = {
  kind: string | null;
  /** True only when approving this row would trigger real work in AOOS. */
  executable: boolean;
  /** Plain-language description of the action. */
  summary: string;
  /**
   * Why approving is not offered, in the operator's words. Non-null exactly
   * when `executable` is false, so the surface can render the absence of a
   * button as a stated fact rather than an empty space.
   */
  unavailableReason: string | null;
  /** Optional safe navigation to the surface where the real decision lives. */
  link: { to: "/competitors"; label: string; effect: string } | null;
};

function readKind(action: unknown): string | null {
  if (typeof action !== "object" || action === null || Array.isArray(action)) return null;
  const record = action as Record<string, unknown>;
  const kind = record["kind"] ?? record["action"];
  return typeof kind === "string" ? kind : null;
}

export function isObservationOnly(metadata: unknown): boolean {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>)["observationOnly"] === true;
}

/**
 * No suggested-action kind is wired to an executable handler yet. Rather than
 * render an Approve button that changes a state column and nothing else, every
 * kind is described honestly and routed to the surface that owns the real
 * decision when one exists.
 */
export function describeSuggestedAction(action: unknown): SuggestedActionView {
  const kind = readKind(action);

  if (kind === "review_competitor_evidence") {
    return {
      kind,
      executable: false,
      summary:
        "This observation points at the competitor review queue. The real decision is made there, on the candidate itself.",
      unavailableReason:
        "There is nothing to approve here. The decision is made on the candidate itself, in the competitor queue.",
      link: {
        to: "/competitors",
        label: "Review competitor candidates",
        effect:
          "Approving a candidate there adds the domain to tracked competitors. It does not create content, run a workflow, or deploy anything.",
      },
    };
  }

  if (kind === "review_coverage_gap" || kind === "review") {
    return {
      kind,
      executable: false,
      summary:
        "This is a coverage observation drawn from stored SERP evidence. There is nothing to execute; it exists so the gap is visible and dated.",
      unavailableReason:
        "There is nothing to approve here. This is a gap we spotted, recorded and dated so it stays visible.",
      link: null,
    };
  }

  if (kind === "authorise_capability") {
    return {
      kind,
      executable: false,
      summary:
        "Authorising a capability is done in the Capability Registry against the real connection. No handler is wired to this row, so approving it here would record a decision that runs nothing.",
      unavailableReason:
        "Turning a capability on is done against the real connection, in the Capability Registry. Approving it here would record a decision that runs nothing.",
      link: null,
    };
  }

  if (kind === "index_collection") {
    return {
      kind,
      executable: false,
      summary:
        "Indexing a knowledge collection has no connected handler yet. This row is a note, not a runnable action.",
      unavailableReason:
        "Nothing is connected that could do this yet, so this row is a note rather than something you can set running.",
      link: null,
    };
  }

  return {
    kind,
    executable: false,
    summary:
      "No executable handler is connected to this suggested action. AOOS will not offer an approval that cannot do anything.",
    unavailableReason:
      "Nothing is connected that could carry this out, so there is no approval to give.",
    link: null,
  };
}
