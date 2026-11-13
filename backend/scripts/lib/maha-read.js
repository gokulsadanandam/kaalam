/**
 * Read the one-word rasi palan column from a daily calendar sheet image.
 *
 *   tesseractRead(file)  free, local: Tesseract (Tamil, tessdata_best) on the right-hand strip
 *   replicateRead(file)  Gemini 2.5 Flash on Replicate, thinking off, returns JSON
 *
 * Both return { words: { mesham: 'அன்பு', … }, raw, costUsd }. A result is
 * trusted only when all 12 rasis have a plausible single Tamil word
 * (see isClean); the caller decides what to do otherwise.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { CACHE_DIR } from './common.js';

const run = promisify(execFile);

export const RASI_KEYS = ['mesham', 'rishabam', 'mithunam', 'kadagam', 'simmam', 'kanni', 'thulam', 'viruchigam', 'dhanusu', 'magaram', 'kumbam', 'meenam'];
export const RASI_TAMIL = ['மேஷம்', 'ரிஷபம்', 'மிதுனம்', 'கடகம்', 'சிம்மம்', 'கன்னி', 'துலாம்', 'விருச்சிகம்', 'தனுசு', 'மகரம்', 'கும்பம்', 'மீனம்'];

/**
 * Stems that identify each rasi in OCR text, including the abbreviations the
 * sheets print ("விருச்சி", "மிதுன") and common OCR confusions.
 */
const RASI_STEMS = [
  ['மேஷ', 'மேட', 'மெஷ', 'மஷ'],
  ['ரிஷப', 'ரிஷ', 'இடப', 'ரிவ'],
  ['மிதுன', 'மிது'],
  ['கடகம', 'கடக'],
  ['சிம்ம', 'சிம்'],
  ['கன்னி'],
  ['துலாம', 'துலா'],
  ['விருச்சி', 'விருச்', 'விருச'],
  ['தனுசு', 'தனுச', 'தனு'],
  ['மகரம', 'மகர'],
  ['கும்ப'],
  ['மீனம', 'மீன'],
];

const TESSERACT = process.env.TESSERACT_PATH || 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
const TESSDATA = path.join(CACHE_DIR, 'tessdata');

const TAMIL_WORD = /[\u0B80-\u0BFF]+/gu;

/** Grapheme-ish clusters (base + combining marks) for edit distance on Tamil. */
export function clusters(word) {
  return word.match(/[\u0B85-\u0BB9][\u0BBE-\u0BCD\u0BD7]*|./gu) || [];
}

export function editDistance(a, b) {
  const x = clusters(a);
  const y = clusters(b);
  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  return dp[x.length][y.length];
}

/** Nearest known word within one cluster edit (two for long words), else null. */
export function snapToVocabulary(word, vocabulary) {
  if (!word) return null;
  if (vocabulary.has(word)) return word;
  let best = null;
  let bestDistance = Infinity;
  for (const known of vocabulary) {
    const d = editDistance(word, known);
    if (d < bestDistance) {
      best = known;
      bestDistance = d;
    }
  }
  const allowed = clusters(word).length >= 5 ? 2 : 1;
  return bestDistance <= allowed ? best : null;
}

/**
 * Every (rasi, word) pair in a line of OCR text. Grid layouts print several
 * pairs on one line ("மேஷம் இன்சொல் சிம்மம் அநுகூலம் தனுசு கோபம்"). The
 * word must follow its rasi name, skipping only one-letter debris and
 * never crossing another rasi name ("கடகே | ஜூ [தனுசு - வரவு" gives only Dhanusu).
 */
function rasiPairs(line) {
  const tokens = line.replace(/[\u200C\u200D]/g, '').match(TAMIL_WORD) || [];
  const rasiOf = (token) => RASI_STEMS.findIndex((stems) => stems.some((s) => token.startsWith(s) || token.slice(1).startsWith(s)));
  const pairs = [];
  for (let t = 0; t < tokens.length; t++) {
    const rasi = rasiOf(tokens[t]);
    if (rasi < 0) continue;
    for (let n = t + 1; n < Math.min(tokens.length, t + 3); n++) {
      if (rasiOf(tokens[n]) >= 0) break;
      if (clusters(tokens[n]).length >= 2) {
        pairs.push({ rasi, word: tokens[n] });
        t = n;
        break;
      }
    }
  }
  return pairs;
}

/** At most this many Tesseract processes at once (it is CPU-bound; parallel Replicate calls are not). */
const TESSERACT_SLOTS = Math.max(1, Number(process.env.TESSERACT_SLOTS) || os.cpus().length - 1);
let tesseractRunning = 0;
const tesseractWaiting = [];

async function withTesseractSlot(fn) {
  if (tesseractRunning >= TESSERACT_SLOTS) await new Promise((resolve) => tesseractWaiting.push(resolve));
  tesseractRunning++;
  try {
    return await fn();
  } finally {
    tesseractRunning--;
    tesseractWaiting.shift()?.();
  }
}

/** Tesseract on the whole enlarged sheet (the rasi box moves between layouts), automatic page segmentation. */
export async function tesseractRead(file) {
  return withTesseractSlot(() => tesseractReadNow(file));
}

async function tesseractReadNow(file) {
  const { width } = await sharp(file).metadata();
  const scale = width < 700 ? 3 : 2;
  const tmp = path.join(os.tmpdir(), `kaalam-ocr-${process.pid}-${Date.now()}.png`);
  await sharp(file).resize({ width: width * scale, kernel: 'lanczos3' }).grayscale().normalise().sharpen().png().toFile(tmp);
  try {
    const { stdout } = await run(TESSERACT, [tmp, 'stdout', '-l', 'tam', '--psm', '3', '--tessdata-dir', TESSDATA], {
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    const words = {};
    for (const line of stdout.split(/\r?\n/)) {
      for (const { rasi, word } of rasiPairs(line)) {
        if (!words[RASI_KEYS[rasi]]) words[RASI_KEYS[rasi]] = word;
      }
    }
    return { words, raw: stdout, costUsd: 0 };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Gemini 2.5 Flash list prices (Replicate bills official models per token).
const PRICE_INPUT_PER_TOKEN = 0.30 / 1e6;
const PRICE_OUTPUT_PER_TOKEN = 2.50 / 1e6;
// Used when a prediction reports no token counts: a generous upper bound.
const FALLBACK_COST = 0.0015;

const PROMPT = `This is a Tamil daily calendar sheet. Find the இராசிபலன் (rasi palan) section: it lists the 12 rasis (${RASI_TAMIL.join(', ')}; names may be abbreviated, e.g. விருச்சி) and next to each name a one-word prediction. The section may be a single column or a grid with several rasi-word pairs per row; always pair each rasi with the word printed immediately after its own name.
Reply with only a JSON object whose keys are the 12 rasi names exactly as listed above and whose values are the words copied exactly as printed in Tamil. Use null for an unreadable word.`;

/**
 * Replicate allows 6 predictions a minute while the account holds under $5.
 * REPLICATE_GAP_MS=0 sends without a gap; the first "less than $5" 429 switches
 * every worker to the slow gap automatically.
 */
const SLOW_GAP_MS = 10_500;
let gapMs = process.env.REPLICATE_GAP_MS !== undefined ? Number(process.env.REPLICATE_GAP_MS) : SLOW_GAP_MS;
let nextSlotAt = 0;

/** Reserve the next send time, so concurrent workers never share a slot. */
async function waitForSlot() {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + gapMs;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

async function createPrediction(token, body) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await waitForSlot();
    const response = await fetch('https://api.replicate.com/v1/models/google/gemini-2.5-flash/predictions', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'wait=60' },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (response.status === 429) {
      if (gapMs < SLOW_GAP_MS && /less than \$5/.test(json.detail || '')) {
        gapMs = SLOW_GAP_MS;
        console.warn('Replicate credit is below $5: switching to 6 predictions a minute.');
      }
      await new Promise((resolve) => setTimeout(resolve, ((json.retry_after || 10) + 1) * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Replicate ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error('Replicate: still rate limited after 8 attempts');
}

export async function replicateRead(file, { attempts = 3 } = {}) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set in backend/.env');
  const { width } = await sharp(file).metadata();
  // Gemini bills an image by tiles, not pixels: enlarging small old scans costs nothing and reads better.
  const jpeg = await sharp(file).resize({ width: Math.max(1000, Math.min(width, 1400)), kernel: 'lanczos3' }).jpeg({ quality: 90 }).toBuffer();
  const merged = {};
  let costUsd = 0;
  const tokens = { input: 0, output: 0 };
  const raws = [];
  let lastError = null;
  for (let attempt = 0; attempt < attempts && Object.keys(merged).length < RASI_KEYS.length; attempt++) {
    let result;
    try {
      result = await replicateOnce(token, jpeg, attempt === 0 ? 0 : 0.4);
    } catch (error) {
      lastError = error;
      continue; // e.g. "high demand": try again
    }
    costUsd += result.costUsd;
    tokens.input += result.tokens.input || 0;
    tokens.output += result.tokens.output || 0;
    raws.push(result.raw);
    for (const [key, word] of Object.entries(result.words)) if (!merged[key]) merged[key] = word;
  }
  // Nothing read and every attempt failed: report it, so the day is retried later instead of saved.
  if (!raws.length && lastError) throw lastError;
  return { words: merged, raw: raws.join('\n---\n'), costUsd, tokens };
}

/** Rasi key for a reply key ("மேஷம்", "விருச்சி", "mesham", "1"). */
function rasiKeyOf(key) {
  const k = String(key).trim();
  if (/^\d+$/.test(k)) return RASI_KEYS[Number(k) - 1] || null;
  if (RASI_KEYS.includes(k.toLowerCase())) return k.toLowerCase();
  const index = RASI_STEMS.findIndex((stems) => stems.some((s) => k.startsWith(s)));
  return index >= 0 ? RASI_KEYS[index] : null;
}

/** { rasiKey: word } from a JSON-object reply; tolerant of a missing closing brace or code fences. */
function wordsFromReply(text) {
  const words = {};
  for (const m of text.matchAll(/"([^"]+)"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|null)/g)) {
    const key = rasiKeyOf(m[1]);
    const word = m[2] ? m[2].replace(/[\u200C\u200D]/g, '').match(TAMIL_WORD)?.join('') : null;
    if (key && word && !words[key]) words[key] = word;
  }
  return words;
}

async function replicateOnce(token, jpeg, temperature) {
  let prediction = await createPrediction(token, {
    input: {
      prompt: PROMPT,
      images: [`data:image/jpeg;base64,${jpeg.toString('base64')}`],
      temperature,
      thinking_budget: 0,
      // Replicate stops Gemini at ~16 tokens with a 400 limit; 12 Tamil pairs need ~150.
      max_output_tokens: 4000,
    },
  });
  for (let i = 0; i < 30 && ['starting', 'processing'].includes(prediction.status); i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(prediction.urls.get, { headers: { authorization: `Bearer ${token}` } });
    prediction = await response.json();
  }
  if (prediction.status !== 'succeeded') throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error || ''}`);

  const text = Array.isArray(prediction.output) ? prediction.output.join('') : String(prediction.output || '');
  const m = prediction.metrics || {};
  const costUsd = m.token_input_count != null && m.token_output_count != null
    ? m.token_input_count * PRICE_INPUT_PER_TOKEN + m.token_output_count * PRICE_OUTPUT_PER_TOKEN
    : FALLBACK_COST;
  return { words: wordsFromReply(text), raw: text, costUsd, tokens: { input: m.token_input_count, output: m.token_output_count } };
}

/** All 12 rasis present, each a single Tamil word of 2–7 clusters. */
export function isClean(words) {
  return RASI_KEYS.every((k) => {
    const w = words[k];
    return typeof w === 'string' && /^[\u0B80-\u0BFF]+$/u.test(w) && clusters(w).length >= 2 && clusters(w).length <= 7;
  });
}
