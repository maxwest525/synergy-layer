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
 *   2. Configured, and nothing calls it. A key with no code behind it, or an
 *      account that has never stored a successful row.
 *   3. Collecting, and reaching nobody. Rows are stored - some of them paid
 *      for - and nothing turns them into anything the operator sees.
 *   4. Reaching you. Its evidence becomes findings in the queue.
 *
 * Stage three is where most of this estate sits. Six paid DataForSEO backlink
 * endpoints run on every baseline into a file whose own header says it produces
 * no recommendations. Umami stores snapshots that the measurement panel
 * displays (`umami-panel.tsx` via `getUmamiState`) but no rule module reads.
 * Four modules in the whole codebase write a recommendation, so every connector
 * outside their reach, however well wired, stops at stage three.
 *
 * The page exists to say that out loud, per connection, with the row counts
 * behind it. "Configured is not connected" was already the rule here; this adds
 * "collected is not delivered".
 *
 * Two rules keep the claims honest, both of them learned from getting this
 * wrong:
 *
 * - A row recording a failed attempt is not collection. Three of these tables
 *   store the failures alongside the successes, so a dead key would otherwise
 *   render as "the reading is happening" fifty times over.
 * - A connection is credited with a finding only through the modules that
 *   actually read its table, and when a module reads several connections none
 *   of them may claim its findings alone.
 */

/**
 * How to tell a stored success from a stored failure.
 *
 * Null for a table that only ever stores successes.
 */
export type SuccessFilter =
  | { readonly column: string; readonly kind: "is-null" }
  | { readonly column: string; readonly kind: "equals"; readonly value: string };

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
   * How a stored failure is marked in that table, or null when the table
   * stores only successes.
   */
  readonly succeeded: SuccessFilter | null;
  /**
   * Which rows in a shared table belong to this connection, or null when it
   * owns the table outright.
   *
   * `page_metadata_observations` is written by three renderers now: the cloud
   * Firecrawl, the self-hosted one, and Crawl4AI. Counting the whole table for
   * each of them would credit every connection with the others' work, which is
   * precisely what the old `table: null` was avoiding. `rendered_by` records
   * which renderer read each page and its name is the first token, so a prefix
   * match claims exactly the right rows.
   */
  readonly scope?: {
    readonly column: string;
    readonly prefix: string;
    /** Excluded prefix, for a name that is also the start of another's. */
    readonly notPrefix?: string;
  } | null;
  /**
   * The `recommendations.source_module` values whose rules actually read this
   * connection's table.
   *
   * Empty on most of them. That is not an omission in this file: only
   * `search-console`, `seo-validation`, `ga4` and `dataforseo` write a
   * recommendation anywhere in the codebase, which is why so much of this
   * estate collects and stops. `connections.registry.test.ts` scans the server
   * modules and fails if a fifth writer appears without being recorded here.
   *
   * More than one connection may feed the same module, and a connection that
   * shares a module never claims its findings alone.
   */
  readonly findingSources: readonly string[];
  /** What it would give the operator if it reached them. Plain words. */
  readonly promise: string;
};

export const CONNECTION_OUTPUTS: readonly ConnectionOutput[] = [
  {
    key: "google_search_console",
    label: "Google Search Console",
    table: "search_console_snapshots",
    succeeded: null,
    // Both rule modules read the snapshot tables: `search-console` for the
    // window rules, `seo-validation` for the wording and competitor checks.
    findingSources: ["search-console", "seo-validation"],
    promise: "What people searched, what Google showed, and which pages it has indexed.",
  },
  {
    key: "google_analytics_4",
    label: "Google Analytics 4",
    table: "ga4_snapshots",
    succeeded: null,
    findingSources: ["ga4"],
    promise: "What visitors did once they arrived.",
  },
  {
    key: "firecrawl",
    label: "Firecrawl",
    table: "page_metadata_observations",
    // A page that could not be read is stored with the error on it. Those rows
    // are attempts, not evidence.
    succeeded: { column: "error", kind: "is-null" },
    // The vendor's deployment only. "Firecrawl (self-hosted)" starts with the
    // same word, so it is excluded rather than counted here.
    scope: {
      column: "rendered_by",
      prefix: "Firecrawl",
      notPrefix: "Firecrawl (self-hosted)",
    },
    // Its page reads are consumed by the Search Console rules, not by
    // `seo-validation`, which never opens this table.
    findingSources: ["search-console"],
    promise: "The live wording of every page, read as a crawler sees it.",
  },
  {
    key: "selfhosted_firecrawl",
    label: "Firecrawl, self hosted",
    // This was deliberately null while the page audit hardcoded the vendor's
    // endpoint: no row could have come from a self-hosted deployment, and
    // pointing it at the table would have credited it with another connector's
    // work. `firecrawlEndpoint()` now prefers the self-hosted deployment, and
    // `rendered_by` says which one read each page, so it can claim its own rows
    // and only its own.
    table: "page_metadata_observations",
    succeeded: { column: "error", kind: "is-null" },
    scope: { column: "rendered_by", prefix: "Firecrawl (self-hosted)" },
    findingSources: ["search-console"],
    promise: "The same page reads, on your own machine instead of the vendor's.",
  },
  {
    key: "vps_scraper",
    label: "Crawl4AI",
    // Absent from this registry entirely until now, so the page audit's
    // preferred renderer did not appear on the connections screen at all.
    table: "page_metadata_observations",
    succeeded: { column: "error", kind: "is-null" },
    scope: { column: "rendered_by", prefix: "Crawl4AI" },
    findingSources: ["search-console"],
    promise: "Every page read on your own box, at no cost per page.",
  },
  {
    key: "dataforseo",
    label: "DataForSEO",
    table: "dataforseo_snapshots",
    succeeded: null,
    // The targeting pass (dataforseo/targeting-rules.server.ts) reads the
    // stored SERP snapshots and the approved keyword set and files findings
    // from them. Until it existed this row was the clearest case of stage
    // three: paid rows stored, nothing turning them into anything.
    // `site-audit` (onpage-rules.server.ts) reads the same table's OnPage
    // crawl snapshots and files the site-audit findings. `backlink-findings`
    // (backlink-rules.server.ts) reads three more Backlinks snapshot kinds
    // from this same table (backlinks_domain_pages, backlinks_backlinks,
    // backlinks_summary, backlinks_referring_domains) that the targeting pass
    // does not touch.
    findingSources: ["dataforseo", "site-audit", "backlink-findings"],
    promise: "Backlinks, referring domains and anchor text, from a paid provider.",
  },
  {
    key: "pagespeed_insights",
    label: "PageSpeed Insights",
    table: "pagespeed_snapshots",
    succeeded: null,
    findingSources: ["pagespeed"],
    promise: "Google's own speed score for a page.",
  },
  {
    key: "serpapi",
    label: "SerpAPI",
    table: "serpapi_requests",
    // A row is written before the provider is called and settled afterwards, so
    // an unsettled or failed attempt sits in this table looking like a result.
    succeeded: { column: "state", kind: "equals", value: "succeeded" },
    findingSources: [],
    promise: "What the results page actually looks like for a search.",
  },
  {
    key: "umami",
    label: "Umami",
    table: "umami_snapshots",
    succeeded: null,
    // umami-rules.server.ts reads umami_snapshots (metric='stats' and
    // metric='referrers') and files findings for the visitors category.
    findingSources: ["umami"],
    promise: "Visits, without handing the data to anyone else.",
  },
  {
    key: "openseo",
    label: "OpenSEO",
    table: "openseo_tool_runs",
    succeeded: { column: "status", kind: "equals", value: "succeeded" },
    findingSources: [],
    promise: "Its own audit of the site, already flagging issues.",
  },
  {
    key: "google_ads",
    label: "Google Ads",
    table: null,
    succeeded: null,
    findingSources: [],
    promise: "What the paid side is spending and returning.",
  },
];

/** Every module that can turn a connection's evidence into a finding. */
export const FINDING_SOURCES: readonly string[] = [
  ...new Set(CONNECTION_OUTPUTS.flatMap((output) => output.findingSources)),
].sort();

/** What one connection is, from the reads. */
export type ConnectionFacts = {
  readonly key: string;
  /** Whether the credentials it needs are present. */
  readonly configured: boolean;
  /** Rows recording a success. Null when it has no table at all. */
  readonly storedRows: number | null;
  /**
   * Rows recording a failed attempt. Null when the table has no way to mark
   * one, which is not the same as zero failures.
   */
  readonly failedRows: number | null;
  /**
   * Findings produced by the modules that read its table. Null when no module
   * reads it.
   *
   * Every state counts, including rejected: a suggestion the operator turned
   * down still reached them, which is the only question this page asks.
   */
  readonly findings: number | null;
};

export type ConnectionRow = ConnectionOutput & {
  readonly stage: ConnectionStage;
  /** What is true of it right now, and what would move it on. */
  readonly reason: string;
};

export type Tile = {
  readonly label: string;
  readonly value: string;
  readonly explanation: string;
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
  // Nowhere to write, or nothing successfully written. Either way it has not
  // collected anything, so it cannot be reaching anyone - however many findings
  // the modules it feeds have produced from some other connection's rows.
  if (output.table === null) return "configured";
  if ((facts.storedRows ?? 0) === 0) return "configured";
  if ((facts.findings ?? 0) > 0) return "reaching_you";
  return "collecting";
}

/** "Google Search Console and Firecrawl", "A, B and C". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The failures, mentioned only when there are some. */
function failureNote(facts: ConnectionFacts): string {
  const failed = facts.failedRows ?? 0;
  if (failed === 0) return "";
  return failed === 1
    ? " One other attempt failed."
    : ` ${failed} other attempts failed and stored nothing.`;
}

function reasonFor(
  stage: ConnectionStage,
  facts: ConnectionFacts,
  output: ConnectionOutput,
  /** The other connections whose evidence feeds the same modules. */
  sharesWith: readonly string[],
): string {
  if (stage === "not_configured") {
    return output.table === null
      ? "No credentials, and nothing in this system reads it yet either."
      : "Its credentials are not set, so nothing has been read from it.";
  }

  if (stage === "reaching_you") {
    return sharesWith.length > 0
      ? `It feeds checks that have produced ${facts.findings} findings, alongside ${listOf(sharesWith)}.${failureNote(facts)}`
      : `${facts.findings} findings have come from it. This one is doing its job.${failureNote(facts)}`;
  }

  if (stage === "collecting") {
    return output.findingSources.length === 0
      ? `${facts.storedRows} rows stored, and nothing turns any of them into something you see. The reading is happening; the telling is not.${failureNote(facts)}`
      : `${facts.storedRows} rows stored, and no finding has come from them yet.${failureNote(facts)}`;
  }

  // Configured, and nothing stored.
  if (output.table === null) {
    return "Set up, but nothing in this system calls it. A credential with no code behind it.";
  }
  const failed = facts.failedRows ?? 0;
  if (failed > 0) {
    return failed === 1
      ? "Nothing has been stored, and its one attempt failed. The credentials are present but the call is not succeeding."
      : `Nothing has been stored, and ${failed} attempts failed. The credentials are present but the calls are not succeeding.`;
  }
  return "Set up, and nothing has been stored from it yet. Run its observation to see whether it answers.";
}

/**
 * The pill above the page, which must never reassure over a body that does not
 * agree with it.
 *
 * The first draft went green whenever the queue of problems was empty, which on
 * a fresh install meant a green "every connection reaches you" sitting on top of
 * four zeroes and eleven rows reading "not set up". It was vacuously true - all
 * zero of them did reach you - and it read as an all-clear.
 *
 * So green now requires the only state that earns it: every connection in the
 * registry reaching the operator. Anything short of that says how far short.
 */
function statusFor(rows: readonly ConnectionRow[]): ConnectionsView["status"] {
  const at = (stage: ConnectionStage) => rows.filter((row) => row.stage === stage).length;
  const silent = at("collecting");
  if (silent > 0) {
    return {
      text:
        silent === 1
          ? "1 connection collects and tells you nothing"
          : `${silent} connections collect and tell you nothing`,
      tone: "danger",
    };
  }
  const idle = at("configured");
  if (idle > 0) {
    return {
      text: idle === 1 ? "1 connection has never run" : `${idle} connections have never run`,
      tone: "warning",
    };
  }
  const reaching = at("reaching_you");
  if (reaching === 0) {
    return { text: "No account is set up yet", tone: "warning" };
  }
  // Green, but never as a bare all-clear: it always says how many of how many,
  // so it cannot be read as "the estate is wired" when eight of eleven are dark.
  //
  // "Every connection reaches you" is deliberately not a state. Google Ads has
  // no table by design - a credential with no code behind it cannot collect -
  // so a rule requiring all eleven would be a branch that never runs.
  return { text: `${reaching} of ${rows.length} connections reach you`, tone: "positive" };
}

/** "two", "three" - the count is part of a sentence, not a statistic. */
const WORD_FOR = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function headlineFor(rows: readonly ConnectionRow[]): string | null {
  const silent = rows.filter((row) => row.stage === "collecting");
  if (silent.length === 0) return null;
  const named = silent.map((row) => row.label).join(", ");
  // Counted from the registry rather than written down, because the number was
  // wrong the first time this sentence was written.
  const count = FINDING_SOURCES.length;
  const parts = `${WORD_FOR[count] ?? count} parts`;
  return `${named} ${silent.length === 1 ? "is storing evidence" : "are storing evidence"} that never becomes anything you see. Only ${parts} of this system turn evidence into a suggestion, so everything outside them collects and stops. That is a wiring gap, not a fault in the tool.`;
}

function tilesFor(rows: readonly ConnectionRow[]): Tile[] {
  const at = (stage: ConnectionStage) => rows.filter((row) => row.stage === stage).length;
  return [
    {
      label: "Accounts set up",
      value: String(rows.length - at("not_configured")),
      explanation: "Connections whose credentials are present.",
    },
    {
      label: "Actually collecting",
      value: String(at("collecting") + at("reaching_you")),
      explanation: "Of those, the ones that have stored at least one successful row.",
    },
    {
      label: "Reaching you",
      value: String(at("reaching_you")),
      explanation: "Of those, the ones whose evidence becomes something you see.",
    },
    {
      label: "Collecting in silence",
      value: String(at("collecting")),
      explanation: "Storing rows, some of them paid for, that reach nobody.",
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
      failedRows: null,
      findings: null,
    };
    const stage = stageOf(entry, output);
    // Every other connection whose table feeds one of the same modules. When
    // this is non-empty the findings are not this connection's to claim.
    const sharesWith = CONNECTION_OUTPUTS.filter(
      (other) =>
        other.key !== output.key &&
        other.findingSources.some((source) => output.findingSources.includes(source)),
    ).map((other) => other.label);
    return { ...output, stage, reason: reasonFor(stage, entry, output, sharesWith) };
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
