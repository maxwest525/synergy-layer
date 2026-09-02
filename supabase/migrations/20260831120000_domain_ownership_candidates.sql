-- Ownership is operator-declared, never inferred (COMPETITIVE_MODEL.md §4, §7).
-- Shared whois registration details or an identical technology stack between
-- two already-known domains are surfaced here as a candidate for the operator
-- to confirm or reject. Nothing reads this table's confirmed rows as fact
-- anywhere else yet -- confirming a row is the record of the decision, and no
-- code path may write company_classification or any ownership field from a
-- match here without that confirmation.
--
-- Shape copied from ad_advertiser_candidates (20260811000206): pending by
-- default, an operator flips review_state, nothing else does.
CREATE TABLE public.domain_ownership_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- 'same_registration_details_across_two_known_domains' or
  -- 'identical_technology_stack_across_two_known_domains'.
  rule text NOT NULL,
  -- Normalised (lower-cased, leading "www." stripped), domain_a < domain_b
  -- lexically so a pair files once regardless of read order.
  domain_a text NOT NULL,
  domain_b text NOT NULL,
  -- Whois: [{ field, value, cohortCount }, ...] for every field that matched.
  -- Technology: [{ sharedTechnologyCount, cohortCount }].
  -- Deliberately no score column: the review killed similarity scoring for
  -- both rules, so nothing here computes one.
  matched_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Snapshot ids, collection dates and freshness state for both sides
  -- (EVIDENCE_POLICY.md's mandatory collection-time and freshness fields).
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_state text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule, domain_a, domain_b)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_ownership_candidates TO authenticated;
GRANT ALL ON public.domain_ownership_candidates TO service_role;
ALTER TABLE public.domain_ownership_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read domain ownership candidates" ON public.domain_ownership_candidates FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage domain ownership candidates" ON public.domain_ownership_candidates FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
