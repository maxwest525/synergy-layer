import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Validates the session server-side, runs allowlist provisioning, records the
 * audit event, and returns the resulting access. The client never decides role.
 */
export const provisionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { provisionUser, currentRoles, recordAuthEvent } =
      await import("./auth-provisioning.server");

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

/**
 * Read-only view of the caller's AOOS access. No provisioning, no audit write:
 * the UI uses it only to tell the operator the truth about what they may do.
 */
export const getOperatorAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentRoles } = await import("./auth-provisioning.server");
    const roles = await currentRoles(context.supabase, context.userId);
    return {
      roles,
      canOperate: roles.some((role) => role === "admin" || role === "operator"),
      isAdmin: roles.includes("admin"),
    };
  });
