-- Every model call in the OS goes through the LiteLLM/OpenRouter proxy (or its
-- Lovable AI Gateway fallback) with no spend ceiling at all -- CODE-2. The
-- DataForSEO budget (dataforseo_budgets, 20260810180847) is the proven shape:
-- one row per tenant per month, a hard-stop ceiling, and alert thresholds.
-- This is the same shape for model calls, kept as its own table rather than a
-- shared one because the two track genuinely different things (a metered API
-- with its own $-per-request pricing, versus per-token model pricing) and
-- forcing them into one schema would only add indirection neither needs.

CREATE TABLE public.ai_gateway_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  ceiling_usd numeric(10,2) NOT NULL DEFAULT 300.00,
  spent_usd numeric(12,6) NOT NULL DEFAULT 0,
  alerts_fired jsonb NOT NULL DEFAULT '[]'::jsonb,
  hard_stop boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_gateway_budgets TO authenticated;
GRANT ALL ON public.ai_gateway_budgets TO service_role;
ALTER TABLE public.ai_gateway_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_budget_read ON public.ai_gateway_budgets FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY ai_budget_write ON public.ai_gateway_budgets FOR ALL USING (is_operator() AND is_tenant_member(tenant_id)) WITH CHECK (is_operator() AND is_tenant_member(tenant_id));
CREATE TRIGGER touch_ai_gateway_budgets BEFORE UPDATE ON public.ai_gateway_budgets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ai_gateway_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  surface text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  priced boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_gateway_requests_tenant_month ON public.ai_gateway_requests (tenant_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_gateway_requests TO authenticated;
GRANT ALL ON public.ai_gateway_requests TO service_role;
ALTER TABLE public.ai_gateway_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_gateway_requests_read ON public.ai_gateway_requests FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY ai_gateway_requests_write ON public.ai_gateway_requests FOR INSERT WITH CHECK (is_operator() AND is_tenant_member(tenant_id));
