import { describe, expect, it } from "vitest";

import {
  WEEKLY_VISIBLE_CAP,
  buildQueue,
  dedupeSources,
  toneForUrgency,
  urgencyFor,
  urgencyLabel,
  weeklyProgress,
  type QueueSource,
} from "./suggestion-queue";

const NOW = "2026-08-20T12:00:00.000Z";

function daysBefore(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

function source(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): QueueSource {
  return {
    kind: "recommendation",
    categoryId: "search",
    title: "Title does not say Tulsa",
    targetUrl: "https://trumoveinc.com/corporate-relocation",
    storedState: "proposed",
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: daysBefore(1),
    updatedAt: daysBefore(1),
    ...overrides,
  };
}

describe("queue state derivation", () => {
  it("puts open work in Open", () => {
    const queue = buildQueue(
      [
        source({ id: "r1", storedState: "draft" }),
        source({ id: "r2", storedState: "proposed" }),
        source({ id: "r3", storedState: "under_review" }),
        source({ id: "r4", storedState: "observed" }),
        source({ id: "c1", kind: "change", storedState: "proposed" }),
      ],
      NOW,
    );
    expect(queue.open.map((item) => item.id).sort()).toEqual(["c1", "r1", "r2", "r3", "r4"]);
    expect(queue.ignored).toHaveLength(0);
    expect(queue.done).toHaveLength(0);
  });

  it("files rejected work under Ignored", () => {
    const queue = buildQueue(
      [
        source({ id: "r1", storedState: "rejected" }),
        source({ id: "c1", kind: "change", storedState: "rejected" }),
      ],
      NOW,
    );
    expect(queue.ignored.map((item) => item.id).sort()).toEqual(["c1", "r1"]);
    expect(queue.open).toHaveLength(0);
  });

  it("files applied and verified work under Done as permanent receipts", () => {
    const queue = buildQueue(
      [
        source({ id: "c1", kind: "change", storedState: "applied" }),
        source({ id: "c2", kind: "change", storedState: "verified" }),
      ],
      NOW,
    );
    expect(queue.done.map((item) => item.id).sort()).toEqual(["c1", "c2"]);
  });

  it("drops a recommendation that already became a change request", () => {
    // The change request is the thing you act on. Showing both would be the
    // same decision twice.
    const queue = buildQueue(
      [
        source({ id: "r1", linkedChangeId: "c1" }),
        source({ id: "c1", kind: "change", storedState: "proposed" }),
      ],
      NOW,
    );
    expect(queue.open.map((item) => item.id)).toEqual(["c1"]);
  });

  it("ignores stored states that are not queue states", () => {
    const queue = buildQueue(
      [
        source({ id: "r1", storedState: "scheduled" }),
        source({ id: "r2", storedState: "failed" }),
        source({ id: "c1", kind: "change", storedState: "rolled_back" }),
      ],
      NOW,
    );
    expect(queue.open).toHaveLength(0);
    expect(queue.ignored).toHaveLength(0);
    expect(queue.done).toHaveLength(0);
  });
});

describe("restore and ignore legality", () => {
  it("lets an ignored recommendation be restored", () => {
    const queue = buildQueue([source({ id: "r1", storedState: "rejected" })], NOW);
    expect(queue.ignored[0]?.canRestore).toBe(true);
  });

  it("refuses to offer restore for a rejected change request", () => {
    // `rejected` is terminal in the change-request state machine, so a Restore
    // button here would always fail.
    const queue = buildQueue([source({ id: "c1", kind: "change", storedState: "rejected" })], NOW);
    expect(queue.ignored[0]?.canRestore).toBe(false);
  });

  it("refuses to offer ignore for an audit finding, which has nowhere to store it", () => {
    const queue = buildQueue(
      [source({ id: "a1", kind: "audit", storedState: "proposed", severity: "critical" })],
      NOW,
    );
    expect(queue.open[0]?.canIgnore).toBe(false);
  });

  it("offers ignore for the kinds that do persist it", () => {
    const queue = buildQueue(
      [source({ id: "r1" }), source({ id: "c1", kind: "change", storedState: "proposed" })],
      NOW,
    );
    expect(queue.open.every((item) => item.canIgnore)).toBe(true);
  });
});

describe("dedup", () => {
  it("collapses repeats of the same finding by fingerprint", () => {
    const deduped = dedupeSources([
      source({ id: "r1", fingerprint: "title-missing-city", createdAt: daysBefore(9) }),
      source({ id: "r2", fingerprint: "title-missing-city", createdAt: daysBefore(2) }),
    ]);
    expect(deduped).toHaveLength(1);
  });

  it("keeps the earliest of a duplicate group so the waiting time stays true", () => {
    const deduped = dedupeSources([
      source({ id: "newer", fingerprint: "f", createdAt: daysBefore(2) }),
      source({ id: "older", fingerprint: "f", createdAt: daysBefore(9) }),
    ]);
    expect(deduped[0]?.id).toBe("older");
  });

  it("never collapses rows that have no fingerprint", () => {
    const deduped = dedupeSources([
      source({ id: "r1", fingerprint: null }),
      source({ id: "r2", fingerprint: null }),
    ]);
    expect(deduped).toHaveLength(2);
  });

  it("does not collapse across kinds even on a shared fingerprint", () => {
    const deduped = dedupeSources([
      source({ id: "r1", fingerprint: "f" }),
      source({ id: "c1", kind: "change", fingerprint: "f", storedState: "proposed" }),
    ]);
    expect(deduped).toHaveLength(2);
  });
});

describe("urgency", () => {
  it("maps a stored audit severity straight through", () => {
    expect(urgencyFor(source({ id: "a", kind: "audit", severity: "critical" }), NOW)).toBe(
      "fix_now",
    );
    expect(urgencyFor(source({ id: "a", kind: "audit", severity: "warning" }), NOW)).toBe(
      "worth_doing",
    );
    expect(urgencyFor(source({ id: "a", kind: "audit", severity: "advice" }), NOW)).toBe(
      "nice_to_have",
    );
  });

  it("escalates by how long the row has actually been waiting", () => {
    expect(urgencyFor(source({ id: "a", createdAt: daysBefore(20) }), NOW)).toBe("fix_now");
    expect(urgencyFor(source({ id: "a", createdAt: daysBefore(6) }), NOW)).toBe("worth_doing");
    expect(urgencyFor(source({ id: "a", createdAt: daysBefore(1) }), NOW)).toBe("nice_to_have");
  });

  it("writes urgency as elapsed time, because the stored field is a timestamp", () => {
    expect(urgencyLabel(source({ id: "a", createdAt: daysBefore(14) }), NOW)).toBe(
      "waiting 14 days",
    );
    expect(urgencyLabel(source({ id: "a", createdAt: daysBefore(1) }), NOW)).toBe("waiting 1 day");
    expect(urgencyLabel(source({ id: "a", createdAt: NOW }), NOW)).toBe("waiting since today");
  });

  it("colours by rank, following the palette the spec assigns", () => {
    expect(toneForUrgency("fix_now")).toBe("danger");
    expect(toneForUrgency("worth_doing")).toBe("warning");
    expect(toneForUrgency("nice_to_have")).toBe("info");
  });
});

describe("ranking and the weekly cap", () => {
  it("shows at most seven open suggestions", () => {
    const many = Array.from({ length: 12 }, (_unused, index) =>
      source({ id: `r${index}`, createdAt: daysBefore(index + 1) }),
    );
    expect(buildQueue(many, NOW).visible).toHaveLength(WEEKLY_VISIBLE_CAP);
  });

  it("ranks fix now above worth doing above nice to have", () => {
    const queue = buildQueue(
      [
        source({ id: "nice", createdAt: daysBefore(1) }),
        source({ id: "urgent", createdAt: daysBefore(30) }),
        source({ id: "worth", createdAt: daysBefore(5) }),
      ],
      NOW,
    );
    expect(queue.visible.map((item) => item.id)).toEqual(["urgent", "worth", "nice"]);
  });

  it("puts the longest wait first inside a rank", () => {
    const queue = buildQueue(
      [
        source({ id: "younger", createdAt: daysBefore(4) }),
        source({ id: "older", createdAt: daysBefore(6) }),
      ],
      NOW,
    );
    expect(queue.visible.map((item) => item.id)).toEqual(["older", "younger"]);
  });

  it("reports the true open count even when more than seven are waiting", () => {
    const many = Array.from({ length: 12 }, (_unused, index) =>
      source({ id: `r${index}`, createdAt: daysBefore(index + 1) }),
    );
    // The cap governs what is shown, never what is claimed.
    expect(buildQueue(many, NOW).open).toHaveLength(12);
  });
});

describe("weekly progress", () => {
  it("counts a suggestion as handled whether it was approved or ignored", () => {
    const queue = buildQueue(
      [
        source({ id: "done", kind: "change", storedState: "applied", updatedAt: daysBefore(2) }),
        source({ id: "ignored", storedState: "rejected", updatedAt: daysBefore(3) }),
        source({ id: "open1" }),
        source({ id: "open2" }),
      ],
      NOW,
    );
    expect(weeklyProgress(queue, NOW)).toEqual({ handled: 2, total: 4 });
  });

  it("does not count work handled before this week", () => {
    const queue = buildQueue(
      [
        source({ id: "old", storedState: "rejected", updatedAt: daysBefore(30) }),
        source({ id: "open1" }),
      ],
      NOW,
    );
    expect(weeklyProgress(queue, NOW)).toEqual({ handled: 0, total: 1 });
  });
});
