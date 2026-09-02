import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { describeHostReadiness, type HostReadiness } from "./host-readiness";

/** Whether this host holds what the service-role client needs. Names only, never values. */
export const getHostReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<HostReadiness> => describeHostReadiness(process.env));
