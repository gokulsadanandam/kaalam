#!/usr/bin/env node
/**
 * Read the one-word rasi palan from downloaded calendar sheets
 * (.cache/maha, see maha-download.js) and archive it as source 'tamildailycalendar'.
 *
 *   node scripts/maha-ocr.js --pilot [--count 32]      trial: Tesseract and Replicate on a sample, no DB writes;
 *                                                      writes .cache/maha-pilot.json and contact sheets to check by eye
 *   node scripts/maha-ocr.js [--from …] [--to …] [--budget 2.85] [--concurrency 8] [--oldest] [--retry-review] [--force]
 *                                                      full run, newest day first: Replicate (Gemini 2.5 Flash) reads
 *                                                      each sheet, Tesseract cross-checks; stops when --budget dollars
 *                                                      (summed in the archive table) are spent. Resumable.
 *                                                      --concurrency > 1 only with ≥ $5 Replicate credit and REPLICATE_GAP_MS=0
 *                                                      (below $5 Replicate allows 6 predictions a minute).
 *
 * A sheet is saved as 'ok' only with 12 clean words; otherwise 'review' with
 * whatever was read. Days the site does not have are saved as 'missing'.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { CACHE_DIR, archivedDays, connectPool, daysBetween, parseArgs, politeFetch, saveDay } from './lib/common.js';
import { RASI_KEYS, isClean, replicateRead, tesseractRead } from './lib/maha-read.js';
import { MAHA_DIR, sheetFor } from './maha-download.js';

const SOURCE = 'tamildailycalendar';
const VOCAB_FILE = path.join(CACHE_DIR, 'maha-vocabulary.json');
const REFERER = 'https://www.tamildailycalendar.com/tamil_daily_calendar.php';

/** Words seen on sheets, with counts. Grows from Replicate's clean reads. */
function loadVocabulary() {
  const counts = fs.existsSync(VOCAB_FILE) ? JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8')) : {};
  return counts;
}
function saveVocabulary(counts) {
  fs.writeFileSync(VOCAB_FILE, JSON.stringify(counts, null, 0));
}

async function ensureSheet(day) {
  const { url, file } = sheetFor(day);
  if (fs.existsSync(file)) return file;
  const response = await politeFetch(url, { gapMs: 1500, headers: { referer: REFERER } });
  if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/')) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

function pilotDays(count) {
  const days = [];
  for (let y = 2005; y <= 2027; y++) {
    days.push(`${y}-${String(1 + ((y * 5) % 12)).padStart(2, '0')}-${String(3 + ((y * 7) % 25)).padStart(2, '0')}`);
  }
  const extra = ['2026-11-12', '2026-11-14', '2027-03-08', '2025-07-21', '2018-12-30', '2012-02-29', '2009-08-15', '2021-05-03', '2027-12-31'];
  return [...days, ...extra].slice(0, count);
}

/** Whole sheets, three per image, labelled, for checking the readings by eye. */
async function contactSheets(rows, prefix) {
  const perSheet = 3;
  const files = [];
  for (let s = 0; s < rows.length; s += perSheet) {
    const batch = rows.slice(s, s + perSheet).filter((r) => r.file);
    const tiles = await Promise.all(batch.map((r) => sharp(r.file).resize({ height: 600 }).jpeg().toBuffer()));
    const widths = await Promise.all(tiles.map(async (t) => (await sharp(t).metadata()).width));
    const total = widths.reduce((a, b) => a + b + 10, 0);
    let x = 0;
    const composites = [];
    tiles.forEach((tile, i) => {
      composites.push({ input: tile, left: x, top: 40 });
      composites.push({
        input: Buffer.from(`<svg width="${widths[i]}" height="36"><text x="4" y="26" font-size="24" font-family="Arial" fill="red">${batch[i].day}</text></svg>`),
        left: x,
        top: 0,
      });
      x += widths[i] + 10;
    });
    const out = path.join(CACHE_DIR, `${prefix}-${s / perSheet + 1}.jpg`);
    await sharp({ create: { width: total, height: 650, channels: 3, background: '#ffffff' } }).composite(composites).jpeg({ quality: 80 }).toFile(out);
    files.push(out);
  }
  return files;
}

async function pilot(args) {
  const rows = [];
  let cost = 0;
  const counts = loadVocabulary();
  for (const day of pilotDays(Number(args.count) || 32)) {
    const file = await ensureSheet(day);
    if (!file) {
      rows.push({ day, missing: true });
      console.log(day, 'missing on the site');
      continue;
    }
    const t = await tesseractRead(file);
    let r;
    try {
      r = await replicateRead(file);
    } catch (error) {
      r = { words: {}, error: error.message, costUsd: 0 };
    }
    cost += r.costUsd;
    if (isClean(r.words)) for (const w of Object.values(r.words)) counts[w] = (counts[w] || 0) + 1;
    const agree = RASI_KEYS.filter((k) => t.words[k] && t.words[k] === r.words[k]).length;
    rows.push({ day, file, tesseract: t.words, replicate: r.words, replicateRaw: r.raw, replicateError: r.error, tesseractFound: Object.keys(t.words).length, agree, costUsd: r.costUsd, tokens: r.tokens });
    console.log(`${day}: tesseract ${Object.keys(t.words).length}/12, replicate ${Object.keys(r.words).length}/12 ${r.error || ''}, agree ${agree}, $${r.costUsd.toFixed(5)}`);
  }
  saveVocabulary(counts);
  fs.writeFileSync(path.join(CACHE_DIR, 'maha-pilot.json'), JSON.stringify(rows, null, 1));
  const sheets = await contactSheets(rows.filter((r) => !r.missing), 'maha-pilot');
  const read = rows.filter((r) => !r.missing);
  console.log(`\nPilot: ${read.length} sheets, ${rows.length - read.length} missing. Replicate cost $${cost.toFixed(4)} (≈$${(cost / Math.max(1, read.length)).toFixed(5)}/sheet).`);
  console.log(`Tesseract complete (12/12): ${read.filter((r) => r.tesseractFound === 12).length}; Replicate complete: ${read.filter((r) => isClean(r.replicate)).length}.`);
  console.log('Contact sheets:', sheets.join(', '));
}

async function full(args) {
  const budget = Number(args.budget ?? 2.85);
  const concurrency = Math.max(1, Number(args.concurrency) || 1);
  const pool = connectPool(concurrency + 1);
  const done = args.force ? new Set() : await archivedDays(pool, SOURCE, args['retry-review'] ? ['ok', 'missing'] : ['ok', 'missing', 'review']);
  const missingFile = path.join(MAHA_DIR, 'missing.json');
  const missingOnSite = new Set(fs.existsSync(missingFile) ? JSON.parse(fs.readFileSync(missingFile, 'utf8')) : []);
  const counts = loadVocabulary();
  const { rows } = await pool.query('select coalesce(sum(cost_usd), 0)::float as spent from public.rasipalan_archive_day where source = $1', [SOURCE]);
  let spent = rows[0].spent;
  const tally = { ok: 0, review: 0, missing: 0, failed: 0, kept: 0, agreeWords: 0, words: 0 };
  const days = [...daysBetween(args.from || '2005-01-01', args.to || '2027-12-31')];
  if (!args.oldest) days.reverse(); // newest first: the most useful years get the budget

  // --reread-ok-before <ISO time>: also re-read 'ok' days saved before then (an older, weaker prompt).
  // A re-read replaces the old words only when it comes back clean.
  const rereadOk = new Set();
  if (args['reread-ok-before']) {
    const { rows: old } = await pool.query(
      "select to_char(day, 'YYYY-MM-DD') as day from public.rasipalan_archive_day where source = $1 and status = 'ok' and fetched_at < $2",
      [SOURCE, args['reread-ok-before']],
    );
    for (const r of old) {
      rereadOk.add(r.day);
      done.delete(r.day);
    }
  }
  const queue = days.filter((d) => !done.has(d));
  let budgetHit = false;

  console.log(`${queue.length} days to read with ${concurrency} at a time; Replicate spent so far $${spent.toFixed(3)} of $${budget}.`);

  async function readDay(db, day) {
    const { url } = sheetFor(day);
    const file = missingOnSite.has(day) ? null : await ensureSheet(day);
    if (!file) {
      await saveDay(db, { day, source: SOURCE, status: 'missing', url, notes: 'not on tamildailycalendar.com' });
      tally.missing++;
      return;
    }
    // Tesseract runs while the Replicate call is in flight; it only cross-checks.
    const [t, r] = await Promise.all([
      tesseractRead(file).catch(() => ({ words: {} })),
      replicateRead(file).catch((error) => ({ words: {}, costUsd: 0, error })),
    ]);
    if (r.error) {
      console.warn(`${day}: replicate failed (left for the next run): ${r.error.message}`);
      tally.failed++;
      return;
    }
    spent += r.costUsd;
    const status = isClean(r.words) ? 'ok' : 'review';
    tally[status]++;
    if (status === 'ok') {
      for (const w of Object.values(r.words)) counts[w] = (counts[w] || 0) + 1;
      saveVocabulary(counts);
    }
    const rasis = Object.entries(r.words).map(([rasi, word]) => {
      const agrees = t.words[rasi] === word;
      tally.words++;
      if (agrees) tally.agreeWords++;
      return { rasi, word, confidence: agrees ? 0.95 : 0.85 };
    });
    if (status !== 'ok' && rereadOk.has(day)) {
      // Keep the earlier complete reading; only record what this attempt cost.
      await db.query('update public.rasipalan_archive_day set cost_usd = cost_usd + $3 where day = $1 and source = $2', [day, SOURCE, r.costUsd]);
      tally.kept++;
      return;
    }
    await saveDay(
      db,
      { day, source: SOURCE, status, url, method: 'replicate', costUsd: r.costUsd, notes: status === 'review' ? `read ${rasis.length}/12` : null },
      rasis,
    );
    if ((tally.ok + tally.review) % 25 === 0) {
      console.log(`${day}: ok ${tally.ok}, review ${tally.review}, missing ${tally.missing}; Tesseract agrees on ${tally.agreeWords}/${tally.words} words; spent $${spent.toFixed(3)}`);
    }
  }

  // Each worker takes the next day off the shared queue and saves through its own connection.
  async function worker() {
    const db = await pool.connect();
    try {
      while (queue.length) {
        if (spent >= budget) {
          if (!budgetHit) console.warn(`Budget $${budget} reached at ${queue[0]}: stopping. Re-run with a higher --budget to continue.`);
          budgetHit = true;
          return;
        }
        const day = queue.shift();
        try {
          await readDay(db, day);
        } catch (error) {
          console.warn(`${day}: ${error.message} (left for the next run)`);
        }
      }
    } finally {
      db.release();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  await pool.end();
  console.log(`Done: ok ${tally.ok}, review ${tally.review}, missing ${tally.missing}, failed ${tally.failed} (re-run to retry), kept earlier reading ${tally.kept}; Replicate spent $${spent.toFixed(3)} of $${budget}.`);
}

const args = parseArgs();
(args.pilot ? pilot(args) : full(args)).catch((error) => {
  console.error(error);
  process.exit(1);
});
