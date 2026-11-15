/**
 * ============================================================================
 *  Kaalam — Daily Tamil Rasi Palan & Panchangam API
 * ============================================================================
 *
 *  GET /api/rasipalan?rasi=mesham[&date=2026-11-11&lat=13.08&lon=80.27&tz=Asia/Kolkata]
 *  GET /api/panchangam[?date=2026-11-11&lat=13.08&lon=80.27&tz=Asia/Kolkata]
 *
 *  Without usable lat+lon the Chennai reference location is used, reported as
 *  `location.isFallback: true` with a `reason` (lib/location.js).
 *
 *  Data pipeline (per request):
 *
 *    1. normaliseRasi()      English / Tamil / Western-zodiac query  ->  canonical key
 *    2. getDailyScrape()     IST-date keyed cache  ->  (miss) scrape configured sources
 *         ├─ fetchSource()        axios GET with tight timeout + size cap
 *         ├─ parseRss()           <item> grids (title = rasi, description = palan)
 *         └─ parseHtml()          heading/sibling, inline <strong>, "rasi: text" paragraphs
 *    3. computePanchangam()  sunrise/sunset (lib/time.js)  ->  Rahu Kalam, Yamagandam,
 *                            Kuligai, Abhijit; nallaNeramFor() + Gowri (lib/nallaNeram.js)
 *    4. computeAstroDay()    Sun/Moon longitudes  ->  tithi, nakshatram, yogam, karanam,
 *                            chandrashtamam, Tamil date (lib/panchangam.js), plus an
 *                            original rasi palan from the Moon's transit (lib/rasiPalanGenerator.js)
 *    5. buildPayload()       merges 2 + 3 + 4, applies localised Tamil fallbacks, scores
 *                            how far scraped and generated readings differ (lib/compare.js),
 *                            returns the exact JSON shape the Android client decodes.
 *
 *  Why Rahu Kalam is *computed* rather than scraped:
 *    Rahu Kalam is defined as one fixed eighth of the daylight span (sunrise ->
 *    sunset), chosen by weekday. Computing it from real sunrise/sunset for the
 *    user's coordinates is more accurate than the "6 AM sunrise" tables printed
 *    by most portals, and it can never break when a website changes layout.
 *
 *  Runs as a plain server (`node index.js`) or as a serverless function: the
 *  Express app is exported, and `api/index.js` re-exports it for Vercel.
 * ============================================================================
 */

import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { computeAstroPanchangam, moonPosition, namesFor, RASI_NAMES } from './lib/panchangam.js';
import { generateRasiPalan, gocharaTable } from './lib/rasiPalanGenerator.js';
import { diffScore } from './lib/compare.js';
import { createStore } from './lib/store.js';
import { buildTimeline, parseNallaNeramRanges } from './lib/timeline.js';
import { localDateIn, offsetForDay, solarTimes, isValidTimeZone, tzOffsetMinutes } from './lib/time.js';
import { resolveLocation, inTamilNadu } from './lib/location.js';
import { weekdayNallaNeram, formatTamilRanges, gowriSlots, gowriNallaNeram } from './lib/nallaNeram.js';
import { soolam, sunriseLagna, dayOfYear, seasons, lunarMonth, planetPositions } from './lib/calendar.js';
import MAHA_WORDS_EN from './lib/mahaWordsEn.js';

// ---------------------------------------------------------------------------
// Configuration (all overridable through environment variables)
// ---------------------------------------------------------------------------

const CONFIG = Object.freeze({
  port: Number(process.env.PORT) || 3000,

  /**
   * Comma-separated list of pages to scrape, tried in order. Each may be an
   * HTML article page or an RSS/Atom feed. Use only sources whose terms of
   * use permit automated access, and keep the request rate low (the cache
   * below means each source is hit at most once per `cacheTtlMs`).
   */
  sources: (process.env.RASIPALAN_SOURCES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Sites whose Nalla Neram line is used (they print the same weekday table as
   * the Maha Calendar). Others, e.g. hindutamil.in, follow a different
   * tradition; without a trusted line the weekday table is used.
   */
  nallaNeramHosts: (process.env.NALLA_NERAM_HOSTS || 'dailythanthi.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Third-party paragraphs (newspaper rasi palan) are shown as a credited
   * first-sentence excerpt with a link, as fits a public app. Set
   * THIRD_PARTY_FULL_TEXT=1 for a personal build that shows the full text.
   */
  thirdPartyFullText: process.env.THIRD_PARTY_FULL_TEXT === '1',

  /** Reference location when a request has no usable coordinates: Chennai (see lib/location.js). */
  defaultLat: Number(process.env.DEFAULT_LAT) || 13.0827,
  defaultLon: Number(process.env.DEFAULT_LON) || 80.2707,

  /** Newspapers and the scrape cache follow India's calendar day. */
  newsTimeZone: 'Asia/Kolkata',

  /** Successful scrape cache: 3 hours. Failed scrape cache: 15 minutes. */
  cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 3 * 60 * 60 * 1000,
  failureTtlMs: Number(process.env.FAILURE_TTL_MS) || 15 * 60 * 1000,

  /** Per-source network timeout. Keep well below the serverless limit. */
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS) || 6000,

  /** Generic, honest client identifier. */
  userAgent:
    process.env.SCRAPER_USER_AGENT ||
    'KaalamRasiPalanBot/1.0 (+https://github.com/; daily widget cache, 1 req per source per few hours)',
});

/** Hard cap on how much prediction text we ship to a home-screen widget. */
const MAX_PREDICTION_CHARS = 700;
/** Anything shorter than this is almost certainly a label, not a prediction. */
const MIN_PREDICTION_CHARS = 25;
/** Headings longer than this are paragraphs, not rasi titles. */
const MAX_HEADING_CHARS = 60;

// ---------------------------------------------------------------------------
// Zodiac dictionary
//   key       -> stable ASCII identifier used by the Android client
//   tamil     -> display name sent to the widget
//   variants  -> Tamil spellings seen on real portals (matched on word edges)
//   aliases   -> accepted English query spellings (normalised, letters only)
// ---------------------------------------------------------------------------

const RASIS = Object.freeze([
  {
    key: 'mesham', tamil: 'மேஷம்', english: 'Aries',
    variants: ['மேஷம்', 'மேஷ', 'மேசம்'],
    aliases: ['mesham', 'mesha', 'mesam', 'aries'],
  },
  {
    key: 'rishabam', tamil: 'ரிஷபம்', english: 'Taurus',
    variants: ['ரிஷபம்', 'ரிஷப', 'இடபம்'],
    aliases: ['rishabam', 'rishabham', 'rishaba', 'vrishabam', 'vrishabham', 'idabam', 'taurus'],
  },
  {
    key: 'mithunam', tamil: 'மிதுனம்', english: 'Gemini',
    variants: ['மிதுனம்', 'மிதுன'],
    aliases: ['mithunam', 'mithuna', 'midhunam', 'gemini'],
  },
  {
    key: 'kadagam', tamil: 'கடகம்', english: 'Cancer',
    variants: ['கடகம்', 'கடக'],
    aliases: ['kadagam', 'kadakam', 'katakam', 'karkatakam', 'cancer'],
  },
  {
    key: 'simmam', tamil: 'சிம்மம்', english: 'Leo',
    variants: ['சிம்மம்', 'சிம்ம'],
    aliases: ['simmam', 'simham', 'simha', 'leo'],
  },
  {
    key: 'kanni', tamil: 'கன்னி', english: 'Virgo',
    variants: ['கன்னி'],
    aliases: ['kanni', 'kanya', 'kanniya', 'virgo'],
  },
  {
    key: 'thulam', tamil: 'துலாம்', english: 'Libra',
    variants: ['துலாம்', 'துலா'],
    aliases: ['thulam', 'thula', 'tulam', 'tula', 'libra'],
  },
  {
    key: 'viruchigam', tamil: 'விருச்சிகம்', english: 'Scorpio',
    variants: ['விருச்சிகம்', 'விருச்சிக'],
    aliases: ['viruchigam', 'viruchikam', 'vrischikam', 'vrishchikam', 'vrichigam', 'scorpio'],
  },
  {
    key: 'dhanusu', tamil: 'தனுசு', english: 'Sagittarius',
    variants: ['தனுசு', 'தனுஷ்'],
    aliases: ['dhanusu', 'dhanus', 'dhanush', 'dhanu', 'thanusu', 'sagittarius'],
  },
  {
    key: 'magaram', tamil: 'மகரம்', english: 'Capricorn',
    variants: ['மகரம்', 'மகர'],
    aliases: ['magaram', 'makaram', 'makara', 'capricorn'],
  },
  {
    key: 'kumbam', tamil: 'கும்பம்', english: 'Aquarius',
    variants: ['கும்பம்', 'கும்ப'],
    aliases: ['kumbam', 'kumbham', 'kumbha', 'aquarius'],
  },
  {
    key: 'meenam', tamil: 'மீனம்', english: 'Pisces',
    variants: ['மீனம்', 'மீன'],
    aliases: ['meenam', 'meena', 'minam', 'pisces'],
  },
]);

/** Tamil block U+0B80–U+0BFF covers letters *and* combining vowel signs. */
const TAMIL_CHAR = '[\\u0B80-\\u0BFF]';

/**
 * JS `\b` does not understand Tamil, so we emulate word edges with
 * look-arounds: "கன்னி" must not match inside "கன்னியாகுமரி".
 */
for (const rasi of RASIS) {
  const alternation = rasi.variants
    .slice()
    .sort((a, b) => b.length - a.length) // longest first
    .map(escapeRegExp)
    .join('|');
  rasi.matcher = new RegExp(`(?<!${TAMIL_CHAR})(?:${alternation})(?!${TAMIL_CHAR})`, 'u');
  rasi.prefixMatcher = new RegExp(
    `^\\s*(?:\\d+[.)]\\s*)?(?:${alternation})(?!${TAMIL_CHAR})\\s*(?:ராசி(?:க்கு)?)?\\s*(?:அன்பர்களே)?\\s*[:：\\-–—]\\s*`,
    'u',
  );
}

/** O(1) lookup: every alias and Tamil spelling -> rasi record. */
const ALIAS_INDEX = new Map();
for (const rasi of RASIS) {
  for (const alias of [rasi.key, ...rasi.aliases]) ALIAS_INDEX.set(alias, rasi);
  for (const variant of rasi.variants) ALIAS_INDEX.set(variant, rasi);
}

const TAMIL_WEEKDAYS = ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி'];
const ENGLISH_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** `?lang=en` for English; anything else is Tamil (the default). */
function parseLang(value) {
  return value === 'en' ? 'en' : 'ta';
}

/**
 * English labels for the Tamil time-of-day words newspapers print in their
 * Nalla Neram line ("காலை 7.45 - 8.45, மாலை 4.45 - 5.45"). The times are kept.
 */
const TIME_WORDS_EN = [
  [/அதிகாலை/gu, 'Early morning'],
  [/காலை/gu, 'Morning'],
  [/நண்பகல்/gu, 'Midday'],
  [/மதியம்/gu, 'Afternoon'],
  [/பிற்பகல்/gu, 'Afternoon'],
  [/மாலை/gu, 'Evening'],
  [/இரவு/gu, 'Night'],
  [/அபிஜித்/gu, 'Abhijit'],
];

function timeLabelsToEnglish(text) {
  return TIME_WORDS_EN.reduce((out, [pattern, word]) => out.replace(pattern, word), text);
}

// ---------------------------------------------------------------------------
// Localised fallbacks — shown when every source fails or a layout changes.
// The widget flags these with `isFallback: true` so the UI can show a badge.
// Today's fallback is the day's computed reading when there is one, so it
// changes from day to day; the generic text is only for when that fails too.
// ---------------------------------------------------------------------------

const FALLBACK = Object.freeze({
  prediction: (rasi, generated = null) => (generated && generated.prediction
    ? generated.prediction
    : `${rasi.tamil} ராசி அன்பர்களே, இன்றைய விரிவான ராசி பலன் தற்போது கிடைக்கவில்லை. ` +
      'அமைதியான மனதுடன் செயல்படுங்கள்; முக்கிய முடிவுகளை நல்ல நேரத்தில் எடுங்கள். ' +
      'சிறிது நேரத்தில் தகவல் தானாகப் புதுப்பிக்கப்படும்.'),
  otherDay: (rasi) => `${rasi.tamil}: இந்த தேதிக்கான செய்தித்தாள் ராசி பலன் கிடைக்கவில்லை.`,
  nallaNeram: 'நாட்காட்டியில் சரிபார்க்கவும்',
  rahuKalam: 'கணக்கிட இயலவில்லை',
});

const FALLBACK_EN = Object.freeze({
  prediction: (rasi, generated = null) => (generated && generated.prediction
    ? generated.prediction
    : `Dear ${rasi.english} natives, today's detailed reading is not available yet. ` +
      'Stay calm and take important decisions during the good time. ' +
      'It will update automatically shortly.'),
  otherDay: (rasi) => `${rasi.english}: no newspaper reading is available for this date.`,
  nallaNeram: 'Check your calendar',
  rahuKalam: 'Could not be calculated',
});

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Junk that frequently leaks into scraped article bodies. */
const NOISE_PATTERNS = [
  /also\s+read\s*:?.*$/i,
  /advertisement/gi,
  /விளம்பரம்/g,
  /இதையும்\s+படிக்க(?:வும்)?\s*:?.*$/u,
  /மேலும்\s+படிக்க\s*:?.*$/u,
];

/**
 * Invisible format characters. Some CMSes (e.g. hindutamil.in) inject U+200B
 * inside Tamil words as line-break hints, so these must be deleted, not turned
 * into spaces, or "சந்​திராஷ்டமம்" renders as "சந் திராஷ்டமம்".
 */
const INVISIBLE_CHARS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

function stripInvisible(text) {
  return String(text).replace(INVISIBLE_CHARS, '').replace(/\u00A0/g, ' ');
}

/** Collapse whitespace, strip noise, cap length on a sentence boundary. */
function cleanText(raw) {
  if (!raw) return '';
  let text = stripInvisible(raw);
  text = text.replace(/\s+/g, ' ').trim();
  for (const pattern of NOISE_PATTERNS) text = text.replace(pattern, '').trim();
  if (text.length > MAX_PREDICTION_CHARS) {
    const cut = text.slice(0, MAX_PREDICTION_CHARS);
    const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('।'), cut.lastIndexOf('!'));
    text = lastStop > MAX_PREDICTION_CHARS * 0.6 ? cut.slice(0, lastStop + 1) : `${cut.trim()}…`;
  }
  return text;
}

/** Strip a leading separator left behind after removing a rasi title. */
function stripLeadingSeparators(text) {
  return text.replace(/^[\s:：\-–—|,.]+/, '').trim();
}

/** Which rasi (if any) does this short piece of text name? */
function findRasiInText(text) {
  if (!text) return null;
  for (const rasi of RASIS) if (rasi.matcher.test(text)) return rasi;
  return null;
}

/**
 * Resolve a user-supplied query value to a rasi record.
 * Accepts English (`Mesham`, `rishabham`), Western (`aries`) or Tamil (`மேஷம்`).
 */
function normaliseRasi(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 40) return null;
  if (ALIAS_INDEX.has(trimmed)) return ALIAS_INDEX.get(trimmed); // Tamil input
  const ascii = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  return ALIAS_INDEX.get(ascii) || null;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** IST, the default and the newspapers' timezone (no DST). */
const IST_OFFSET = 330;

/** Current calendar date and weekday in [timeZone] (default India). */
function localToday(now = Date.now(), timeZone = CONFIG.newsTimeZone) {
  return localDateIn(timeZone, now);
}

/** Minutes since local midnight -> { h12, mm, meridiem }. */
function splitClock(minutesOfDay) {
  const total = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  const meridiem = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h12, mm, meridiem };
}

function formatClock(minutesOfDay) {
  const { h12, mm, meridiem } = splitClock(minutesOfDay);
  return `${h12}:${mm} ${meridiem}`;
}

/**
 * Compact range for narrow widget cells:
 *   same meridiem  -> "7:31 – 8:59 AM"
 *   crosses noon   -> "11:52 AM – 1:20 PM"
 */
function formatRange(startMin, endMin) {
  const a = splitClock(startMin);
  const b = splitClock(endMin);
  if (a.meridiem === b.meridiem) return `${a.h12}:${a.mm} – ${b.h12}:${b.mm} ${b.meridiem}`;
  return `${a.h12}:${a.mm} ${a.meridiem} – ${b.h12}:${b.mm} ${b.meridiem}`;
}

// ---------------------------------------------------------------------------
// Panchangam calculator
// ---------------------------------------------------------------------------

// Sunrise / sunset / solar noon: rigorous search with astronomy-engine (lib/time.js).

/**
 * Daytime (sunrise -> sunset) is split into 8 equal parts. Each inauspicious
 * period occupies one part, chosen by weekday (index 0 = Sunday, values 1..8).
 *
 *   Rahu Kalam  : Sun 8, Mon 2, Tue 7, Wed 5, Thu 6, Fri 4, Sat 3
 *   Yamagandam  : Sun 5, Mon 4, Tue 3, Wed 2, Thu 1, Fri 7, Sat 6
 *   Kuligai     : Sun 7, Mon 6, Tue 5, Wed 4, Thu 3, Fri 2, Sat 1
 *
 * With a 6:00 AM sunrise these reproduce the familiar printed tables
 * (e.g. Monday Rahu Kalam 7:30 – 9:00 AM).
 */
const RAHU_SEGMENT = [8, 2, 7, 5, 6, 4, 3];
const YAMAGANDAM_SEGMENT = [5, 4, 3, 2, 1, 7, 6];
const KULIGAI_SEGMENT = [7, 6, 5, 4, 3, 2, 1];

function computePanchangam(today, lat, lon, offset = IST_OFFSET) {
  const sun = solarTimes(today, lat, lon, offset);
  if (!sun) return null;
  // Same offset as today, so the night runs on one continuous clock even across a DST switch.
  const nextSun = solarTimes(shiftDay(today, 1), lat, lon, offset);

  const dayLength = sun.sunset - sun.sunrise;
  const eighth = dayLength / 8;
  const span = (index1Based) => {
    const start = sun.sunrise + (index1Based - 1) * eighth;
    return [start, start + eighth];
  };
  const segment = (index1Based) => formatRange(...span(index1Based));

  // Abhijit muhurtham = the 8th of 15 daytime muhurtas, centred on solar noon.
  // Tradition treats it as auspicious on every day except Wednesday.
  const muhurta = dayLength / 15;
  const abhijitSpan = today.weekday === 3 ? null : [sun.solarNoon - muhurta / 2, sun.solarNoon + muhurta / 2];
  const abhijit = abhijitSpan ? formatRange(...abhijitSpan) : null;
  // Whole minutes, rounded exactly like the display strings above.
  const minutes = (pair) => pair && pair.map((m) => Math.round(m));

  return {
    sunrise: formatClock(sun.sunrise),
    sunset: formatClock(sun.sunset),
    rahuKalam: segment(RAHU_SEGMENT[today.weekday]),
    yamagandam: segment(YAMAGANDAM_SEGMENT[today.weekday]),
    kuligai: segment(KULIGAI_SEGMENT[today.weekday]),
    abhijit,
    raw: {
      sunrise: Math.round(sun.sunrise),
      sunset: Math.round(sun.sunset),
      nextSunrise: nextSun ? Math.round(nextSun.sunrise) : null,
      weekday: today.weekday,
      rahuKalam: minutes(span(RAHU_SEGMENT[today.weekday])),
      yamagandam: minutes(span(YAMAGANDAM_SEGMENT[today.weekday])),
      kuligai: minutes(span(KULIGAI_SEGMENT[today.weekday])),
      abhijit: minutes(abhijitSpan),
    },
  };
}

// ---------------------------------------------------------------------------
// Astronomical Panchangam + generated rasi palan
// ---------------------------------------------------------------------------

/** The local calendar day `n` days after `dayInfo`. */
function shiftDay(dayInfo, n) {
  const d = new Date(Date.UTC(dayInfo.year, dayInfo.month - 1, dayInfo.day + n));
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    year,
    month,
    day,
    weekday: d.getUTCDay(),
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/** UTC epoch ms of a local minutes-of-day on `dayInfo`, at UTC offset `offset` minutes. */
function localMs(dayInfo, minutesOfDay, offset = IST_OFFSET) {
  return Date.UTC(dayInfo.year, dayInfo.month - 1, dayInfo.day) + (minutesOfDay - offset) * 60_000;
}

/**
 * "3:53 PM", or "நாளை 4:58 AM" / "tomorrow 4:58 AM" on the next calendar day.
 * Truncated to the minute in which the change happens, as almanacs print it.
 */
function formatInstant(ms, dayInfo, lang = 'ta', offset = IST_OFFSET) {
  const minutes = Math.floor((ms - localMs(dayInfo, 0, offset)) / 60_000);
  if (minutes < 1440) return formatClock(minutes);
  return `${lang === 'en' ? 'tomorrow' : 'நாளை'} ${formatClock(minutes)}`;
}

/** "அனுஷம் 11:38 AM வரை, பின்பு கேட்டை" / "Anusham until 11:38 AM, then Kettai" */
function describeSpans(spans, dayInfo, nextSunriseMs, lang = 'ta', offset = IST_OFFSET) {
  const english = lang === 'en';
  return spans
    .map((s) => {
      if (s.endMs === null || s.endMs >= nextSunriseMs) return s.name;
      const time = formatInstant(s.endMs, dayInfo, lang, offset);
      return english ? `${s.name} until ${time}` : `${s.name} ${time} வரை`;
    })
    .join(english ? ', then ' : ', பின்பு ');
}

const astroCache = new Map();
const rawPanchangamCache = new Map();

/** Sunrise/sunset (UTC ms) of a local day, or null near the poles. */
function sunMsOn(dayInfo, lat, lon, timeZone) {
  const o = offsetForDay(dayInfo, timeZone);
  const sun = solarTimes(dayInfo, lat, lon, o);
  return sun && { sunriseMs: localMs(dayInfo, sun.sunrise, o), sunsetMs: localMs(dayInfo, sun.sunset, o) };
}

/**
 * Day times and computeAstroPanchangam() for a local day, memoised so the
 * previous day (used for the reading's day-to-day shift) is computed once.
 */
function rawPanchangamFor(dayInfo, lat, lon, lang, timeZone) {
  const key = `${dayInfo.iso}|${lat.toFixed(2)}|${lon.toFixed(2)}|${timeZone}|${lang}`;
  if (rawPanchangamCache.has(key)) return rawPanchangamCache.get(key);
  const today = sunMsOn(dayInfo, lat, lon, timeZone);
  const tomorrow = sunMsOn(shiftDay(dayInfo, 1), lat, lon, timeZone);
  if (!today || !tomorrow) return null;
  const times = { sunriseMs: today.sunriseMs, sunsetMs: today.sunsetMs, nextSunriseMs: tomorrow.sunriseMs };
  const astro = computeAstroPanchangam({
    ...times,
    sunsetMsForDaysAgo: (n) => sunMsOn(shiftDay(dayInfo, -n), lat, lon, timeZone).sunsetMs,
    gregorianYear: dayInfo.year,
    gregorianMonth: dayInfo.month,
    lang,
  });
  const result = { times, astro };
  if (rawPanchangamCache.size > 200) rawPanchangamCache.clear();
  rawPanchangamCache.set(key, result);
  return result;
}

/**
 * Tithi, nakshatram, yogam, karanam, chandrashtamam and Tamil date for a local
 * day and place, plus a generated rasi palan for all 12 rasis, in `lang`.
 * Pure maths, so it never fails because a website changed. Memoised per day,
 * location, timezone and language.
 */
function computeAstroDay(dayInfo, lat, lon, lang = 'ta', timeZone = CONFIG.newsTimeZone) {
  const key = `${dayInfo.iso}|${lat.toFixed(2)}|${lon.toFixed(2)}|${timeZone}|${lang}`;
  if (astroCache.has(key)) return astroCache.get(key);

  // Every instant is absolute (UTC ms); only display uses this day's offset.
  const offset = offsetForDay(dayInfo, timeZone);
  const raw = rawPanchangamFor(dayInfo, lat, lon, lang, timeZone);
  if (!raw) return null;
  const { times, astro } = raw;

  const describe = (spans) => describeSpans(spans, dayInfo, times.nextSunriseMs, lang, offset);
  // [{ name, until }]: `until` is the display time the value ends, or null if it lasts past next sunrise.
  const structured = (spans) => spans.map((s) => ({
    name: s.name,
    until: s.endMs !== null && s.endMs < times.nextSunriseMs ? formatInstant(s.endMs, dayInfo, lang, offset) : null,
  }));
  const { tamilDate, chandrashtamam } = astro;
  const panchangam = {
    tamilDate: lang === 'en'
      ? `${tamilDate.month} ${tamilDate.day}, ${tamilDate.year} year`
      : `${tamilDate.year} ஆண்டு ${tamilDate.month} ${tamilDate.day}`,
    tamilYear: tamilDate.year,
    tamilMonth: tamilDate.month,
    tamilDay: tamilDate.day,
    paksha: astro.paksha,
    tithi: describe(astro.tithi),
    nakshatra: describe(astro.nakshatra),
    yogam: describe(astro.yoga),
    karanam: describe(astro.karana),
    chandraRasi: describe(astro.moonRasi),
    chandrashtamam: describe(chandrashtamam.rasis),
    chandrashtamamStars: chandrashtamam.stars.join(', '),
    spans: {
      tithi: structured(astro.tithi),
      nakshatra: structured(astro.nakshatra),
      yogam: structured(astro.yoga),
      karanam: structured(astro.karana),
      chandraRasi: structured(astro.moonRasi),
      chandrashtamam: structured(chandrashtamam.rasis),
    },
    method: 'drik-lahiri',
  };

  // The Moon changing rasi during this day (same for every rasi), or null.
  const [moonFrom, moonTo] = astro.moonRasi;
  const moonChange = moonTo && moonFrom.endMs < times.nextSunriseMs
    ? {
      time: formatInstant(moonFrom.endMs, dayInfo, lang, offset),
      fromRasi: moonFrom.name,
      toRasi: moonTo.name,
      text: lang === 'en' ? `The Moon moves into ${moonTo.name}` : `சந்திரன் ${moonTo.name} ராசிக்கு மாறுகிறார்`,
    }
    : null;

  const formatTime = (ms) => formatInstant(ms, dayInfo, lang, offset);
  const minutesOfDay = (ms) => (ms - localMs(dayInfo, 0, offset)) / 60_000;
  // The previous day's Panchangam lets the reading say what shifted since yesterday.
  const prevDay = shiftDay(dayInfo, -1);
  let prevRaw = null;
  try {
    prevRaw = rawPanchangamFor(prevDay, lat, lon, lang, timeZone);
  } catch {
    prevRaw = null;
  }
  const panchanga = {
    iso: dayInfo.iso,
    weekday: dayInfo.weekday,
    nakshatra: astro.nakshatra,
    tithi: astro.tithi,
    yoga: astro.yoga,
    karana: astro.karana,
    previous: prevRaw && {
      weekday: prevDay.weekday,
      sunriseMs: prevRaw.times.sunriseMs,
      nextSunriseMs: prevRaw.times.nextSunriseMs,
      moonRasi: prevRaw.astro.moonRasi,
      nakshatra: prevRaw.astro.nakshatra,
      tithi: prevRaw.astro.tithi,
      yoga: prevRaw.astro.yoga,
      karana: prevRaw.astro.karana,
    },
  };
  const generated = {};
  RASIS.forEach((rasi, index) => {
    generated[rasi.key] = generateRasiPalan(index, astro.moonRasi, times, formatTime, lang, minutesOfDay, panchanga);
  });

  const result = { panchangam, generated, moonChange };
  if (astroCache.size > 100) astroCache.clear();
  astroCache.set(key, result);
  return result;
}

/** Like computeAstroDay, but a maths bug must never take the widget down. */
function safeAstroDay(dayInfo, lat, lon, lang = 'ta', timeZone = CONFIG.newsTimeZone) {
  try {
    return computeAstroDay(dayInfo, lat, lon, lang, timeZone);
  } catch (error) {
    console.error('[astro] computation failed:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scraping: network
// ---------------------------------------------------------------------------

const http = axios.create({
  timeout: CONFIG.fetchTimeoutMs,
  maxContentLength: 3 * 1024 * 1024, // 3 MB — astrology pages are never larger
  maxRedirects: 3,
  responseType: 'text',
  transformResponse: [(data) => data], // keep raw text; never JSON-parse HTML
  headers: {
    'User-Agent': CONFIG.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ta-IN,ta;q=0.9,en;q=0.5',
  },
  validateStatus: (status) => status >= 200 && status < 300,
});

async function fetchSource(url) {
  const response = await http.get(url);
  const contentType = String(response.headers['content-type'] || '');
  return { body: String(response.data || ''), contentType };
}

function looksLikeFeed(body, contentType) {
  return /xml|rss|atom/i.test(contentType) || /^\s*(?:<\?xml[^>]*>\s*)?<(?:rss|feed)[\s>]/i.test(body);
}

// ---------------------------------------------------------------------------
// Scraping: parsers
// ---------------------------------------------------------------------------

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, strong, b, [class*="title"], [class*="heading"], [class*="rasi"]';

/** Rasi named by a paragraph that holds nothing else ("மீனம்", "மீனம் ராசி:"). */
function bareRasiLabel(text) {
  const core = text.replace(/\s*(?:ராசி\s*பலன்|ராசிபலன்|ராசி)?\s*[:：\-–—.]*\s*$/u, '').trim();
  return RASIS.find((r) => r.variants.includes(core)) || null;
}

/**
 * Is this element a short title naming *some* rasi? Paragraphs only count
 * when they contain the bare name — editors sometimes type a heading as
 * <p>மீனம்</p> — so ordinary sentences mentioning a rasi never split sections.
 */
function isRasiHeading($, el) {
  const text = cleanText($(el).text());
  if (!text || text.length > MAX_HEADING_CHARS) return false;
  if (el.name === 'p') return Boolean(bareRasiLabel(text));
  return Boolean(findRasiInText(text));
}

/** Does this sibling start the next rasi's section? */
function isSectionBoundary($, el) {
  if (isRasiHeading($, el)) return true;
  return $(el)
    .find(HEADING_SELECTOR)
    .toArray()
    .some((child) => isRasiHeading($, child));
}

/**
 * Collect text from the siblings that follow a rasi heading, stopping at the
 * next rasi heading. If the heading sits alone inside a wrapper (common in
 * card grids: <div class="card"><h3>மேஷம்</h3></div><div>text</div>), climb
 * up to two levels and retry from the wrapper.
 */
function collectSectionText($, headingEl) {
  let anchor = $(headingEl);
  for (let depth = 0; depth < 3 && anchor.length; depth++) {
    const parts = [];
    let sibling = anchor.next();
    while (sibling.length && !isSectionBoundary($, sibling)) {
      const text = cleanText(sibling.text());
      if (text) parts.push(text);
      if (parts.join(' ').length >= MAX_PREDICTION_CHARS) break;
      sibling = sibling.next();
    }
    const joined = cleanText(parts.join(' '));
    if (joined.length >= MIN_PREDICTION_CHARS) return joined;
    anchor = anchor.parent();
    if (anchor.is('body, html, main, article')) break;
  }
  return '';
}

/**
 * Extract per-rasi predictions from an HTML article. Three layout strategies,
 * applied in order, each only filling rasis still missing:
 *
 *   A. Inline title:   <p><strong>மேஷம்:</strong> இன்று ...</p>
 *   B. Heading block:  <h3>மேஷம்</h3><p>இன்று ...</p><p>...</p><h3>ரிஷபம்</h3>
 *   C. Prefixed para:  <p>மேஷம் ராசி: இன்று ...</p>
 */
function parseHtml(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, nav, header, footer, aside, form, svg, [class*="ad-"], [id*="ad-"]').remove();

  const predictions = {};

  // Strategy A — bold title inside the same paragraph as its text.
  $('p strong, p b, li strong, li b').each((_, el) => {
    const titleText = cleanText($(el).text());
    if (titleText.length > MAX_HEADING_CHARS) return;
    const rasi = findRasiInText(titleText);
    if (!rasi || predictions[rasi.key]) return;
    const parentText = cleanText($(el).parent().text());
    const body = stripLeadingSeparators(parentText.replace(titleText, ''));
    if (body.length >= MIN_PREDICTION_CHARS) predictions[rasi.key] = cleanText(body);
  });

  // Strategy B — standalone heading followed by sibling paragraphs.
  $(`${HEADING_SELECTOR}, p`).each((_, el) => {
    if (!isRasiHeading($, el)) return;
    const rasi = findRasiInText(cleanText($(el).text()));
    if (!rasi || predictions[rasi.key]) return;
    const body = collectSectionText($, el);
    if (body) predictions[rasi.key] = body;
  });

  // Strategy C — paragraph that *starts* with "<rasi> ராசி:".
  $('p, li').each((_, el) => {
    const text = cleanText($(el).text());
    for (const rasi of RASIS) {
      if (predictions[rasi.key]) continue;
      const match = text.match(rasi.prefixMatcher);
      if (!match) continue;
      const body = stripLeadingSeparators(text.slice(match[0].length));
      if (body.length >= MIN_PREDICTION_CHARS) predictions[rasi.key] = cleanText(body);
      break;
    }
  });

  // Strategy D — no rasi names at all (dailythanthi.com, some days of 2025–26):
  // twelve readings in Mesham → Meenam order, each closed by a lucky-colour
  // line. Only used when nothing was found by name, and only with exactly 12.
  if (Object.keys(predictions).length === 0) {
    const blocks = [];
    let current = [];
    $('p, li').each((_, el) => {
      const text = cleanText($(el).text());
      if (!text) return;
      if (LUCKY_LINE.test(text)) {
        blocks.push(current.join(' '));
        current = [];
      } else if (text.length < 60 && !/[.!]$/.test(text)) {
        current = []; // a Panchangam / header line ("சூலம்: வடக்கு"), not part of a reading
      } else {
        current.push(text);
      }
    });
    if (blocks.length === RASIS.length && blocks.every((b) => b.length >= MIN_PREDICTION_CHARS)) {
      RASIS.forEach((rasi, i) => { predictions[rasi.key] = cleanText(blocks[i]); });
    }
  }

  return { predictions, nallaNeram: extractNallaNeram($('body').text()) };
}

const LUCKY_LINE = /^அதிர்ஷ்ட\s*(?:நிறம்|எண்)\s*:/u;

/**
 * Titles of periodic articles that share a feed with the daily one
 * (e.g. Daily Thanthi's "வார ராசிபலன்"). Their per-rasi text must never be
 * shown as today's prediction.
 */
const NON_DAILY_TITLE =
  /வார\s*(?:ராசி|பலன்)|வாராந்திர|மாத\s*(?:ராசி|பலன்)|மாதப்\s*பலன்|ஆண்டு\s*(?:ராசி|பலன்)|வருட|புத்தாண்டு|பெயர்ச்சி|weekly|monthly|yearly|annual/iu;

const DAILY_TITLE = /ராசி\s*பலன்|ராசிபலன்/u;

/** Item date (RSS pubDate / Atom published|updated) as a local ISO day, or null. */
function itemLocalIso($item) {
  const raw =
    $item.children('pubDate').first().text() ||
    $item.children('published').first().text() ||
    $item.children('updated').first().text() ||
    $item.children('dc\\:date').first().text();
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? localToday(ms).iso : null;
}

/**
 * Extract predictions from an RSS/Atom feed. Handles both shapes:
 *   - one <item> per rasi (title names the rasi, description holds the text)
 *   - one <item> for the whole day (content:encoded holds an HTML article)
 *
 * When `today` is given, dated items from other days are ignored, so a feed
 * that has not published yet (or skipped a day) yields nothing rather than
 * yesterday's reading. Undated items are kept: there is no way to judge them.
 */
function parseRss(xml, { today } = {}) {
  const $ = cheerio.load(xml, { xml: true });
  const predictions = {};
  let nallaNeram = null;
  let url = null;

  const items = $('item, entry')
    .toArray()
    .map((item) => {
      const $item = $(item);
      return { $item, title: cleanText($item.children('title').first().text()) };
    })
    .filter(({ $item, title }) => {
      if (NON_DAILY_TITLE.test(title)) return false;
      if (!today) return true;
      const iso = itemLocalIso($item);
      return iso === null || iso === today.iso;
    })
    // The daily rasi palan article wins over other same-day astrology posts.
    .sort((a, b) => Number(DAILY_TITLE.test(b.title)) - Number(DAILY_TITLE.test(a.title)));

  for (const { $item, title } of items) {
    const rawHtml =
      $item.children('content\\:encoded').first().text() ||
      $item.children('content').first().text() ||
      $item.children('description').first().text() ||
      $item.children('summary').first().text();

    const rasi = title.length <= 120 ? findRasiInText(title) : null;
    const nestedText = cleanText(cheerio.load(rawHtml || '').root().text());

    // Single-rasi item: description is the prediction.
    const titleMentionsOneRasi =
      rasi && RASIS.filter((r) => r.matcher.test(title)).length === 1;
    if (titleMentionsOneRasi && !predictions[rasi.key] && nestedText.length >= MIN_PREDICTION_CHARS) {
      predictions[rasi.key] = nestedText;
    }

    // Whole-day item: parse its embedded HTML like a normal article.
    if (rawHtml && rawHtml.length > 400) {
      const nested = parseHtml(rawHtml);
      const before = Object.keys(predictions).length;
      for (const [key, text] of Object.entries(nested.predictions)) {
        if (!predictions[key]) predictions[key] = text;
      }
      nallaNeram = nallaNeram || nested.nallaNeram;
      if (!url && Object.keys(predictions).length > before) url = itemLink($item);
    }
    nallaNeram = nallaNeram || extractNallaNeram(nestedText);
  }

  return { predictions, nallaNeram, todaysItems: items.length, url };
}

/** The article URL of an RSS <item> or Atom <entry>, or null. */
function itemLink($item) {
  const rss = $item.children('link').first();
  const href = rss.attr('href') || rss.text();
  return /^https?:\/\//.test(String(href).trim()) ? String(href).trim() : null;
}

/**
 * Pull "நல்ல நேரம்: காலை 7.30 - 8.30, மாலை 4.30 - 5.30" out of free text.
 * Stops at the next Panchangam label so we never swallow Rahu Kalam.
 */
function extractNallaNeram(fullText) {
  if (!fullText) return null;
  const text = stripInvisible(fullText).replace(/\s+/g, ' ');
  // Skip "கௌரி நல்ல நேரம்" (a different table); stop at the next label. Some
  // sites print morning and evening as separate "நல்ல நேரம்:" lines, so
  // collect every entry and join them.
  const pattern =
    /(?<!கௌரி\s*)நல்ல\s*நேரம்\s*[:：\-–]?\s*(.{4,90}?)(?=\s*(?:நல்ல\s*நேரம்|ராகு|இராகு|எமகண்டம்|எம\s*கண்டம்|குளிகை|கௌரி|சூலம்|சந்திராஷ்டமம்|திதி|நட்சத்திரம்|யோகம்|கரணம்|சூரிய|$))/gu;
  const values = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[1].replace(/[|,;.\s]+$/, '').trim();
    if (/\d/.test(value) && !values.includes(value)) values.push(value); // must contain an actual time
  }
  return values.length ? values.join(', ') : null;
}

// ---------------------------------------------------------------------------
// Daily scrape cache (in-memory; survives warm serverless invocations)
// ---------------------------------------------------------------------------

/** isoDate -> { predictions, nallaNeram, source, expiresAt } */
const scrapeCache = new Map();
/** isoDate -> Promise, so concurrent requests share one scrape. */
const inflight = new Map();

/** Archive source id for a feed URL: 'dailythanthi', 'hindutamil', or the hostname. */
function sourceIdFor(url) {
  const host = new URL(url).hostname;
  return PAPER_PRIORITY.find((id) => host.includes(id)) || host;
}

/** Whose paragraph is shown when several papers have one (user preference: Daily Thanthi first). */
const PAPER_PRIORITY = ['dailythanthi', 'hindutamil'];
const paperRank = (id) => (PAPER_PRIORITY.includes(id) ? PAPER_PRIORITY.indexOf(id) : PAPER_PRIORITY.length);

/**
 * Fetch every configured source (each is cached for hours, so this is a
 * couple of requests a day). Keeps each paper's readings separately in
 * `bySource` for the archive, and merges them for the API: per rasi, the
 * highest-priority paper that has it.
 */
async function scrapeAllSources(today, { sources = CONFIG.sources, nallaHosts = CONFIG.nallaNeramHosts } = {}) {
  const merged = { predictions: {}, nallaNeram: null, source: null, errors: [], bySource: {} };
  const trusted = (url) => isNallaNeramSource(url, nallaHosts);

  for (const url of sources) {
    try {
      const { body, contentType } = await fetchSource(url);
      const parsed = looksLikeFeed(body, contentType) ? parseRss(body, { today }) : parseHtml(body);
      const found = Object.keys(parsed.predictions).length;
      if (found > 0) {
        merged.bySource[sourceIdFor(url)] = { url: parsed.url || url, predictions: parsed.predictions, nallaNeram: parsed.nallaNeram, host: new URL(url).hostname };
      }
      // Nalla Neram only from papers that print the standard weekday table (Daily Thanthi).
      if (!merged.nallaNeram && parsed.nallaNeram && trusted(url)) merged.nallaNeram = parsed.nallaNeram;
      if (found === 0) {
        const notYet = parsed.todaysItems === 0;
        merged.errors.push(notYet ? `${url}: no item dated ${today.iso} yet` : `${url}: layout not recognised (0 rasis parsed)`);
      }
    } catch (error) {
      merged.errors.push(`${url}: ${error.code || error.message}`);
    }
  }

  const ranked = Object.entries(merged.bySource).sort(([a], [b]) => paperRank(a) - paperRank(b));
  for (const [, paper] of ranked) {
    for (const [key, text] of Object.entries(paper.predictions)) {
      if (!merged.predictions[key]) merged.predictions[key] = text;
    }
    if (!merged.source) merged.source = paper.host;
  }

  if (merged.errors.length) console.warn('[scrape]', merged.errors.join(' | '));
  return merged;
}

/** Is [url] a site whose Nalla Neram line we trust? */
function isNallaNeramSource(url, hosts = CONFIG.nallaNeramHosts) {
  try {
    const host = new URL(url).hostname;
    return hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Shared Postgres cache when SUPABASE_URL + service key are set; otherwise null. */
const store = createStore(process.env);

function remember(today, result) {
  const success = Object.keys(result.predictions).length > 0;
  const entry = { ...result, expiresAt: Date.now() + (success ? CONFIG.cacheTtlMs : CONFIG.failureTtlMs) };
  // Drop previous days so the cache never grows unbounded.
  for (const key of scrapeCache.keys()) if (key !== today.iso) scrapeCache.delete(key);
  scrapeCache.set(today.iso, entry);
  return entry;
}

/** Scrape now and save a successful result to the shared store, and each paper to the archive. */
async function scrapeAndStore(today) {
  const result = await scrapeAllSources(today);
  if (store && Object.keys(result.predictions).length > 0) {
    await store.put(today.iso, result);
    for (const [source, paper] of Object.entries(result.bySource)) {
      if (PAPER_PRIORITY.includes(source)) await store.putArchive(today.iso, source, paper);
    }
    archiveCache.delete(today.iso);
  }
  return result;
}

/** isoDate -> { data, expiresAt }: archived third-party readings (they rarely change). */
const archiveCache = new Map();

/** Every archived source for [iso] ({} without a store). */
async function getArchive(iso) {
  if (!store) return {};
  const cached = archiveCache.get(iso);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await store.getArchive(iso);
  if (archiveCache.size > 400) archiveCache.clear();
  archiveCache.set(iso, { data, expiresAt: Date.now() + 60 * 60 * 1000 });
  return data;
}

/**
 * Today's scrape: memory cache -> shared store -> live scrape. A stored day
 * with all 12 rasis is final; a partial one is used but re-checked live.
 */
async function getDailyScrape(today) {
  const cached = scrapeCache.get(today.iso);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (inflight.has(today.iso)) return inflight.get(today.iso);

  const job = (async () => {
    const stored = store ? await store.get(today.iso) : null;
    if (stored && Object.keys(stored.predictions).length === RASIS.length) return stored;
    const live = await scrapeAndStore(today);
    return Object.keys(live.predictions).length >= Object.keys(stored ? stored.predictions : {}).length
      ? live
      : stored;
  })()
    .then((result) => remember(today, result))
    .finally(() => inflight.delete(today.iso));

  inflight.set(today.iso, job);
  return job;
}

// ---------------------------------------------------------------------------
// Payload builder — the contract with the Android `RasiPalanResponse` DTO.
// Every original field is always present and always a string/boolean (never
// null) so the Kotlin client can decode with non-nullable properties. The
// newer `panchangam`, `generated`, `diffScore` and `diff` fields are ignored by
// older clients (`ignoreUnknownKeys`); `diffScore`/`diff` are null when there
// is no scraped prediction to compare against.
//
// `lang` = 'en' translates everything computed here (generated reading,
// Panchangam names, timing labels, fallbacks). Scraped newspaper text is
// Tamil whatever the language.
// ---------------------------------------------------------------------------

/**
 * Nalla Neram for a day and place, best source first:
 *   1. newspaper — the scraped line, for places in Tamil Nadu (the papers' audience);
 *   2. weekday-table — the fixed IST table printed in Tamil calendars, anywhere in IST;
 *   3. gowri — good daytime Gowri slots minus Rahu/Yama/Kuligai (other timezones,
 *      where IST clock times mean nothing).
 * @returns { ranges: [[start, end]], source, text } — text in Tamil newspaper style
 */
function nallaNeramFor(raw, place, scrapedText) {
  const ist = place.timezone === CONFIG.newsTimeZone;
  const fromNewspaper = ist && inTamilNadu(place) ? parseNallaNeramRanges(scrapedText) : [];
  if (fromNewspaper.length) return { ranges: fromNewspaper, source: 'newspaper', text: scrapedText };
  if (!raw) return null;
  if (ist) {
    const ranges = weekdayNallaNeram(raw.weekday);
    return { ranges, source: 'weekday-table', text: formatTamilRanges(ranges) };
  }
  if (raw.nextSunrise === null) return null;
  const slots = gowriSlots(raw.weekday, raw.sunrise, raw.sunset, raw.nextSunrise);
  const ranges = gowriNallaNeram(slots, [raw.rahuKalam, raw.yamagandam, raw.kuligai]);
  return { ranges, source: 'gowri', text: formatTamilRanges(ranges) };
}

/** Gowri Panchangam: 8 day + 8 night slots with display times. */
function gowriFor(raw, lang) {
  if (!raw || raw.nextSunrise === null) return null;
  return gowriSlots(raw.weekday, raw.sunrise, raw.sunset, raw.nextSunrise, lang).map((s) => ({
    ...s,
    time: formatRange(s.start, s.end),
  }));
}

/** `location` metadata for responses. */
function locationMeta(place) {
  const { name, lat, lon, timezone, isFallback, reason } = place;
  return { name, lat, lon, timezone, isFallback, ...(reason ? { reason } : {}) };
}

/** Daily-calendar extras: soolam / parigaram, lagnam, ayanam, ruthu, lunar month, planets at sunrise, day of the year. */
function calendarExtras(day, raw, place, offset, lang) {
  const sunriseMs = localMs(day, raw.sunrise, offset);
  let lagna = null;
  let sky = {};
  try {
    const l = sunriseLagna(sunriseMs, place.lat, place.lon, lang);
    const until = formatInstant(l.endMs, day, lang, offset);
    lagna = { name: l.name, until, text: lang === 'en' ? `${l.name} until ${until}` : `${l.name} லக்னம் ${until} வரை` };
    sky = { ...seasons(sunriseMs, lang), lunarMonth: lunarMonth(sunriseMs, lang), planets: planetPositions(sunriseMs, lang) };
  } catch (error) {
    console.error('[calendar] extras failed:', error);
  }
  return { ...dayOfYear(day), soolam: soolam(day.weekday, lang), lagna, ...sky };
}

const SOURCE_CREDITS = Object.freeze({
  dailythanthi: 'Daily Thanthi (dailythanthi.com)',
  hindutamil: 'Hindu Tamil Thisai (hindutamil.in)',
});

/** First sentence (or two, if the first is very short), at most ~160 characters. */
function excerptOf(text) {
  const sentences = String(text).trim().split(/(?<=[.!?])\s+/u);
  let out = sentences[0] || '';
  if (out.length < 40 && sentences[1]) out = `${out} ${sentences[1]}`;
  if (out.length <= 160) return out;
  const cut = out.lastIndexOf(' ', 157);
  return `${out.slice(0, cut > 80 ? cut : 157)}…`;
}

/** A sheet "word" that is a rasi name is the reader picking up the label, not the reading. */
const isRasiName = (word) => RASIS.some((r) => r.tamil === word);

/**
 * Third-party readings of one rasi for a day: the daily calendar's one-word
 * reading (archived; only from fully read sheets; with English) and each
 * paper's paragraph — the live scrape for today, else the archive — in
 * PAPER_PRIORITY order.
 */
function thirdPartyFor(rasiKey, scrape, archive = {}) {
  const sheetDay = archive.tamildailycalendar;
  const sheetRasi = sheetDay && sheetDay.status === 'ok' ? sheetDay.rasis[rasiKey] : null;
  const sheet = sheetRasi && sheetRasi.word && !isRasiName(sheetRasi.word)
    ? { word: sheetRasi.word, english: MAHA_WORDS_EN[sheetRasi.word] || null, confidence: sheetRasi.confidence }
    : null;

  const papers = [];
  for (const id of PAPER_PRIORITY) {
    const live = scrape.bySource && scrape.bySource[id];
    const text = (live && live.predictions[rasiKey]) || (archive[id] && archive[id].rasis[rasiKey] && archive[id].rasis[rasiKey].text);
    if (text) papers.push({ source: id, text, url: (live && live.url) || (archive[id] && archive[id].url) || null, credit: SOURCE_CREDITS[id] });
  }
  // A stored day_scrape from before per-paper archiving: attribute it by host.
  if (!papers.length && scrape.predictions && scrape.predictions[rasiKey]) {
    const id = PAPER_PRIORITY.find((p) => String(scrape.source || '').includes(p)) || 'unknown';
    papers.push({ source: id, text: scrape.predictions[rasiKey], url: null, credit: SOURCE_CREDITS[id] || scrape.source || 'unknown' });
  }
  return { sheet, papers };
}

/** A paper's reading as the API shows it: credited excerpt + link (full text only when THIRD_PARTY_FULL_TEXT=1). */
function publicPaper(paper) {
  return {
    source: paper.source,
    credit: paper.credit,
    url: paper.url,
    excerpt: excerptOf(paper.text),
    ...(CONFIG.thirdPartyFullText ? { text: paper.text } : {}),
  };
}

function buildPayload(rasi, day, scrape, panchangam, astroDay = null, { lang = 'ta', isToday = true, place = resolveLocation({}), archive = {} } = {}) {
  const english = lang === 'en';
  const fallback = english ? FALLBACK_EN : FALLBACK;
  const { sheet, papers } = thirdPartyFor(rasi.key, scrape, archive);
  const paper = papers[0] || null;
  const scrapedPrediction = paper ? paper.text : null;
  const nalla = nallaNeramFor(panchangam && panchangam.raw, place, scrape.nallaNeram || (archive.dailythanthi && archive.dailythanthi.nallaNeram));
  let nallaNeram = nalla ? nalla.text : fallback.nallaNeram;
  if (english) nallaNeram = timeLabelsToEnglish(nallaNeram);
  const generated = astroDay ? astroDay.generated[rasi.key] : null;
  const diff = diffScore(generated, scrapedPrediction);
  const shownPaperText = paper && (CONFIG.thirdPartyFullText ? paper.text : excerptOf(paper.text));
  const paperHost = paper && paper.url ? new URL(paper.url).hostname : paper && (scrape.source || paper.source);

  return {
    rasi: rasi.key,
    rasiTamil: rasi.tamil,
    rasiEnglish: rasi.english,
    rasiName: english ? `${namesFor('en').rasis[RASIS.indexOf(rasi)]} (${rasi.english})` : rasi.tamil,
    lang,
    date: day.iso,
    isToday,
    weekdayTamil: TAMIL_WEEKDAYS[day.weekday],
    weekday: (english ? ENGLISH_WEEKDAYS : TAMIL_WEEKDAYS)[day.weekday],
    prediction: shownPaperText || (isToday ? fallback.prediction(rasi, generated) : fallback.otherDay(rasi)),
    nallaNeram,
    nallaNeramSource: nalla ? nalla.source : null,
    rahuKalam: panchangam ? panchangam.rahuKalam : fallback.rahuKalam,
    yamagandam: panchangam ? panchangam.yamagandam : fallback.rahuKalam,
    kuligai: panchangam ? panchangam.kuligai : fallback.rahuKalam,
    sunrise: panchangam ? panchangam.sunrise : '',
    sunset: panchangam ? panchangam.sunset : '',
    isFallback: !paper,
    source: paper ? paperHost || 'unknown' : 'fallback',
    sourceUrl: paper ? paper.url : null,
    // Calendar sheet word first, then papers (Daily Thanthi first); credit and link with each.
    sources: { sheet, papers: papers.map(publicPaper) },
    // The Chandra Gochara rule table (house 1–12 -> summary, score) behind `generated`, for "how is this calculated".
    gochara: gocharaTable(lang),
    panchangam: astroDay ? astroDay.panchangam : null,
    generated,
    moonChange: astroDay ? astroDay.moonChange : null,
    timeline: panchangam ? buildTimeline(panchangam.raw, nalla) : null,
    gowri: panchangam ? gowriFor(panchangam.raw, lang) : null,
    location: locationMeta(place),
    diffScore: diff ? diff.score : null,
    diff,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Place and calendar day of a request. The default date is "today" where the
 * place is; scraped newspaper data is keyed by India's calendar day.
 */
function requestContext(query) {
  const place = resolveLocation(query, {
    name: CONFIG.defaultLat === 13.0827 && CONFIG.defaultLon === 80.2707 ? 'Chennai' : 'Reference location',
    lat: CONFIG.defaultLat,
    lon: CONFIG.defaultLon,
    timezone: CONFIG.newsTimeZone,
  });
  const day = parseDateParam(query.date, place.timezone);
  const offset = day ? offsetForDay(day, place.timezone) : null;
  return { place, day, offset };
}

/** `?date=YYYY-MM-DD` (calendar day, 1900–2100). Absent -> today in [timeZone]; invalid -> null. */
function parseDateParam(value, timeZone = CONFIG.newsTimeZone) {
  if (value === undefined) return localToday(Date.now(), timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const parsed = match && shiftDay({ year: +match[1], month: +match[2], day: +match[3] }, 0);
  if (!parsed || parsed.iso !== value || parsed.year < 1900 || parsed.year > 2100) return null;
  return parsed;
}

const INVALID_DATE = { error: 'invalid_date', message: 'Query parameter "date" must be YYYY-MM-DD (1900–2100).' };

/**
 * Scraped readings for a day that is not today: memory cache or the shared
 * store only. Past days are never re-scraped (feeds only carry recent items)
 * and future days have nothing to scrape.
 */
async function getStoredScrape(day) {
  const cached = scrapeCache.get(day.iso);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const stored = store ? await store.get(day.iso) : null;
  return stored || { predictions: {}, nallaNeram: null, source: null };
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    sourcesConfigured: CONFIG.sources.length,
    sharedCache: Boolean(store),
    time: new Date().toISOString(),
  });
});

/** Discovery endpoint: the keys the client may send. */
app.get('/api/rasis', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(RASIS.map(({ key, tamil, english }) => ({ key, tamil, english })));
});

app.get('/api/rasipalan', async (req, res) => {
  const rasi = normaliseRasi(req.query.rasi);
  if (!rasi) {
    return res.status(400).json({
      error: 'invalid_rasi',
      message: 'Query parameter "rasi" must be one of the supported keys.',
      supported: RASIS.map((r) => r.key),
    });
  }

  const { place, day, offset } = requestContext(req.query);
  if (!day) return res.status(400).json(INVALID_DATE);
  const lang = parseLang(req.query.lang);
  const today = localToday(); // India: the newspapers' day
  const isToday = day.iso === localToday(Date.now(), place.timezone).iso;

  // Panchangam is pure maths — compute it independently of the network.
  const panchangam = computePanchangam(day, place.lat, place.lon, offset);
  const astroDay = safeAstroDay(day, place.lat, place.lon, lang, place.timezone);

  // Scraping failures must never surface as HTTP errors: the widget would
  // then show nothing. Degrade to localised fallback text instead.
  let scrape;
  let archive = {};
  try {
    [scrape, archive] = await Promise.all([
      day.iso === today.iso ? getDailyScrape(today) : getStoredScrape(day),
      getArchive(day.iso),
    ]);
  } catch (error) {
    console.error('[rasipalan] scrape pipeline crashed:', error);
    scrape = { predictions: {}, nallaNeram: null, source: null };
  }

  const payload = buildPayload(rasi, day, scrape, panchangam, astroDay, { lang, isToday, place, archive });

  // Let a CDN/edge cache the response; today's fallback is cached briefly so
  // a recovered source shows up quickly.
  res.set(
    'Cache-Control',
    !isToday
      ? 'public, max-age=3600, s-maxage=3600'
      : payload.isFallback
        ? 'public, max-age=300, s-maxage=600'
        : 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=7200',
  );
  return res.json(payload);
});

/**
 * Full computed Panchangam and the generated rasi palan for all 12 rasis.
 * `date` (YYYY-MM-DD, IST) defaults to today; any date works because nothing
 * here is scraped. Scraped predictions and diffs are included when that day
 * is already cached in memory or in the shared store (this endpoint never
 * triggers a scrape itself). `lang=en` for English names and readings.
 */
app.get('/api/panchangam', async (req, res) => {
  const { place, day, offset } = requestContext(req.query);
  if (!day) return res.status(400).json(INVALID_DATE);

  const lang = parseLang(req.query.lang);
  const timings = computePanchangam(day, place.lat, place.lon, offset);
  const astroDay = safeAstroDay(day, place.lat, place.lon, lang, place.timezone);
  if (!timings || !astroDay) return res.status(500).json({ error: 'panchangam_unavailable' });

  const [stored, archive] = await Promise.all([getStoredScrape(day), getArchive(day.iso)]);
  const nalla = nallaNeramFor(timings.raw, place, stored.nallaNeram || (archive.dailythanthi && archive.dailythanthi.nallaNeram));
  const sheetDay = archive.tamildailycalendar && archive.tamildailycalendar.status === 'ok' ? archive.tamildailycalendar : null;

  res.set('Cache-Control', 'public, max-age=1800, s-maxage=3600');
  return res.json({
    date: day.iso,
    lang,
    location: locationMeta(place),
    weekdayTamil: TAMIL_WEEKDAYS[day.weekday],
    weekday: (lang === 'en' ? ENGLISH_WEEKDAYS : TAMIL_WEEKDAYS)[day.weekday],
    ...astroDay.panchangam,
    moonChange: astroDay.moonChange,
    timeline: buildTimeline(timings.raw, nalla),
    sunrise: timings.sunrise,
    sunset: timings.sunset,
    rahuKalam: timings.rahuKalam,
    yamagandam: timings.yamagandam,
    kuligai: timings.kuligai,
    abhijit: timings.abhijit,
    nallaNeram: nalla ? (lang === 'en' ? timeLabelsToEnglish(nalla.text) : nalla.text) : null,
    nallaNeramSource: nalla ? nalla.source : null,
    gowri: gowriFor(timings.raw, lang),
    calendar: calendarExtras(day, timings.raw, place, offset, lang),
    // The daily calendar's word for each rasi (when its sheet was read completely), with English.
    sheet: sheetDay
      ? (() => {
        const usable = Object.entries(sheetDay.rasis).filter(([, v]) => v.word && !isRasiName(v.word));
        return {
          words: Object.fromEntries(usable.map(([k, v]) => [k, v.word])),
          english: Object.fromEntries(usable.map(([k, v]) => [k, MAHA_WORDS_EN[v.word] || null])),
        };
      })()
      : null,
    rasiPalan: RASIS.map((rasi) => {
      const generated = astroDay.generated[rasi.key];
      const { sheet, papers } = thirdPartyFor(rasi.key, stored, archive);
      const diff = diffScore(generated, papers[0] ? papers[0].text : null);
      return {
        rasi: rasi.key,
        rasiTamil: rasi.tamil,
        generated,
        sheetWord: sheet ? sheet.word : null,
        scraped: papers[0] ? publicPaper(papers[0]) : null,
        diffScore: diff ? diff.score : null,
        diff,
      };
    }),
  });
});

/**
 * Janma rasi from birth details: `?date=YYYY-MM-DD&time=HH:MM` local time at
 * the birth place, in IST by default; `tz=<IANA name>` (DST-aware) or
 * `tzOffset=<minutes>` for births elsewhere. Returns the rasi key the app
 * uses plus nakshatra and pada.
 */
app.get('/api/birth-rasi', (req, res) => {
  const day = req.query.date === undefined ? null : parseDateParam(req.query.date);
  const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(req.query.time || ''));
  const tz = req.query.tz === undefined ? null : String(req.query.tz);
  const tzOk = tz === null || isValidTimeZone(tz);
  let offset = req.query.tzOffset === undefined ? IST_OFFSET : Number(req.query.tzOffset);
  if (!day || !time || !tzOk || !Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
    return res.status(400).json({
      error: 'invalid_birth_details',
      message: 'Use date=YYYY-MM-DD (1900–2100), time=HH:MM (24-hour) and optionally tz=<IANA timezone> or tzOffset in minutes.',
    });
  }
  const wallClockMs = Date.UTC(day.year, day.month - 1, day.day, Number(time[1]), Number(time[2]));
  if (tz) {
    // Offset in force at that wall-clock time (two passes settle DST edges).
    offset = tzOffsetMinutes(tz, wallClockMs - tzOffsetMinutes(tz, wallClockMs) * 60_000);
  }
  const lang = parseLang(req.query.lang);
  const ms = wallClockMs - offset * 60_000;
  const moon = moonPosition(ms, lang);
  const rasi = RASIS[moon.rasiIndex];

  // Within ~1° (about 2 hours of Moon motion) of a boundary, a wrong birth time can change the answer.
  const nearRasiEdge = Math.min(moon.longitude % 30, 30 - (moon.longitude % 30)) < 1;
  res.set('Cache-Control', 'public, max-age=86400');
  return res.json({
    rasi: rasi.key,
    rasiTamil: rasi.tamil,
    rasiEnglish: rasi.english,
    rasiName: lang === 'en' ? `${moon.rasi} (${rasi.english})` : rasi.tamil,
    nakshatra: moon.nakshatra,
    pada: moon.pada,
    moonLongitude: moon.longitude,
    nearRasiEdge,
    method: 'drik-lahiri',
  });
});

/**
 * Morning scrape, called by Supabase pg_cron (or any scheduler) with header
 * `x-cron-secret: <CRON_SECRET>`. Disabled (404) unless CRON_SECRET is set.
 * Skips the network when the stored day is already complete.
 */
app.post('/api/cron/scrape', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(404).json({ error: 'not_found' });
  if (req.get('x-cron-secret') !== secret) return res.status(401).json({ error: 'unauthorized' });

  const today = localToday();
  const archived = store ? await store.getArchive(today.iso) : {};
  const papers = [...new Set(CONFIG.sources.map(sourceIdFor))].filter((id) => PAPER_PRIORITY.includes(id));
  if (store && papers.length && papers.every((id) => archived[id] && archived[id].status === 'ok')) {
    return res.json({ date: today.iso, rasis: RASIS.length, skipped: 'every paper already archived' });
  }

  const result = await scrapeAndStore(today);
  remember(today, result);
  return res.json({
    date: today.iso,
    rasis: Object.keys(result.predictions).length,
    source: result.source,
    stored: Boolean(store) && Object.keys(result.predictions).length > 0,
    archived: Object.keys(result.bySource || {}).filter((id) => PAPER_PRIORITY.includes(id)),
    errors: result.errors,
  });
});

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[express] unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
});

// Start a listener only when run directly (`node index.js`). When imported by
// a serverless runtime (Vercel, Supabase), the exported app is the handler.
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(CONFIG.port, () => {
    console.log(`Kaalam API listening on http://localhost:${CONFIG.port}`);
    if (!CONFIG.sources.length) {
      console.log('RASIPALAN_SOURCES is empty: predictions will use the Tamil fallback text.');
    }
    if (store) console.log('Shared daily cache: Supabase table daily_scrape.');
  });
}

export default app;
export const _internals = {
  normaliseRasi,
  cleanText,
  parseHtml,
  parseRss,
  extractNallaNeram,
  parseNallaNeramRanges,
  buildTimeline,
  computePanchangam,
  computeAstroDay,
  RASI_NAMES,
  solarTimes,
  localToday,
  formatRange,
  buildPayload,
  nallaNeramFor,
  scrapeAllSources,
  gowriFor,
  requestContext,
  RASIS,
};
