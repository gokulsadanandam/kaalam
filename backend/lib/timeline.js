/**
 * The day as a list of timed periods, for "now / next" displays and timeline
 * bars. Times are minutes after local midnight.
 *
 * Nalla Neram comes pre-resolved (index.js nallaNeramFor: newspaper ranges,
 * the weekday table, or Gowri). Rahu Kalam, Yamagandam and Kuligai are
 * always computed.
 */

/** Time-of-day words and how to turn their 12-hour clock into 24-hour. */
const DAY_PARTS = [
  { pattern: /அதிகாலை/u, part: 'early' },
  { pattern: /காலை/u, part: 'morning' },
  { pattern: /நண்பகல்|மதியம்|பிற்பகல்/u, part: 'afternoon' },
  { pattern: /மாலை/u, part: 'evening' },
  { pattern: /இரவு/u, part: 'night' },
];

/** 12-hour clock hour (+ fraction) in a part of day -> minutes after midnight. */
function toMinutes(hour, minute, part) {
  let h = hour;
  if (part === 'afternoon') {
    if (h < 12 && h <= 6) h += 12; // "மதியம் 1.30" = 13:30, "நண்பகல் 12" stays 12:00
  } else if (part === 'evening' || part === 'night') {
    if (h < 12) h += 12;
  }
  // Morning 12 is noon ("காலை 11-12" = 11 AM to noon).
  return h * 60 + minute;
}

/** "7.45" / "8" / "10:15" -> { hour, minute } */
function parseClock(text) {
  const match = /^(\d{1,2})(?:[.:](\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return hour <= 12 && minute < 60 ? { hour, minute } : null;
}

/**
 * Parse a newspaper Nalla Neram line into [[start, end], ...] minutes.
 * A range without its own time-of-day word inherits the previous one
 * ("காலை 6-7.30, 9-10" -> both morning). Returns [] when nothing parses.
 */
function parseNallaNeramRanges(text) {
  if (!text) return [];
  const ranges = [];
  let part = null;
  const pieces = String(text).split(/[,;]|(?=அதிகாலை|காலை|நண்பகல்|மதியம்|பிற்பகல்|மாலை|இரவு)/u);
  for (const raw of pieces) {
    const piece = raw.trim();
    if (!piece) continue;
    const named = DAY_PARTS.find((d) => d.pattern.test(piece));
    if (named) part = named.part;
    const match = /(\d{1,2}(?:[.:]\d{1,2})?)\s*[-–—]\s*(\d{1,2}(?:[.:]\d{1,2})?)/u.exec(piece);
    if (!match || !part) continue;
    const a = parseClock(match[1]);
    const b = parseClock(match[2]);
    if (!a || !b) continue;
    let start = toMinutes(a.hour, a.minute, part);
    let end = toMinutes(b.hour, b.minute, part);
    // "11-1" around noon, "நண்பகல் 12-1": the end crossed into the afternoon.
    if (end <= start && b.hour < 12) end += 12 * 60;
    if (end <= start && a.hour === 12 && part !== 'morning') start -= 12 * 60;
    if (start >= 0 && end <= 24 * 60 && end > start && end - start <= 4 * 60) ranges.push([start, end]);
  }
  return ranges;
}

/**
 * @param raw   computePanchangam(...).raw
 * @param nalla { ranges, source } from the Nalla Neram resolver (newspaper,
 *              weekday-table or gowri), or null
 * @returns { sunrise, sunset, periods: [{ type, start, end, source }] } sorted by start
 */
function buildTimeline(raw, nalla) {
  if (!raw) return null;
  const periods = [];
  const add = (type, pair, source = 'computed') => {
    if (pair) periods.push({ type, start: pair[0], end: pair[1], source });
  };
  add('rahuKalam', raw.rahuKalam);
  add('yamagandam', raw.yamagandam);
  add('kuligai', raw.kuligai);
  if (nalla) nalla.ranges.forEach((pair) => add('nallaNeram', pair, nalla.source));

  periods.sort((a, b) => a.start - b.start || a.end - b.end);
  return { sunrise: raw.sunrise, sunset: raw.sunset, periods };
}

export { parseNallaNeramRanges, buildTimeline };
