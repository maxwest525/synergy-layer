import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";

vi.mock("./os.server", () => ({
  logActivity: vi.fn(async () => undefined),
}));

import { logActivity } from "./os.server";

function classificationClient(current: string | null) {
  const updates: Record<string, unknown>[] = [];
  const candidate = {
    id: "11111111-1111-4111-8111-111111111111",
    domain: "example-movers.com",
    company_classification: current,
  };

  const client = {
    from(table: string) {
      if (table !== "competitor_candidates") throw new Error(`Unexpected table: ${table}`);
      const chain: Record<string, unknown> = {};
      chain["select"] = vi.fn(() => chain);
      chain["eq"] = vi.fn(() => chain);
      chain["maybeSingle"] = vi.fn(async () => ({ data: candidate, error: null }));
      chain["update"] = vi.fn((value: Record<string, unknown>) => {
        updates.push(value);
        return chain;
      });
      chain["then"] = (resolve: (value: { data: (typeof candidate)[]; error: null }) => unknown) =>
        Promise.resolve({ data: [candidate], error: null }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, updates };
}

describe("setCompanyClassification", () => {
  beforeEach(() => vi.mocked(logActivity).mockClear());

  it("persists an operator-assigned carrier classification and records its evidence", async () => {
    const { setCompanyClassification } = await import("./company-classification.server");
    const { client, updates } = classificationClient(null);

    const result = await setCompanyClassification({
      client,
      tenantId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      candidateId: "11111111-1111-4111-8111-111111111111",
      classification: "carrier",
      at: new Date("2026-08-13T15:00:00.000Z"),
    });

    expect(result).toEqual({
      changed: true,
      domain: "example-movers.com",
      classification: "carrier",
    });
    expect(updates).toEqual([
      {
        company_classification: "carrier",
        classification_updated_by: "33333333-3333-4333-8333-333333333333",
        classification_updated_at: "2026-08-13T15:00:00.000Z",
      },
    ]);
    expect(logActivity).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        tenantId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        verb: "company.classification_changed",
        subjectKind: "competitor_candidate",
        subjectId: "11111111-1111-4111-8111-111111111111",
        payload: { domain: "example-movers.com", previous: null, classification: "carrier" },
      }),
    );
  });

  it("lets an operator return a classified company to unknown without inventing a replacement", async () => {
    const { setCompanyClassification } = await import("./company-classification.server");
    const { client, updates } = classificationClient("broker");

    const result = await setCompanyClassification({
      client,
      tenantId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      candidateId: "11111111-1111-4111-8111-111111111111",
      classification: "unclassified",
      at: new Date("2026-08-13T15:01:00.000Z"),
    });

    expect(result).toEqual({ changed: true, domain: "example-movers.com", classification: null });
    expect(updates[0]).toMatchObject({ company_classification: null });
    expect(logActivity).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        payload: { domain: "example-movers.com", previous: "broker", classification: null },
      }),
    );
  });

  it("does not create a false change record when the company is already unclassified", async () => {
    const { setCompanyClassification } = await import("./company-classification.server");
    const { client, updates } = classificationClient(null);

    const result = await setCompanyClassification({
      client,
      tenantId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      candidateId: "11111111-1111-4111-8111-111111111111",
      classification: "unclassified",
    });

    expect(result).toEqual({ changed: false, domain: "example-movers.com", classification: null });
    expect(updates).toEqual([]);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
