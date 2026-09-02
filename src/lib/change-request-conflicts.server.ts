import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { MeasurementWindowRef } from "./change-request-conflicts";

type Client = SupabaseClient<Database>;

/**
 * The measurement windows still attached to these change requests, keyed the
 * way `findInFlightSiblings` reads them. A window hangs off a cycle and a
 * cycle off a change, so this is two reads. The approval page and the nightly
 * proposal job both need it; each used to carry its own copy.
 */
export async function readMeasurementWindowRefs(
  client: Client,
  tenantId: string,
  changeRequestIds: string[],
): Promise<MeasurementWindowRef[]> {
  if (changeRequestIds.length === 0) return [];
  const { data: cycles, error: cycleError } = await client
    .from("change_measurement_cycles")
    .select("id, change_request_id")
    .eq("tenant_id", tenantId)
    .in("change_request_id", changeRequestIds);
  if (cycleError) throw new Error(cycleError.message);
  const cycleIds = (cycles ?? []).map((cycle) => cycle.id);
  if (cycleIds.length === 0) return [];
  const { data: rows, error: windowError } = await client
    .from("change_measurement_windows")
    .select("cycle_id, available_after_pt")
    .eq("tenant_id", tenantId)
    .in("cycle_id", cycleIds);
  if (windowError) throw new Error(windowError.message);
  const changeByCycle = new Map((cycles ?? []).map((c) => [c.id, c.change_request_id]));
  return (rows ?? []).flatMap((row) => {
    const changeRequestId = changeByCycle.get(row.cycle_id);
    return changeRequestId
      ? [{ change_request_id: changeRequestId, available_after_pt: row.available_after_pt }]
      : [];
  });
}
