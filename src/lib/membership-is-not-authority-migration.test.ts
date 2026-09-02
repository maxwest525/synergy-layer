import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902020000_membership_is_not_authority.sql",
    import.meta.url,
  ),
  "utf8",
);

/**
 * The 2026-09-02 database and security reviews found the database trusting
 * membership as if it were the operator role, the actor a caller names as if
 * it were the caller, and the anon role's default privileges as if the row
 * policies were the only door. These pin each closure so a later migration
 * cannot quietly reopen one.
 */
describe("approval locks every lane", () => {
  it("guards on the state alone, not on the lane's old name", () => {
    const body = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.lock_approved_title_h1_content"),
      sql.indexOf("-- 2. The revise routine"),
    );
    expect(body).toMatch(/IF OLD\.state <> 'proposed' AND \(/);
    expect(body).not.toMatch(/OLD\.proposal_type = 'title_h1'/);
    expect(body).toMatch(
      /Approved proposal wording, evidence, and source baseline are immutable\./,
    );
  });

  it("moves the one row still filed under the old name and closes the constraint behind it", () => {
    const disabled = sql.indexOf("DISABLE TRIGGER lock_approved_title_h1_content");
    const update = sql.indexOf(
      "SET proposal_type = 'page_wording'\nWHERE proposal_type = 'title_h1'",
    );
    const enabled = sql.indexOf("ENABLE TRIGGER lock_approved_title_h1_content");
    expect(disabled).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(disabled);
    expect(enabled).toBeGreaterThan(update);
    expect(sql).toMatch(
      /CHECK \(proposal_type IN \('page_wording', 'page_metadata', 'site\.crawl_directives'\)\)/,
    );
    // The constraint closes only after the row has moved.
    expect(sql.indexOf("ADD CONSTRAINT change_requests_proposal_type_check")).toBeGreaterThan(
      enabled,
    );
  });
});

describe("the revise routine serves the lane it is named for", () => {
  const revise = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.revise_title_h1_proposal"),
    sql.indexOf("REVOKE EXECUTE ON FUNCTION public.create_page_wording_proposal"),
  );

  it("accepts a page_wording draft and refuses everything else", () => {
    expect(revise).toMatch(/IF v_change\.proposal_type <> 'page_wording' THEN/);
    expect(revise).not.toMatch(/proposal_type <> 'title_h1'/);
    expect(revise).toMatch(/IF v_change\.state <> 'proposed' THEN/);
  });

  it("binds the actor to the session whenever there is one", () => {
    expect(revise).toMatch(
      /IF auth\.uid\(\) IS NOT NULL AND _actor IS DISTINCT FROM auth\.uid\(\) THEN/,
    );
    expect(revise).toMatch(
      /IF _actor IS NULL THEN\s+RAISE EXCEPTION 'A revision needs a named actor\.'/,
    );
  });

  it("keeps the append-only version history and the operator check", () => {
    expect(revise).toMatch(/INSERT INTO public\.change_request_versions/);
    expect(revise).toMatch(/Only an operator or admin can revise a proposal\./);
    expect(revise).toMatch(
      /jsonb_array_length\(_changes\) < 1 OR jsonb_array_length\(_evidence\) <> 3/,
    );
  });
});

describe("the create routine reserves the system path for the server", () => {
  const create = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.create_title_h1_proposal"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.revise_title_h1_proposal"),
  );

  it("refuses a null actor from a caller that has a session", () => {
    expect(create).toMatch(
      /IF _actor IS NULL THEN[\s\S]*?IF auth\.uid\(\) IS NOT NULL THEN\s+RAISE EXCEPTION 'The system proposal path is reserved for the server\.'/,
    );
  });

  it("binds a named actor to the session, and still requires membership and the role", () => {
    expect(create).toMatch(
      /IF auth\.uid\(\) IS NOT NULL AND _actor IS DISTINCT FROM auth\.uid\(\) THEN/,
    );
    expect(create).toMatch(/Only an operator or admin can generate a proposal\./);
    expect(create).toMatch(/page_wording_field_is_owned/);
    expect(create).toMatch(/jsonb_array_length\(_changes\) < 1/);
  });

  it("makes the two wrappers the server's alone", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.create_page_wording_proposal\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.revise_page_wording_proposal\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_page_wording_proposal\([\s\S]*?\) TO service_role;/,
    );
  });
});

describe("membership alone no longer writes", () => {
  it("advancing a run needs the operator role and records the session as the actor", () => {
    const claim = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_workflow_run_step"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.set_concern_ownership"),
    );
    expect(claim).toMatch(
      /IF NOT public\.is_tenant_member\(v_run\.tenant_id\) OR NOT public\.is_operator\(\) THEN/,
    );
    expect(claim).toMatch(/v_actor := auth\.uid\(\);/);
    expect(claim).toMatch(/last_advanced_by = v_actor/);
    expect(claim).not.toMatch(/last_advanced_by = p_actor/);
    // The crash-recovery window is unchanged.
    expect(claim).toMatch(/interval '10 minutes'/);
  });

  it("owning a concern and seeding concerns need the operator role", () => {
    const concern = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.set_concern_ownership"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.seed_essential_concerns_for_tenant"),
    );
    expect(concern).toMatch(/IF NOT public\.is_operator\(\) THEN/);
    const seed = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.seed_essential_concerns_for_tenant"),
      sql.indexOf("-- Measurement evidence is appended by the server alone"),
    );
    expect(seed).toMatch(
      /AND NOT \(public\.is_tenant_member\(p_tenant_id\) AND public\.is_operator\(\)\) THEN/,
    );
  });

  it("measurement evidence is appended by the server alone", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.append_change_measurement_observation\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.append_change_measurement_revision\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("the two audit tables take rows from operators, not members", () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Tenant members record page metadata observations" ON public\.page_metadata_observations;/,
    );
    expect(sql).toMatch(
      /CREATE POLICY "Operators record page metadata observations"[\s\S]*?WITH CHECK \(public\.is_operator\(\) AND public\.is_tenant_member\(tenant_id\)\);/,
    );
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Tenant members record site audit snapshots" ON public\.site_audit_snapshots;/,
    );
    expect(sql).toMatch(
      /CREATE POLICY "Operators record site audit snapshots"[\s\S]*?WITH CHECK \(public\.is_operator\(\) AND public\.is_tenant_member\(tenant_id\)\);/,
    );
  });
});

describe("provisioning creates a membership", () => {
  const provision = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.provision_operator_from_allowlist"),
    sql.indexOf("-- Backfill for accounts already provisioned"),
  );

  it("the allow-list names the workspace an entry joins", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.authorized_operators\s+ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public\.tenants\(id\) ON DELETE SET NULL;/,
    );
  });

  it("joins the named workspace, else the sole tenant, before the role is compared", () => {
    expect(provision).toMatch(
      /SELECT role, tenant_id INTO v_allow, v_tenant FROM public\.authorized_operators/,
    );
    expect(provision).toMatch(
      /IF v_tenant IS NULL AND \(SELECT count\(\*\) FROM public\.tenants\) = 1 THEN/,
    );
    expect(provision).toMatch(/INSERT INTO public\.tenant_members \(tenant_id, user_id, role\)/);
    expect(provision).toMatch(/ON CONFLICT \(tenant_id, user_id\) DO NOTHING;/);
    expect(provision).toMatch(/WHERE id = _auth_user_id AND active_tenant_id IS NULL;/);
    expect(provision.indexOf("INSERT INTO public.tenant_members")).toBeLessThan(
      provision.indexOf("RETURN 'unchanged';"),
    );
  });

  it("says so when there are several tenants and the entry names none", () => {
    expect(provision).toMatch(/'auth\.provisioned_without_workspace'/);
  });

  it("backfills the accounts provisioned before it existed", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.tenant_members \(tenant_id, user_id, role\)\s+SELECT ao\.tenant_id, p\.id, ur\.role/,
    );
    expect(sql).toMatch(/WHERE m\.user_id = p\.id AND p\.active_tenant_id IS NULL;/);
  });
});

describe("the active workspace must be one the account belongs to", () => {
  it("refuses a profile pointing at a workspace it is not a member of", () => {
    const guard = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.refuse_foreign_active_tenant"),
      sql.indexOf("-- 7. The three vendor schedules"),
    );
    expect(guard).toMatch(/WHERE m\.tenant_id = NEW\.active_tenant_id AND m\.user_id = NEW\.id/);
    expect(guard).toMatch(/That client workspace is not available to this account\./);
    expect(guard).toMatch(
      /CREATE TRIGGER profiles_active_tenant_requires_membership\s+BEFORE INSERT OR UPDATE OF active_tenant_id ON public\.profiles/,
    );
  });

  it("runs after the backfill that gives every current account its membership", () => {
    expect(
      sql.indexOf("CREATE TRIGGER profiles_active_tenant_requires_membership"),
    ).toBeGreaterThan(sql.indexOf("WHERE m.user_id = p.id AND p.active_tenant_id IS NULL;"));
  });
});

describe("the three vendor schedules stop claiming to be on", () => {
  it("switches off exactly the three keys, only while they have never run, with the reason on the feed", () => {
    const keys =
      /key IN \('sch\.vendor_ad_refresh', 'sch\.vendor_landing_page_analysis', 'sch\.vendor_message_synthesis'\)/g;
    expect(sql.match(keys)).toHaveLength(2);
    expect(sql).toMatch(/SET enabled = false, next_run_at = NULL, updated_at = now\(\)/);
    expect(sql).toMatch(/AND s\.last_run_at IS NULL;/);
    expect(sql).toMatch(/AND last_run_at IS NULL;/);
    expect(sql).toMatch(/'schedule\.disabled'/);
    expect(sql.indexOf("'schedule.disabled'")).toBeLessThan(sql.indexOf("SET enabled = false"));
  });
});

describe("the anon role loses its default table privileges", () => {
  it("revokes what exists and closes the default for what comes next", () => {
    expect(sql).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;/);
    expect(sql).toMatch(/REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;/);
    expect(sql).toMatch(
      /REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;/,
    );
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;/,
    );
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;/,
    );
  });

  it("does not touch what authenticated needs to read and write under the row policies", () => {
    expect(sql).not.toMatch(/REVOKE (ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*FROM authenticated;/);
  });
});

describe("the next rendered proof does not fail on its own windows", () => {
  it("admits the 56 and 90-day windows the live trigger inserts, and backfills the live cycle", () => {
    expect(sql).toMatch(/CHECK \(window_days IN \(0, 7, 14, 28, 56, 90\)\)/);
    expect(sql).toMatch(/CROSS JOIN \(VALUES \(56\), \(90\)\) AS span\(window_days\)/);
    expect(sql).toMatch(
      /WHERE cycle\.live_at IS NOT NULL\s+ON CONFLICT \(cycle_id, window_days\) DO NOTHING;/,
    );
    // The rows can only be inserted once the constraint admits them.
    expect(sql.indexOf("CROSS JOIN (VALUES (56), (90))")).toBeGreaterThan(
      sql.indexOf("CHECK (window_days IN (0, 7, 14, 28, 56, 90))"),
    );
  });
});

describe("nothing here drops a column or a row", () => {
  it("has no DROP COLUMN, DROP TABLE or DELETE", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).not.toMatch(/DROP COLUMN/i);
    expect(withoutComments).not.toMatch(/DROP TABLE/i);
    expect(withoutComments).not.toMatch(
      /\bDELETE FROM\b(?! public\.user_roles WHERE user_id = _auth_user_id)/,
    );
  });
});
