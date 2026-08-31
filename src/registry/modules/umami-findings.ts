import type { ModuleDefinition } from "../types";

/**
 * The Umami rule engine. Separate from `self-hosted-analytics.ts` (which
 * declares `cap.umami`, the read-only collector) because this module's rules
 * run inline at the end of `observeUmami`, the same way
 * `evaluatePageSpeedReadings` runs at the end of the PageSpeed capability's
 * own read rather than as a second workflow-graph node — a failure here must
 * never fail the observation itself, and it does not.
 *
 * `cap.umami` had been `real` since 2026-08-18 with `umami_snapshots` rows
 * stored and nothing reading them, so the `visitors` category had no Umami
 * finding. This closes that.
 */
export const definition: ModuleDefinition = {
  module: "umami-findings",
  capabilities: [
    {
      key: "umami.rules",
      name: "Umami Rule Engine",
      kind: "internal_module",
      category: "Analysis",
      description:
        "Evaluates stored Umami snapshots and files evidence-backed observations for the visitors category. Zero rows is a valid no-change outcome. Never asserts SEO or ranking causation: a traffic drop is a traffic drop.",
      integrationState: "real",
      operations: [
        {
          name: "rules.evaluate",
          description:
            "Score stored umami_snapshots rows (metric='stats' and metric='referrers') against confidence.ts, never a hand-picked threshold.",
        },
      ],
      config: { mutating: false, rulesEvaluated: 3 },
    },
  ],
};
