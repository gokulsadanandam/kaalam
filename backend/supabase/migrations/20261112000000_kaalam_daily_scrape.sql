-- Kaalam: shared daily scrape cache + morning scrape schedule.
--
-- After deploying the edge function, store two Vault secrets once (SQL editor):
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/kaalam', 'kaalam_function_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'kaalam_cron_secret');
--
-- Until both exist the cron job simply does nothing useful (the HTTP call fails).

-- ---------------------------------------------------------------------------
-- One row per IST day. Only successful scrapes are written.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_scrape (
  day         date primary key,
  predictions jsonb       not null default '{}'::jsonb,
  nalla_neram text,
  source      text,
  rasi_count  smallint    not null default 0,
  errors      text[]      not null default '{}',
  fetched_at  timestamptz not null default now()
);

comment on table public.daily_scrape is
  'Kaalam: scraped rasi palan per IST day (rasi key -> text). Written by the kaalam edge function only.';

-- Copyrighted newspaper text: never expose it through the public anon/authenticated
-- PostgREST roles. With RLS on and no policies, only the service role can read/write.
alter table public.daily_scrape enable row level security;
revoke all on public.daily_scrape from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Morning scrape: every 30 minutes from 05:30 to 10:00 IST (00:00–04:30 UTC).
-- The endpoint returns immediately once the day has all 12 rasis stored.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'kaalam-morning-scrape';

select cron.schedule(
  'kaalam-morning-scrape',
  '0,30 0-4 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'kaalam_function_url') || '/api/cron/scrape',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kaalam_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
