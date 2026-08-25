import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../os.server", () => ({ fileInboxItem: vi.fn(), logActivity: vi.fn() }));

import {
  buildCrawlTask,
  collectDuplicateContent,
  collectReadyCrawls,
  crawlReads,
  forceStopCrawl,
  MAX_CRAWL_PAGES,
  normalizeTarget,
  parseCrawlSummary,
  parseResultItems,
  RESULT_ROW_LIMIT,
  startCrawl,
} from "./onpage.server";
import { fingerprint } from "./transport.server";

type Row = Record<string, unknown>;

const TENANT = "tenant-1";
const TARGET = "https://www.trumoveinc.com/services";
const HOST = "trumoveinc.com";
const CRAWL_ID = "07251200-1535-0216-0000-a1b2c3d4e5f6";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function selector(rows: Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const matched = () => rows.filter((row) => filters.every((test) => test(row)));
  const builder = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: matched(), error: null }).then(resolve),
  };
  return builder;
}

/** The minimum Supabase surface the transport, budget guard and snapshot writer touch. */
function fakeClient(seed: Row[] = []) {
  const tables: Record<string, Row[]> = {
    dataforseo_budgets: [],
    dataforseo_requests: [],
    dataforseo_snapshots: [...seed],
  };
  const defaults: Record<string, Row> = { dataforseo_budgets: { spent_usd: 0, alerts_fired: [] } };

  const client = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      return {
        select: () => selector(rows),
        insert(row: Row) {
          const stored = { id: `${table}-${rows.length + 1}`, ...defaults[table], ...row };
          rows.push(stored);
          return {
            select: () => ({ single: () => Promise.resolve({ data: stored, error: null }) }),
            then: (resolve: (value: { error: null }) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
          };
        },
        update: (patch: Row) => ({
          eq(column: string, value: unknown) {
            for (const row of rows) if (row[column] === value) Object.assign(row, patch);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };

  return { client: client as never, tables };
}

function envelope(tasks: Row[], cost = 0): Response {
  return Response.json({
    version: "0.1.20260101",
    status_code: 20000,
    status_message: "Ok.",
    time: "0.1 sec.",
    cost,
    tasks_count: tasks.length,
    tasks_error: 0,
    tasks,
  });
}

// Stated assumption: the OnPage result shape below is read from the provider
// docs, not yet verified against a live crawl -- diff the first real snapshot
// against these fixtures and update both together before trusting the numbers.
const taskCreated = () =>
  envelope([
    { id: CRAWL_ID, status_code: 20100, status_message: "Task Created.", cost: 0, result: null },
  ]);

const itemsResult = (items: Row[]) =>
  envelope([
    {
      id: CRAWL_ID,
      status_code: 20000,
      status_message: "Ok.",
      cost: 0,
      result: [{ crawl_progress: "finished", total_items_count: items.length, items }],
    },
  ]);

const summaryResult = (crawlProgress = "finished") =>
  envelope([
    {
      id: CRAWL_ID,
      status_code: 20000,
      status_message: "Ok.",
      cost: 0,
      result: [
        {
          crawl_progress: crawlProgress,
          crawl_status: { max_crawl_pages: 100, pages_in_queue: 0, pages_crawled: 12 },
          domain_info: { name: HOST, ssl_info: { valid_certificate: true } },
          page_metrics: { onpage_score: 91.2, broken_links: 3, duplicate_title: 2 },
        },
      ],
    },
  ]);

let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

function calls(): { path: string; init: RequestInit | undefined }[] {
  return fetcher.mock.calls.map((call) => ({
    path: String(call[0]).replace("https://api.dataforseo.com/v3", ""),
    init: call[1] as RequestInit | undefined,
  }));
}

function postedBody(index: number): Row[] {
  return JSON.parse(String(calls()[index]?.init?.body)) as Row[];
}

beforeEach(() => {
  vi.stubEnv("DATAFORSEO_BASIC_TOKEN", "dGVzdDp0ZXN0");
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the crawl task actually posted", () => {
  it("posts one task to on_page/task_post with Basic auth", async () => {
    fetcher.mockResolvedValue(taskCreated());
    const { client } = fakeClient();

    const handle = await startCrawl(client, TENANT, TARGET);

    expect(calls()[0]?.path).toBe("/on_page/task_post");
    expect(calls()[0]?.init?.method).toBe("POST");
    expect(calls()[0]?.init?.headers).toMatchObject({ Authorization: "Basic dGVzdDp0ZXN0" });
    expect(postedBody(0)).toHaveLength(1);
    expect(handle.providerTaskId).toBe(CRAWL_ID);
    expect(handle.created).toBe(true);
  });

  it("caps the crawl at MAX_CRAWL_PAGES instead of letting it walk the whole site", async () => {
    fetcher.mockResolvedValue(taskCreated());
    const { client } = fakeClient();

    await startCrawl(client, TENANT, TARGET);

    expect(postedBody(0)[0]?.["max_crawl_pages"]).toBe(MAX_CRAWL_PAGES);
  });

  it("sends nothing but target, cap and tag, so no priced multiplier can be on", async () => {
    fetcher.mockResolvedValue(taskCreated());
    const { client } = fakeClient();

    await startCrawl(client, TENANT, TARGET);

    expect(Object.keys(postedBody(0)[0] ?? {}).sort()).toEqual([
      "max_crawl_pages",
      "tag",
      "target",
    ]);
  });

  it("names each priced toggle and proves the payload carries none of them", async () => {
    fetcher.mockResolvedValue(taskCreated());
    const { client } = fakeClient();

    await startCrawl(client, TENANT, TARGET);

    const sent = Object.keys(postedBody(0)[0] ?? {});
    // Lighthouse x34, load JS x10, load resources x3, keyword density x2.
    for (const priced of [
      "enable_lighthouse",
      "enable_javascript",
      "enable_browser_rendering",
      "load_resources",
      "calculate_keyword_density",
      "include_clickstream_data",
    ]) {
      expect(sent).not.toContain(priced);
    }
  });

  it("sends the bare host, because the provider rejects a scheme or a path", async () => {
    fetcher.mockResolvedValue(taskCreated());
    const { client } = fakeClient();

    await startCrawl(client, TENANT, TARGET);

    expect(postedBody(0)[0]?.["target"]).toBe(HOST);
  });

  it("carries the fingerprint as the tag so the crawl can be matched back", async () => {
    fetcher.mockResolvedValue(taskCreated());
    const { client } = fakeClient();

    await startCrawl(client, TENANT, TARGET);

    expect(postedBody(0)[0]?.["tag"]).toBe(
      fingerprint("/on_page/task_post", { target: HOST }, today()),
    );
  });

  it("buys nothing when the same target was already crawled today", async () => {
    const fp = fingerprint("/on_page/task_post", { target: HOST }, today());
    const { client } = fakeClient([
      { id: "snap-1", tenant_id: TENANT, request_fingerprint: fp, provider_task_id: CRAWL_ID },
    ]);

    const handle = await startCrawl(client, TENANT, TARGET);

    expect(fetcher).not.toHaveBeenCalled();
    expect(handle).toEqual({
      snapshotId: "snap-1",
      providerTaskId: CRAWL_ID,
      created: false,
      costUsd: 0,
    });
  });

  it("refuses the crawl before any request once the monthly ceiling is reached", async () => {
    const { client, tables } = fakeClient();
    tables["dataforseo_budgets"]?.push({
      id: "budget-1",
      tenant_id: TENANT,
      period_month: `${today().slice(0, 7)}-01`,
      ceiling_usd: 300,
      spent_usd: 300,
      hard_stop: true,
      alerts_fired: [],
    });

    await expect(startCrawl(client, TENANT, TARGET)).rejects.toThrow(/monthly ceiling reached/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("builds the same body the poster sends", () => {
    expect(buildCrawlTask(TARGET, "tag-1")).toEqual({
      target: HOST,
      max_crawl_pages: MAX_CRAWL_PAGES,
      tag: "tag-1",
    });
  });

  it("strips scheme, www and path from a target", () => {
    expect(normalizeTarget("https://WWW.TruMoveInc.com/a/b?x=1")).toBe("trumoveinc.com");
    expect(normalizeTarget("trumoveinc.com")).toBe("trumoveinc.com");
  });
});

describe("the read subset a page audit asks for", () => {
  it("reads only the cheap endpoints and never lighthouse, waterfall or keyword density", () => {
    const endpoints = crawlReads(CRAWL_ID).map((read) => read.endpoint);
    expect([...new Set(endpoints)]).toEqual([
      "/on_page/pages",
      "/on_page/duplicate_tags",
      "/on_page/redirect_chains",
      "/on_page/non_indexable",
    ]);
  });

  it("keys every read by the crawl id and caps the rows it asks for", () => {
    for (const read of crawlReads(CRAWL_ID)) {
      expect(read.params["id"]).toBe(CRAWL_ID);
      expect(read.params["limit"]).toBe(RESULT_ROW_LIMIT);
    }
  });
});

describe("collecting a crawl the provider reports ready", () => {
  function seedPostedCrawl(extra: Row[] = []) {
    return fakeClient([
      {
        id: "snap-task",
        tenant_id: TENANT,
        kind: "onpage_task",
        target: HOST,
        provider_task_id: CRAWL_ID,
        request_fingerprint: "posted-fp",
      },
      ...extra,
    ]);
  }

  function routeReadyCrawl(crawlProgress = "finished"): void {
    fetcher.mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/on_page/tasks_ready")) {
        return Promise.resolve(
          envelope([
            {
              id: "ready-1",
              status_code: 20000,
              status_message: "Ok.",
              result: [{ id: CRAWL_ID }],
            },
          ]),
        );
      }
      if (url.includes("/on_page/summary/")) return Promise.resolve(summaryResult(crawlProgress));
      return Promise.resolve(itemsResult([{ url: `https://${HOST}/a`, status_code: 301 }]));
    });
  }

  it("polls tasks_ready, reads the summary, then every detail endpoint", async () => {
    routeReadyCrawl();
    const { client } = seedPostedCrawl();

    const result = await collectReadyCrawls(client, TENANT);

    expect(calls().map((call) => call.path)).toEqual([
      "/on_page/tasks_ready",
      `/on_page/summary/${CRAWL_ID}`,
      "/on_page/pages",
      "/on_page/duplicate_tags",
      "/on_page/duplicate_tags",
      "/on_page/redirect_chains",
      "/on_page/non_indexable",
    ]);
    expect(result).toMatchObject({ outstanding: 1, ready: 1, collected: 1, stillCrawling: 0 });
  });

  it("writes the summary snapshot last, so a failed detail read leaves the crawl outstanding", async () => {
    routeReadyCrawl();
    const { client, tables } = seedPostedCrawl();

    await collectReadyCrawls(client, TENANT);

    const kinds = (tables["dataforseo_snapshots"] ?? []).map((row) => row["kind"]);
    expect(kinds).toEqual([
      "onpage_task",
      "onpage_pages",
      "onpage_duplicate_title",
      "onpage_duplicate_description",
      "onpage_redirect_chains",
      "onpage_non_indexable",
      "onpage_summary",
    ]);
  });

  it("stores the parsed rows against the crawled host", async () => {
    routeReadyCrawl();
    const { client, tables } = seedPostedCrawl();

    await collectReadyCrawls(client, TENANT);

    const pages = (tables["dataforseo_snapshots"] ?? []).find(
      (row) => row["kind"] === "onpage_pages",
    );
    expect(pages?.["target"]).toBe(HOST);
    expect(pages?.["returned_row_count"]).toBe(1);
    expect(pages?.["payload"]).toEqual({ rows: [{ url: `https://${HOST}/a`, status_code: 301 }] });
  });

  it("does not collect a crawl the provider is still running", async () => {
    routeReadyCrawl("in_progress");
    const { client, tables } = seedPostedCrawl();

    const result = await collectReadyCrawls(client, TENANT);

    expect(calls().map((call) => call.path)).toEqual([
      "/on_page/tasks_ready",
      `/on_page/summary/${CRAWL_ID}`,
    ]);
    expect(result).toMatchObject({ ready: 1, collected: 0, stillCrawling: 1 });
    expect((tables["dataforseo_snapshots"] ?? []).map((row) => row["kind"])).toEqual([
      "onpage_task",
    ]);
  });

  it("re-reads nothing for a crawl that already has its summary", async () => {
    routeReadyCrawl();
    const { client } = seedPostedCrawl([
      {
        id: "snap-summary",
        tenant_id: TENANT,
        kind: "onpage_summary",
        target: HOST,
        provider_task_id: CRAWL_ID,
      },
    ]);

    const result = await collectReadyCrawls(client, TENANT);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({
      outstanding: 0,
      ready: 0,
      collected: 0,
      stillCrawling: 0,
      costUsd: 0,
    });
  });

  it("leaves a posted crawl the provider has not listed as still crawling", async () => {
    fetcher.mockResolvedValue(
      envelope([{ id: "ready-1", status_code: 20000, status_message: "Ok.", result: [] }]),
    );
    const { client } = seedPostedCrawl();

    const result = await collectReadyCrawls(client, TENANT);

    expect(calls()).toHaveLength(1);
    expect(result).toMatchObject({ outstanding: 1, ready: 0, collected: 0, stillCrawling: 1 });
  });
});

describe("comparing one page against the crawl", () => {
  const PAGE_URL = `https://${HOST}/services`;

  function duplicateContentFingerprint(): string {
    return fingerprint(
      "/on_page/duplicate_content",
      { id: CRAWL_ID, url: PAGE_URL, limit: RESULT_ROW_LIMIT },
      today(),
    );
  }

  it("sends the page url, because the provider cannot run this as a site-wide sweep", async () => {
    fetcher.mockResolvedValue(itemsResult([{ url: `https://${HOST}/services-2` }]));
    const { client } = fakeClient();

    await collectDuplicateContent(client, TENANT, CRAWL_ID, PAGE_URL);

    expect(calls()[0]?.path).toBe("/on_page/duplicate_content");
    expect(postedBody(0)).toEqual([{ id: CRAWL_ID, url: PAGE_URL, limit: RESULT_ROW_LIMIT }]);
  });

  it("files the snapshot against the page, not the domain the crawl covered", async () => {
    fetcher.mockResolvedValue(itemsResult([{ url: `https://${HOST}/services-2` }]));
    const { client, tables } = fakeClient();

    await collectDuplicateContent(client, TENANT, CRAWL_ID, PAGE_URL);

    const snapshot = (tables["dataforseo_snapshots"] ?? [])[0];
    expect(snapshot?.["kind"]).toBe("onpage_duplicate_content");
    expect(snapshot?.["target"]).toBe(PAGE_URL);
  });

  it("reports the row count the snapshot holds, not the count this response carried", async () => {
    fetcher.mockResolvedValue(itemsResult([{ url: `https://${HOST}/services-2` }]));
    const { client } = fakeClient([
      {
        id: "snap-dupe",
        tenant_id: TENANT,
        request_fingerprint: duplicateContentFingerprint(),
        returned_row_count: 7,
      },
    ]);

    expect(await collectDuplicateContent(client, TENANT, CRAWL_ID, PAGE_URL)).toMatchObject({
      rows: 7,
    });
  });

  it("flags a full page of rows as possibly truncated", async () => {
    const full = Array.from({ length: RESULT_ROW_LIMIT }, (_, index) => ({
      url: `https://${HOST}/dupe-${index}`,
    }));
    fetcher.mockResolvedValue(itemsResult(full));
    const { client, tables } = fakeClient();

    const result = await collectDuplicateContent(client, TENANT, CRAWL_ID, PAGE_URL);

    expect(result.rows).toBe(RESULT_ROW_LIMIT);
    expect((tables["dataforseo_snapshots"] ?? [])[0]?.["possibly_truncated"]).toBe(true);
  });

  it("leaves a short result unflagged", async () => {
    fetcher.mockResolvedValue(itemsResult([{ url: `https://${HOST}/services-2` }]));
    const { client, tables } = fakeClient();

    await collectDuplicateContent(client, TENANT, CRAWL_ID, PAGE_URL);

    expect((tables["dataforseo_snapshots"] ?? [])[0]?.["possibly_truncated"]).toBe(false);
  });
});

describe("stopping a runaway crawl", () => {
  it("posts one force_stop task per crawl id", async () => {
    fetcher.mockResolvedValue(
      envelope([
        { id: "stop-1", status_code: 20000, status_message: "Ok.", cost: 0, result: null },
        { id: "stop-2", status_code: 20000, status_message: "Ok.", cost: 0, result: null },
      ]),
    );
    const { client } = fakeClient();

    const result = await forceStopCrawl(client, TENANT, [CRAWL_ID, "other-crawl"]);

    expect(calls()[0]?.path).toBe("/on_page/force_stop");
    expect(postedBody(0)).toEqual([{ id: CRAWL_ID }, { id: "other-crawl" }]);
    expect(result).toEqual({ stopped: 2 });
  });

  it("makes no request when there is nothing to stop", async () => {
    const { client } = fakeClient();

    expect(await forceStopCrawl(client, TENANT, [])).toEqual({ stopped: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("reading the response envelope", () => {
  it("pulls progress and the three metric blocks out of a summary result", () => {
    expect(
      parseCrawlSummary([
        {
          crawl_progress: "finished",
          crawl_status: { pages_crawled: 12 },
          domain_info: { name: HOST },
          page_metrics: { onpage_score: 91.2 },
        },
      ]),
    ).toEqual({
      crawlProgress: "finished",
      crawlStatus: { pages_crawled: 12 },
      domainInfo: { name: HOST },
      pageMetrics: { onpage_score: 91.2 },
    });
  });

  it("reports a missing metric block as absent rather than as an empty reading", () => {
    const parsed = parseCrawlSummary([{ crawl_progress: "in_progress" }]);
    expect(parsed?.pageMetrics).toBeNull();
    expect(parsed?.crawlStatus).toBeNull();
  });

  it("returns null for an empty summary result instead of an empty shell", () => {
    expect(parseCrawlSummary([])).toBeNull();
  });

  it("pulls the items and the provider's own total out of a result endpoint", () => {
    expect(
      parseResultItems([
        {
          crawl_progress: "finished",
          total_items_count: 240,
          items: [{ url: "https://x.test/a" }, { url: "https://x.test/b" }],
        },
      ]),
    ).toEqual({
      rows: [{ url: "https://x.test/a" }, { url: "https://x.test/b" }],
      totalCount: 240,
      crawlProgress: "finished",
    });
  });

  it("reports an unknown total as absent while still returning the rows it got", () => {
    const parsed = parseResultItems([{ items: [{ url: "https://x.test/a" }] }]);
    expect(parsed.totalCount).toBeNull();
    expect(parsed.rows).toHaveLength(1);
  });

  it("returns no rows when the result carries no items array", () => {
    expect(parseResultItems([{ crawl_progress: "in_progress" }]).rows).toEqual([]);
  });
});
