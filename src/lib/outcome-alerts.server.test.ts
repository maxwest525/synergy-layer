import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { fetchStoredOutcomes } from "./change-outcomes.server";
import { fileInboxItem, logActivity } from "./os.server";
import { reconcileOutcomeAlerts } from "./outcome-alerts.server";
import type { StoredOutcome } from "./site-health";

vi.mock("./tenant.server", () => ({
  requireTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("./os.server", () => ({
  fileInboxItem: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
}));

vi.mock("./change-outcomes.server", () => ({
  fetchStoredOutcomes: vi.fn(async () => ({ outcomes: [], truncated: false })),
}));

/** A reading `outcome-verdict.ts` itself grades a failure. */
const failing: StoredOutcome = {
  changeId: "chg-1",
  title: "Rewrite the packing page title",
  targetUrl: "https://x.test/services/packing",
  windowDays: 28,
  daysSinceLive: 30,
  impressions: 12,
  clicks: 0,
  measurable: true,
  readingStatus: "complete",
  coverage: null,
  baseline: { impressions: 100, clicks: 20 },
  siteTrend: null,
  wordingTreatment: false,
};

/** The smallest client that answers the one read this module performs. */
function inboxClient(alreadyFiledChangeIds: string[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () =>
      Promise.resolve({
        data: alreadyFiledChangeIds.map((id) => ({ subject_id: id })),
        error: null,
      }),
  };
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database>, from };
}

describe("a failure verdict reaches the inbox, once", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("files a needs-attention item naming the change, the window, and the evidence", async () => {
    vi.mocked(fetchStoredOutcomes).mockResolvedValue({ outcomes: [failing], truncated: false });
    const { client } = inboxClient([]);

    const result = await reconcileOutcomeAlerts(client, "sc-domain:x.test");

    expect(result).toEqual({ failed: 1, filed: 1 });
    expect(fileInboxItem).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        lane: "needs_attention",
        subjectKind: "change_request",
        subjectId: "chg-1",
        title: expect.stringContaining("Rewrite the packing page title"),
        summary: expect.stringMatching(/fell from 100 to 12 impressions/i),
        actions: [expect.objectContaining({ href: "/changes/chg-1" })],
      }),
    );
    // The window the evidence covers is named, in words.
    const filed = vi.mocked(fileInboxItem).mock.calls[0]?.[1];
    expect(filed?.summary).toMatch(/28 day/);
    expect(logActivity).toHaveBeenCalledOnce();
  });

  it("does not file a second item for a change already alerted, even resolved", async () => {
    vi.mocked(fetchStoredOutcomes).mockResolvedValue({ outcomes: [failing], truncated: false });
    const { client } = inboxClient(["chg-1"]);

    const result = await reconcileOutcomeAlerts(client, "sc-domain:x.test");

    expect(result).toEqual({ failed: 1, filed: 0 });
    expect(fileInboxItem).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("reads nothing from the inbox and files nothing when no verdict failed", async () => {
    vi.mocked(fetchStoredOutcomes).mockResolvedValue({
      outcomes: [{ ...failing, daysSinceLive: 3 }],
      truncated: false,
    });
    const { client, from } = inboxClient([]);

    const result = await reconcileOutcomeAlerts(client, "sc-domain:x.test");

    expect(result).toEqual({ failed: 0, filed: 0 });
    expect(from).not.toHaveBeenCalled();
    expect(fileInboxItem).not.toHaveBeenCalled();
  });
});
