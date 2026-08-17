insert into public.capabilities (key, name, kind, category, description, integration_state, auth_kind, operations, config)
values ('cap.ga4','Google Analytics 4 (Data API)','connector','Traffic','Read-only page and event inventory from the GA4 Data API runReport endpoint, stored as immutable snapshots with the exact request window and provenance.','real','service_account',
 '[{"name":"runReport","description":"POST https://analyticsdata.googleapis.com/v1beta/{property}:runReport for hostname, page path, and event dimensions."}]'::jsonb,
 '{"mutating": false, "credentials": "server-side secrets only", "endpoint": "https://analyticsdata.googleapis.com/v1beta/{property}:runReport", "window": "28 days through yesterday"}'::jsonb)
on conflict (key) do update set name = excluded.name, description = excluded.description, integration_state = excluded.integration_state, operations = excluded.operations, config = excluded.config;

insert into public.workflows (key, name, description, trigger_kind, graph)
values ('ga4-daily-observe','GA4 Daily Traffic Observation','Reads the bound GA4 property once per day and stores an immutable snapshot. A failed read is recorded as a failure, never as zero traffic.','schedule',
 '{"nodes":[{"key":"collect","kind":"capability","ref":"cap.ga4"}],"edges":[]}'::jsonb)
on conflict (key) do update set name = excluded.name, description = excluded.description, graph = excluded.graph;

insert into public.schedules (key, name, cron, enabled, target_kind, target_id, next_run_at)
select 'ga4-daily-observe', 'GA4 daily observation', '30 16 * * *', true, 'workflow', w.id, now()
from public.workflows w
where w.key = 'ga4-daily-observe'
  and not exists (select 1 from public.schedules s where s.key = 'ga4-daily-observe');

update public.schedules s
set enabled = true, cron = '30 16 * * *', target_kind = 'workflow', target_id = w.id
from public.workflows w
where w.key = 'ga4-daily-observe' and s.key = 'ga4-daily-observe';

select cron.schedule(
  'aoos-ga4-daily-observe',
  '35 16 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://trumove-resource-center.lovable.app/api/public/hooks/scheduler-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-AOOS-Scheduler-Token', (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aoos_scheduler_hook' LIMIT 1
        )
      ),
      body := jsonb_build_object('scheduleKey', 'ga4-daily-observe')
    );
  $cron$
);