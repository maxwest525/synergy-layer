/**
 * The "Connections" view model.
 *
 * Every other page in this system asks what the evidence says. This one asks a
 * question nothing has ever answered: for each account we connect to, does
 * anything it produces ever reach the operator?
 *
 * That question has four stages, and the interesting failure is the third one,
 * which no screen has ever shown:
 *
 *   1. Not configured. The credentials are not set.
 *   2. Configured, and nothing calls it. A key with no code behind it.
 *   3. Collecting, and reaching nobody. Rows are stored - some of them paid
 *      for - and nothing turns them into anything the operator sees.
 *   4. Reaching you. Its evidence becomes findings in the queue.
 *
 * Stage three is where most of this estate sits. Six paid DataForSEO backlink
 * endpoints run on every baseline into a file whose own header says it produces
 * no recommendations. Umami stores snapshots nothing reads. Only two modules in
 * the whole codebase write a recommendation, so every other connector, however
 * well wired, stops at stage three.
 *
 * The page exists to say that out loud, per connection, with the row counts
 * behind it. "Configured is not connected" was already the rule here; this adds
 * "collected is not delivered".
 */

/** How far a connection's evidence actually travels. */
export type ConnectionStage = "not_configured" | "configured" | "collecting" | "reaching_you";

/** Where one connection's output lands, and what turns it into a finding. */
export type ConnectionOutput = {
  /** The connector key in `connectors/catalog.ts`. */
  readonly key: string;
  readonly label: string;
  /**
   * The stored table its collection writes to, or null when nothing in this
   * repository stores anything for it.
   */
  readonly table: string | null;
  /**
   * The `recommendations.source_module` that turns its evidence into something
   * the operator sees, or null when nothing does.
   *
   * Null on all but two. That is not an omission in this file: only
   * `search-console` and `seo-validation` write a recommendation anywhere in
   * the codebase, which is why so much of this estate collects and stops.
   */
  readonly findingSource: string | null;
  /** What it would give the operator if it reached them. Plain words. */
  readonly promise: string;
};

export const CONNECTION_OUTPUTS: readonly ConnectionOutput[] = [
  {
    key: "google_search_console",
    label: "Google Search Console",
    table: "search_console_snapshots",
    findingSource: "search-console",
    promise: "What people searched, what Google showed, and which pages it has indexed.",
  },
  {
    key: "google_analytics_4",
    label: "Google Analytics 4",
    table: "ga4_snapshots",
    findingSource: null,
    promise: "What visitors did once they arrived.",
  },
  {
    key: "firecrawl",
    label: "Firecrawl",
    table: "page_metadata_observations",
    findingSource: "seo-validation",
    promise: "The live wording of every page, read as a crawler sees it.",
  },
  {
    key: "selfhosted_firecrawl",
    label: "Firecrawl, self hosted",
    table: "page_metadata_observations",
    findingSource: "seo-validation",
    promise: "The same page reads, on your own machine instead of the vendor's.",
  },
  {
    key: "dataforseo",
    label: "DataForSEO",
    table: "dataforseo_snapshots",
    findingSource: null,
    promise: "Backlinks, referring domains and anchor text, from a paid provider.",
  },
  {
    key: "pagespeed_insights",
    label: "PageSpeed Insights",
    table: "pagespeed_snapshots",
    findingSource: null,
    promise: "Google's own speed score for a page.",
  },
  {
    key: "serpapi",
    label: "SerpAPI",
    table: "serpapi_requests",
    findingSource: null,
    promise: "What the results page actually looks like for a search.",
  },
  {
    key: "umami",
    label: "Umami",
    table: "umami_snapshots",
    findingSource: null,
    promise: "Visits, without handing the data to anyone else.",
  },
  {
    key: "openseo",
    label: "OpenSEO",
    table: "openseo_tool_runs",
    findingSource: null,
    promise: "Its own audit of the site, already flagging issues.",
  },
  {
    key: "google_ads",
    label: "Google Ads",
    table: null,
    findingSource: null,
    promise: "What the paid side is spending and returning.",
  },
];

/** What one connection is, from the reads. */
export type ConnectionFacts = {
  readonly key: string;
  /** Whether the credentials it needs are present. */
  readonly configured: boolean;
  /** Rows stored in its table. Null when it has no table at all. */
  readonly storedRows: number | null;
  /** Findings its evidence has produced. Null when nothing could produce one. */
  readonly findings: number | null;
};

export type ConnectionRow = ConnectionOutput & {
  readonly stage: ConnectionStage;
  /** What is true of it right now, and what would move it on. */
  readonly reason: string;
};

export type Tile = {
  readonly label: string;
  readonly value: string | null;
  readonly explanation: string;
  readonly missingReason: string | null;
};

export type ConnectionsView = {
  readonly status: { readonly text: string; readonly tone: "positive" | "warning" | "danger" };
  readonly tiles: readonly Tile[];
  readonly rows: readonly ConnectionRow[];
  /**
   * The sentence that is the point of the page, or null when every connected
   * account reaches the operator.
   */
  readonly headline: string | null;
};

const STAGE_ORDER: Record<ConnectionStage, number> = {
  // Worst first, and "collecting and reaching nobody" is worse than "not set
  // up": the second costs nothing, the first may be costing money.
  collecting: 0,
  configured: 1,
  not_configured: 2,
  reaching_you: 3,
};

function stageOf(facts: ConnectionFacts, output: ConnectionOutput): ConnectionStage {
  if (!facts.configured) return "not_configured";
  if ((facts.findings ?? 0) > 0) return "reaching_you";
  if ((facts.storedRows ?? 0) > 0) return "collecting";
  return "configured";
}

function reasonFor(
  stage: ConnectionStage,
  facts: ConnectionFacts,
  output: ConnectionOutput,
): string {
  if (stage === "not_configured") {
    return output.table === null
      ? "No credentials, and nothing in this system reads it yet either."
      : "Its credentials are not set, so nothing has been read from it.";
  }
  if (stage === "reaching_you") {
    return `${facts.findings} findings have come from it. This one is doing its job.`;
  }
  if (stage === "collecting") {
    return output.findingSource === null
      ? `${facts.storedRows} rows stored, and nothing turns any of them into something you see. The reading is happening; the telling is not.`
      : `${facts.storedRows} rows stored, and no finding has come from them yet.`;
  }
  return output.table === null
    ? "Set up, but nothing in this system calls it. A credential with no code behind it."
    : "Set up, and nothing has been stored from it yet. Run its observation to see whether it answers.";
}

function statusFor(rows: readonly ConnectionRow[]): ConnectionsView["status"] {
  const silent = rows.filter((row) => row.stage === "collecting").length;
  if (silent > 0) {
    return {
      text:
        silent === 1
          ? "1 connection collects and tells you nothing"
          : `${silent} connections collect and tell you nothing`,
      tone: "danger",
    };
  }
  const idle = rows.filter((row) => row.stage === "configured").length;
  if (idle > 0) {
    return {
      text: idle === 1 ? "1 connection has never run" : `${idle} connections have never run`,
      tone: "warning",
    };
  }
  return { text: "Every connection you set up reaches you", tone: "positive" };
}

function headlineFor(rows: readonly ConnectionRow[]): string | null {
  const silent = rows.filter((row) => row.stage === "collecting");
  if (silent.length === 0) return null;
  const named = silent.map((row) => row.label).join(", ");
  return `${named} ${silent.length === 1 ? "is storing evidence" : "are storing evidence"} that never becomes anything you see. Only two parts of this system turn evidence into a suggestion, so everything outside them collects and stops. That is a wiring gap, not a fault in the tool.`;
}

function tilesFor(rows: readonly ConnectionRow[]): Tile[] {
  const at = (stage: ConnectionStage) => rows.filter((row) => row.stage === stage).length;
  return [
    {
      label: "Accounts set up",
      value: String(rows.length - at("not_configured")),
      explanation: "Connections whose credentials are present.",
      missingReason: null,
    },
    {
      label: "Actually collecting",
      value: String(at("collecting") + at("reaching_you")),
      explanation: "Of those, the ones that have stored at least one row.",
      missingReason: null,
    },
    {
      label: "Reaching you",
      value: String(at("reaching_you")),
      explanation: "Of those, the ones whose evidence becomes something you see.",
      missingReason: null,
    },
    {
      label: "Collecting in silence",
      value: String(at("collecting")),
      explanation: "Storing rows, some of them paid for, that reach nobody.",
      missingReason: null,
    },
  ];
}

export function buildConnections(facts: readonly ConnectionFacts[]): ConnectionsView {
  const byKey = new Map(facts.map((entry) => [entry.key, entry]));

  const rows = CONNECTION_OUTPUTS.map((output) => {
    const entry = byKey.get(output.key) ?? {
      key: output.key,
      configured: false,
      storedRows: null,
      findings: null,
    };
    const stage = stageOf(entry, output);
    return { ...output, stage, reason: reasonFor(stage, entry, output) };
  }).sort(
    (left, right) =>
      STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage] || left.label.localeCompare(right.label),
  );

  return {
    status: statusFor(rows),
    tiles: tilesFor(rows),
    rows,
    headline: headlineFor(rows),
  };
}
