/**
 * Supabase store (lib/store.js) against a local fake PostgREST server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStore } from '../lib/store.js';

function fakePostgrest() {
  const rows = new Map();
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET') {
        const day = (url.searchParams.get('day') || '').replace(/^eq\./, '');
        const row = rows.get(day);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(row ? [row] : []));
      }
      if (req.method === 'POST') {
        const row = JSON.parse(body);
        rows.set(row.day, row);
        res.writeHead(201);
        return res.end();
      }
      res.writeHead(405);
      return res.end();
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, rows, requests, url: `http://127.0.0.1:${server.address().port}` })),
  );
}

test('createStore is disabled without URL and key', () => {
  assert.equal(createStore({}), null);
  assert.equal(createStore({ SUPABASE_URL: 'https://x.supabase.co' }), null);
});

test('store round-trips a day through PostgREST with an upsert', async () => {
  const fake = await fakePostgrest();
  try {
    const store = createStore({ SUPABASE_URL: `${fake.url}/`, SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service.role' });
    assert.equal(await store.get('2026-11-12'), null);

    const scrape = { predictions: { mesham: 'உரை' }, nallaNeram: 'காலை 7.45 - 8.45', source: 'www.dailythanthi.com', errors: [] };
    await store.put('2026-11-12', scrape);
    assert.deepEqual(await store.get('2026-11-12'), { ...scrape, errors: [] });

    const post = fake.requests.find((r) => r.method === 'POST');
    assert.equal(post.url, '/rest/v1/daily_scrape?on_conflict=day');
    assert.match(post.headers.prefer, /resolution=merge-duplicates/);
    assert.equal(post.headers.apikey, 'eyJ.service.role');
    assert.equal(post.headers.authorization, 'Bearer eyJ.service.role');
    assert.equal(JSON.parse(post.body).rasi_count, 1);
  } finally {
    fake.server.close();
  }
});

test('new-style secret keys go in apikey only, and failures are cache misses', async () => {
  const fake = await fakePostgrest();
  try {
    const store = createStore({ SUPABASE_URL: fake.url, KAALAM_SUPABASE_KEY: 'sb_secret_abc' });
    await store.get('2026-11-12');
    assert.equal(fake.requests[0].headers.apikey, 'sb_secret_abc');
    assert.equal(fake.requests[0].headers.authorization, undefined);
  } finally {
    fake.server.close();
  }

  const unreachable = createStore({ SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'k' });
  assert.equal(await unreachable.get('2026-11-12'), null);
  await unreachable.put('2026-11-12', { predictions: {} }); // must not throw
});
