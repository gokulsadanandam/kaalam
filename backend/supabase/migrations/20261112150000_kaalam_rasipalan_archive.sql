-- Kaalam: archive of third-party rasi palan, filled by the backfill scripts
-- (backend/scripts) and, from now on, by the daily scrape.
--
--   source = 'dailythanthi'        full paragraph per rasi (text), from the paper's archive API
--   source = 'tamildailycalendar'  one word per rasi (word), read from the daily calendar sheet image
--   source = 'hindutamil'          full paragraph per rasi (text), daily scrape only
--
-- Third-party content: RLS on and no policies, so only the service role (the
-- edge function and the scripts) can read or write. The public API decides how
-- much of it to show (credited, excerpts for paragraphs).

create table if not exists public.rasipalan_archive_day (
  day          date        not null,
  source       text        not null check (source in ('dailythanthi', 'tamildailycalendar', 'hindutamil')),
  -- ok: all 12 rasis stored; missing: the source has nothing for this day;
  -- review: read but not trusted (fewer than 12 clean words) — see notes.
  status       text        not null check (status in ('ok', 'missing', 'review')),
  url          text,
  nalla_neram  text,
  method       text,       -- api | tesseract | replicate | manual
  cost_usd     numeric(10, 6) not null default 0,
  notes        text,
  fetched_at   timestamptz not null default now(),
  primary key (day, source)
);

create table if not exists public.rasipalan_archive (
  day          date        not null,
  source       text        not null,
  rasi         text        not null,  -- canonical key: mesham … meenam
  text         text,                  -- paragraph sources
  word         text,                  -- calendar sheets: one word, e.g. எதிர்ப்பு
  confidence   real,                  -- OCR: 0..1; null for text sources
  fetched_at   timestamptz not null default now(),
  primary key (day, source, rasi),
  foreign key (day, source) references public.rasipalan_archive_day (day, source) on delete cascade
);

create index if not exists rasipalan_archive_day_source on public.rasipalan_archive_day (source, status, day);

comment on table public.rasipalan_archive_day is 'Kaalam: per day and source, whether third-party rasi palan was archived.';
comment on table public.rasipalan_archive is 'Kaalam: archived third-party rasi palan (one row per day, source and rasi).';

alter table public.rasipalan_archive_day enable row level security;
alter table public.rasipalan_archive enable row level security;
revoke all on public.rasipalan_archive_day from anon, authenticated;
revoke all on public.rasipalan_archive from anon, authenticated;
