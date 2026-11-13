#!/usr/bin/env node
/**
 * Download the daily calendar sheet images from tamildailycalendar.com into
 * backend/.cache/maha/<year>/<DDMMYYYY>.jpg, for reading by maha-ocr.js.
 *
 *   node scripts/maha-download.js [--from 2005-01-01] [--to 2027-12-31] [--gap 1500] [--reverse]
 *
 * One request every --gap ms (default 1.5 s; robots.txt allows everything).
 * --reverse downloads newest first (to stay ahead of maha-ocr.js).
 * Resumable: files already on disk and days already known to be missing are
 * skipped. Missing days (the site answers 404 with an HTML page) are listed in
 * .cache/maha/missing.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { CACHE_DIR, daysBetween, parseArgs, politeFetch } from './lib/common.js';

export const MAHA_DIR = path.join(CACHE_DIR, 'maha');
const MISSING_FILE = path.join(MAHA_DIR, 'missing.json');
const REFERER = 'https://www.tamildailycalendar.com/tamil_daily_calendar.php';

/**
 * '2026-11-12' -> { url, file }. The site names files D + MM + YYYY: the day is
 * not zero-padded, the month is ("4112018.jpg", "15062027.jpg").
 */
export function sheetFor(day) {
  const [y, m, d] = day.split('-');
  const name = `${Number(d)}${m}${y}.jpg`;
  return { url: `https://www.tamildailycalendar.com/${y}/${name}`, file: path.join(MAHA_DIR, y, name) };
}

async function main() {
  const args = parseArgs();
  const from = args.from || '2005-01-01';
  const to = args.to || '2027-12-31';
  const gapMs = Number(args.gap) || 1500;
  fs.mkdirSync(MAHA_DIR, { recursive: true });
  const missing = new Set(fs.existsSync(MISSING_FILE) ? JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8')) : []);

  let downloaded = 0;
  let skipped = 0;
  let newlyMissing = 0;
  let failures = 0;
  const started = Date.now();
  const all = [...daysBetween(from, to)];
  if (args.reverse) all.reverse();
  for (const [i, day] of all.entries()) {
    const { url, file } = sheetFor(day);
    if (fs.existsSync(file) || missing.has(day)) {
      skipped++;
      continue;
    }
    try {
      const response = await politeFetch(url, { gapMs, headers: { referer: REFERER } });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.startsWith('image/')) {
        missing.add(day);
        newlyMissing++;
        if (newlyMissing % 20 === 0) fs.writeFileSync(MISSING_FILE, JSON.stringify([...missing].sort()));
      } else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.part`, Buffer.from(await response.arrayBuffer()));
        fs.renameSync(`${file}.part`, file);
        downloaded++;
      }
    } catch (error) {
      failures++;
      console.warn(`${day}: ${error.message}`);
    }
    if ((downloaded + newlyMissing) % 100 === 0 && downloaded + newlyMissing > 0) {
      const rate = (Date.now() - started) / (downloaded + newlyMissing);
      const left = Math.round(((all.length - i) * rate) / 60_000);
      console.log(`${day}: ${downloaded} downloaded, ${newlyMissing} missing, ${skipped} skipped — ~${left} min left`);
    }
  }
  fs.writeFileSync(MISSING_FILE, JSON.stringify([...missing].sort()));
  console.log(`Done: ${downloaded} downloaded, ${newlyMissing} newly missing (${missing.size} total), ${skipped} already present, ${failures} failed (re-run to retry).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
