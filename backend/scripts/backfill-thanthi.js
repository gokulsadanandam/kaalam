#!/usr/bin/env node
/**
 * Backfill Daily Thanthi's daily rasi palan into public.rasipalan_archive.
 *
 *   node scripts/backfill-thanthi.js [--dry-run] [--force] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *                                    [--search]   also page the site search for stories the collection no longer lists
 *
 * Source: the paper's public JSON API (robots.txt: Allow /api/v1/collections/),
 * paged newest-first, 50 stories per request, one request per second. Only
 * stories under astrology/today-rasi-palan/ are used. Re-running skips days
 * already archived (status ok) unless --force.
 */
import process from 'node:process';
import { _internals } from '../index.js';
import { archivedDays, connect, parseArgs, politeFetch, saveDay } from './lib/common.js';

const { parseHtml, RASIS } = _internals;
const SOURCE = 'dailythanthi';
const API = 'https://www.dailythanthi.com/api/v1';
const PAGE = 50;

const TAMIL_MONTHS = ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'];
const ENGLISH_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const iso = (y, m, d) => {
  const date = new Date(Date.UTC(+y, +m - 1, +d));
  return date.getUTCFullYear() === +y && date.getUTCMonth() === +m - 1 && date.getUTCDate() === +d
    ? date.toISOString().slice(0, 10)
    : null;
};

/** The day a story is *for*: from its headline or slug, else its IST publish date. */
export function storyDay(story) {
  const published = new Date(story['published-at'] + 330 * 60_000).toISOString().slice(0, 10);
  const headline = String(story.headline || '');
  const slug = String(story.slug || '');
  const candidates = [];
  let m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(headline);
  if (m) candidates.push(iso(m[3], m[2], m[1]));
  m = new RegExp(`(${TAMIL_MONTHS.join('|')})\\s*(\\d{1,2}),?\\s*(\\d{4})`, 'u').exec(headline);
  if (m) candidates.push(iso(m[3], TAMIL_MONTHS.indexOf(m[1]) + 1, m[2]));
  m = new RegExp(`(${ENGLISH_MONTHS.join('|')})-(\\d{1,2})-(\\d{4})`).exec(slug);
  if (m) candidates.push(iso(m[3], ENGLISH_MONTHS.indexOf(m[1]) + 1, m[2]));
  m = /-(\d{2})(\d{2})(\d{4})(?:-\d+)?$/.exec(slug);
  if (m) candidates.push(iso(m[3], m[2], m[1]));
  // Trust a stated date only if it is near the publish date (typos happen).
  const near = candidates.find((c) => c && Math.abs(Date.parse(c) - Date.parse(published)) <= 2 * 86_400_000);
  return { day: near || published, stated: candidates.find(Boolean) || null, published };
}

function storyHtml(story) {
  return (story.cards || [])
    .flatMap((card) => card['story-elements'] || [])
    .filter((e) => e.type === 'text' && e.text)
    .map((e) => e.text)
    .join('\n');
}

async function* collectionStories() {
  for (let offset = 0; ; offset += PAGE) {
    const response = await politeFetch(`${API}/collections/astrology?limit=${PAGE}&offset=${offset}`);
    if (!response.ok) throw new Error(`collection offset ${offset}: HTTP ${response.status}`);
    const { items = [] } = await response.json();
    if (!items.length) return;
    for (const item of items) if (item.story) yield item.story;
  }
}

async function* searchStories() {
  const q = encodeURIComponent('இன்றைய ராசிபலன்');
  for (let offset = 0; ; offset += PAGE) {
    const response = await politeFetch(`${API}/search?q=${q}&limit=${PAGE}&offset=${offset}&sort=latest-published`);
    if (!response.ok) return;
    const { results } = await response.json();
    const stories = results?.stories || [];
    if (!stories.length) return;
    for (const story of stories) yield story;
  }
}

async function fullStory(story) {
  if (story.cards?.length) return story;
  const response = await politeFetch(`${API}/stories-by-slug?slug=${encodeURIComponent(story.slug)}`);
  return response.ok ? (await response.json()).story : story;
}

async function main() {
  const args = parseArgs();
  const dryRun = Boolean(args['dry-run']);
  const db = dryRun ? null : await connect();
  const done = db && !args.force ? await archivedDays(db, SOURCE, ['ok']) : new Set();
  const from = args.from || '1900-01-01';
  const to = args.to || '2100-12-31';

  const best = new Map(); // day -> { story, predictions, nallaNeram }
  const seen = new Set();
  let scanned = 0;
  let oldestSeen = null;

  const sources = args.search ? [collectionStories(), searchStories()] : [collectionStories()];
  for (const stream of sources) {
    for await (const listed of stream) {
      if (seen.has(listed.id)) continue;
      seen.add(listed.id);
      scanned++;
      if (!String(listed.slug).startsWith('astrology/today-rasi-palan/')) continue;
      const { day, stated } = storyDay(listed);
      oldestSeen = !oldestSeen || day < oldestSeen ? day : oldestSeen;
      if (day < from || day > to || done.has(day)) continue;
      const story = await fullStory(listed);
      const { predictions, nallaNeram } = parseHtml(storyHtml(story));
      const count = Object.keys(predictions).length;
      const previous = best.get(day);
      if (!previous || count > previous.count) best.set(day, { story, predictions, nallaNeram, count, stated });
      if (scanned % 100 === 0) console.log(`… scanned ${scanned} stories, ${best.size} days so far (oldest ${oldestSeen})`);
    }
  }

  let ok = 0;
  let review = 0;
  for (const [day, { story, predictions, nallaNeram, count, stated }] of [...best].sort()) {
    const status = count === RASIS.length ? 'ok' : 'review';
    if (status === 'ok') ok++;
    else review++;
    const notes = [
      count < RASIS.length ? `parsed ${count}/12 rasis` : null,
      stated && stated !== day ? `headline says ${stated}` : null,
    ].filter(Boolean).join('; ') || null;
    if (dryRun) {
      if (status !== 'ok' || notes) console.log(day, status, notes || '');
      continue;
    }
    await saveDay(
      db,
      { day, source: SOURCE, status, url: `https://www.dailythanthi.com/${story.slug}`, nallaNeram, method: 'api', notes },
      Object.entries(predictions).map(([rasi, text]) => ({ rasi, text })),
    );
  }

  console.log(`\nScanned ${scanned} stories; oldest daily story ${oldestSeen}.`);
  console.log(`${dryRun ? 'Would save' : 'Saved'} ${ok + review} days: ${ok} complete, ${review} for review. Skipped ${done.size} already archived.`);
  if (db) await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
