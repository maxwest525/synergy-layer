create table public.umami_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid references public.measurement_runs(id) on delete set null,
  base_url text not null,
  website_id text not null,
  website_name text,
  metric text not null check (metric in ('stats','pageviews','pages','referrers')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  totals jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  returned_row_count integer not null default 0,
  provenance jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now()
);

create unique index umami_snapshots_unique_window
  on public.umami_snapshots (tenant_id, website_id, metric, period_start, period_end);
create index umami_snapshots_recent
  on public.umami_snapshots (tenant_id, metric, period_end desc);

grant select on public.umami_snapshots to authenticated;
grant all on public.umami_snapshots to service_role;

alter table public.umami_snapshots enable row level security;

create policy "Tenant members read umami snapshots"
  on public.umami_snapshots for select to authenticated
  using (public.is_tenant_member(tenant_id));

alter table public.measurement_runs drop constraint measurement_runs_provider_check;
alter table public.measurement_runs add constraint measurement_runs_provider_check
  check (provider = any (array['pagespeed','ga4','umami']));