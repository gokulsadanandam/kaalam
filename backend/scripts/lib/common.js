/**
 * Shared helpers for the backfill scripts (run locally, on demand):
 *   - Postgres connection to the linked Supabase project (session pooler +
 *     SUPABASE_DB_PASSWORD from backend/.env)
 *   - upsert of one archived day (day row + 12 rasi rows) in a transaction
 *   - polite fetching (fixed delay between requests, retries with backoff)
 *   - small CLI argument parser
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE_DIR = path.join(BACKEND_DIR, '.cache');

try {
  process.loadEnvFile(path.join(BACKEND_DIR, '.env'));
} catch {
  // No .env: rely on the environment.
}

/** `--from 2024-01-01 --dry-run` -> { from: '2024-01-01', 'dry-run': true } */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function connectionString() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error('SUPABASE_DB_PASSWORD is not set in backend/.env');
  const poolerFile = path.join(BACKEND_DIR, 'supabase', '.temp', 'pooler-url');
  const base = process.env.SUPABASE_DB_URL || fs.readFileSync(poolerFile, 'utf8').trim();
  const url = new URL(base);
  url.password = password;
  return url.toString();
}

export async function connect() {
  const client = new pg.Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

/** A small connection pool, for scripts that save several days at once (each transaction on its own client). */
export function connectPool(max = 8) {
  return new pg.Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max });
}

/** Days already archived for [source] with one of [statuses], as a Set of 'YYYY-MM-DD'. */
export async function archivedDays(db, source, statuses = ['ok', 'missing']) {
  const { rows } = await db.query(
    'select to_char(day, \'YYYY-MM-DD\') as day from public.rasipalan_archive_day where source = $1 and status = any($2)',
    [source, statuses],
  );
  return new Set(rows.map((r) => r.day));
}

/**
 * Replace one day of one source.
 * @param day   { day: 'YYYY-MM-DD', source, status, url?, nallaNeram?, method?, costUsd?, notes? }
 * @param rasis [{ rasi, text?, word?, confidence? }]
 */
export async function saveDay(db, day, rasis = []) {
  await db.query('begin');
  try {
    await db.query(
      `insert into public.rasipalan_archive_day (day, source, status, url, nalla_neram, method, cost_usd, notes, fetched_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (day, source) do update set status = excluded.status, url = excluded.url,
         nalla_neram = excluded.nalla_neram, method = excluded.method,
         cost_usd = public.rasipalan_archive_day.cost_usd + excluded.cost_usd,
         notes = excluded.notes, fetched_at = now()`,
      [day.day, day.source, day.status, day.url || null, day.nallaNeram || null, day.method || null, day.costUsd || 0, day.notes || null],
    );
    await db.query('delete from public.rasipalan_archive where day = $1 and source = $2', [day.day, day.source]);
    for (const r of rasis) {
      await db.query(
        'insert into public.rasipalan_archive (day, source, rasi, text, word, confidence) values ($1, $2, $3, $4, $5, $6)',
        [day.day, day.source, r.rasi, r.text ?? null, r.word ?? null, r.confidence ?? null],
      );
    }
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const USER_AGENT = 'Mozilla/5.0 (KaalamArchive/1.0; Tamil almanac app)';

/**
 * GET with a minimum gap between requests to the same host and retries on
 * network errors / 429 / 5xx. Returns the Response (404 is returned, not thrown).
 */
const lastRequestAt = new Map();
export async function politeFetch(url, { gapMs = 1000, headers = {}, retries = 4 } = {}) {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequestAt.get(host) || 0) + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers }, redirect: 'follow' });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (attempt >= retries) throw error;
      await sleep(2000 * 2 ** attempt);
    }
  }
}

/** Every 'YYYY-MM-DD' from [from] to [to], inclusive. */
export function* daysBetween(from, to) {
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}
