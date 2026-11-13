/**
 * Optional shared daily cache in Supabase Postgres (table `daily_scrape`).
 *
 * Serverless instances each have their own memory, so without this every
 * cold instance would scrape the newspapers again. With it, the morning cron
 * job scrapes once and every instance reads the stored result.
 *
 * Talks to PostgREST with plain `fetch`, so it runs unchanged on Node
 * (Vercel / local) and Deno (Supabase Edge Functions). Disabled unless both
 * SUPABASE_URL and a service key are set. Any failure is logged and treated
 * as a cache miss — the API then scrapes directly, as it would without a store.
 */

const TABLE = 'daily_scrape';
const TIMEOUT_MS = 3000;

function serviceKey(env) {
  return env.KAALAM_SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/** @returns {{ get(iso: string): Promise<object|null>, put(iso: string, scrape: object): Promise<void> } | null} */
function createStore(env) {
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = serviceKey(env);
  if (!base || !key) return null;

  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy service_role keys are JWTs and go in Authorization too; the newer
  // sb_secret_… keys are sent in `apikey` only.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  async function call(path, init = {}) {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
    return response;
  }

  return {
    async get(iso) {
      try {
        const response = await call(`${TABLE}?day=eq.${iso}&select=predictions,nalla_neram,source`);
        const [row] = await response.json();
        if (!row) return null;
        return { predictions: row.predictions || {}, nallaNeram: row.nalla_neram, source: row.source, errors: [] };
      } catch (error) {
        console.warn('[store] read failed:', error.message);
        return null;
      }
    },

    async put(iso, scrape) {
      try {
        await call(`${TABLE}?on_conflict=day`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            day: iso,
            predictions: scrape.predictions,
            nalla_neram: scrape.nallaNeram,
            source: scrape.source,
            rasi_count: Object.keys(scrape.predictions).length,
            errors: scrape.errors || [],
            fetched_at: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.warn('[store] write failed:', error.message);
      }
    },

    /**
     * Archived third-party rasi palan for one day, every source:
     * { tamildailycalendar: { status, url, nallaNeram, rasis: { mesham: { word, text, confidence } } }, dailythanthi: … }
     */
    async getArchive(iso) {
      try {
        const response = await call(
          `rasipalan_archive_day?day=eq.${iso}&status=neq.missing&select=source,status,url,nalla_neram,rasipalan_archive(rasi,text,word,confidence)`,
        );
        const out = {};
        for (const row of await response.json()) {
          const rasis = {};
          for (const r of row.rasipalan_archive || []) rasis[r.rasi] = { text: r.text, word: r.word, confidence: r.confidence };
          out[row.source] = { status: row.status, url: row.url, nallaNeram: row.nalla_neram, rasis };
        }
        return out;
      } catch (error) {
        console.warn('[store] archive read failed:', error.message);
        return {};
      }
    },

    /** Archive one source's scrape for a day (the daily cron keeps the archive growing). */
    async putArchive(iso, source, { url, nallaNeram, predictions }) {
      const count = Object.keys(predictions).length;
      if (!count) return;
      try {
        await call('rasipalan_archive_day?on_conflict=day,source', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            day: iso, source, status: count === 12 ? 'ok' : 'review', url: url || null,
            nalla_neram: nallaNeram || null, method: 'scrape', fetched_at: new Date().toISOString(),
          }),
        });
        await call('rasipalan_archive?on_conflict=day,source,rasi', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(Object.entries(predictions).map(([rasi, text]) => ({ day: iso, source, rasi, text }))),
        });
      } catch (error) {
        console.warn('[store] archive write failed:', error.message);
      }
    },
  };
}

export { createStore };
