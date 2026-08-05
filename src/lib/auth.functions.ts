import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Validates the session server-side, runs allowlist provisioning, records the
 * audit event, and returns the resulting access. The client never decides role.
 */
export const provisionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { provisionUser, currentRoles, recordAuthEvent } = await import("./auth-provisioning.server");

    const outcome = await provisionUser(context.userId);
    const roles = await currentRoles(context.supabase, context.userId);
    const canOperate = roles.some((role) => role === "admin" || role === "operator");

    await recordAuthEvent(
      context.userId,
      canOperate ? "auth.login_succeeded" : "auth.access_denied",
      canOperate
        ? "Operator signed in to AOOS."
        : "Sign-in succeeded but the account has no provisioned AOOS access.",
      { provisioning: outcome.status },
    );

    return { status: outcome.status, roles, canOperate };
  });
