/**
 * Nalla Neram and Gowri Panchangam.
 *
 * Standard Nalla Neram (நல்ல நேரம்) is a fixed weekday table in Indian
 * Standard Time, as printed in Tamil daily calendars. Values below were
 * checked against Daily Thanthi's daily Panchangam (Oct–Nov 2026, the most
 * frequent value per weekday) and the Maha Calendar sheets (Thu 12 and
 * Sat 14 Nov 2026), which agree.
 *
 * Gowri Panchangam divides sunrise→sunset and sunset→next sunrise into 8
 * equal parts each; the weekday decides which Gowri rules each part. The
 * sequences are those published by drikpanchang.com (from the Pambu
 * Panchangam), verified for every weekday on 8–14 Nov 2026. Amirdha, Dhanam,
 * Uthi, Laabam and Sugam are auspicious; Rogam, Soram and Visham are not.
 */

const hm = (h, m) => h * 60 + m;

/** Sun..Sat: [[start, end], ...] in minutes after midnight IST. */
const WEEKDAY_NALLA_NERAM = Object.freeze([
  [[hm(7, 45), hm(8, 45)], [hm(15, 15), hm(16, 15)]],
  [[hm(6, 15), hm(7, 15)], [hm(16, 45), hm(17, 45)]],
  [[hm(7, 45), hm(8, 45)], [hm(16, 45), hm(17, 45)]],
  [[hm(9, 15), hm(10, 15)], [hm(16, 45), hm(17, 45)]],
  [[hm(10, 45), hm(11, 45)], [hm(12, 15), hm(13, 15)]],
  [[hm(9, 15), hm(10, 15)], [hm(16, 45), hm(17, 45)]],
  [[hm(7, 45), hm(8, 45)], [hm(16, 45), hm(17, 45)]],
]);

export function weekdayNallaNeram(weekday) {
  return WEEKDAY_NALLA_NERAM[weekday].map(([start, end]) => [start, end]);
}

/** "காலை 7.45 - 8.45, மாலை 4.45 - 5.45": newspaper style, 12-hour clock. */
export function formatTamilRanges(ranges) {
  const clock = (m) => {
    const h = Math.floor(m / 60) % 12 || 12;
    return `${h}.${String(m % 60).padStart(2, '0')}`;
  };
  const part = (m) => (m < 12 * 60 ? 'காலை' : m < 15 * 60 ? 'மதியம்' : m < 19 * 60 ? 'மாலை' : 'இரவு');
  return ranges.map(([s, e]) => `${part(s)} ${clock(s)} - ${clock(e)}`).join(', ');
}

const GOWRI_NAMES = Object.freeze({
  amirdha: { ta: 'அமிர்தம்', en: 'Amirdha', good: true },
  dhanam: { ta: 'தனம்', en: 'Dhanam', good: true },
  uthi: { ta: 'உத்தி', en: 'Uthi', good: true },
  laabam: { ta: 'லாபம்', en: 'Laabam', good: true },
  sugam: { ta: 'சுகம்', en: 'Sugam', good: true },
  rogam: { ta: 'ரோகம்', en: 'Rogam', good: false },
  soram: { ta: 'சோரம்', en: 'Soram', good: false },
  visham: { ta: 'விஷம்', en: 'Visham', good: false },
});

/** Sun..Sat, 8 equal parts of sunrise → sunset. */
const GOWRI_DAY = Object.freeze([
  ['uthi', 'amirdha', 'rogam', 'laabam', 'dhanam', 'sugam', 'soram', 'visham'],
  ['amirdha', 'visham', 'rogam', 'laabam', 'dhanam', 'sugam', 'soram', 'uthi'],
  ['rogam', 'laabam', 'dhanam', 'sugam', 'soram', 'uthi', 'visham', 'amirdha'],
  ['laabam', 'dhanam', 'sugam', 'soram', 'visham', 'uthi', 'amirdha', 'rogam'],
  ['dhanam', 'sugam', 'soram', 'uthi', 'amirdha', 'visham', 'rogam', 'laabam'],
  ['sugam', 'soram', 'uthi', 'visham', 'amirdha', 'rogam', 'laabam', 'dhanam'],
  ['soram', 'uthi', 'visham', 'amirdha', 'rogam', 'laabam', 'dhanam', 'sugam'],
]);

/** Sun..Sat, 8 equal parts of sunset → next sunrise. */
const GOWRI_NIGHT = Object.freeze([
  ['dhanam', 'sugam', 'soram', 'visham', 'uthi', 'amirdha', 'rogam', 'laabam'],
  ['sugam', 'soram', 'uthi', 'amirdha', 'visham', 'rogam', 'laabam', 'dhanam'],
  ['soram', 'uthi', 'visham', 'amirdha', 'rogam', 'laabam', 'dhanam', 'sugam'],
  ['uthi', 'amirdha', 'rogam', 'laabam', 'dhanam', 'sugam', 'soram', 'visham'],
  ['amirdha', 'visham', 'rogam', 'laabam', 'dhanam', 'sugam', 'soram', 'uthi'],
  ['rogam', 'laabam', 'dhanam', 'sugam', 'soram', 'uthi', 'visham', 'amirdha'],
  // As published: Soram appears twice and Rogam not at all on Saturday night.
  ['laabam', 'dhanam', 'sugam', 'soram', 'uthi', 'visham', 'amirdha', 'soram'],
]);

/**
 * The 16 Gowri slots of a day (8 day + 8 night), in minutes after local
 * midnight of that day (night slots run past 1440).
 *
 * @param nextSunrise next day's sunrise, in minutes after *its* midnight
 */
export function gowriSlots(weekday, sunrise, sunset, nextSunrise, lang = 'ta') {
  const day = (sunset - sunrise) / 8;
  const night = (nextSunrise + 1440 - sunset) / 8;
  const slot = (key, start, length, part) => ({
    key,
    name: GOWRI_NAMES[key][lang === 'en' ? 'en' : 'ta'],
    good: GOWRI_NAMES[key].good,
    part,
    start: Math.round(start),
    end: Math.round(start + length),
  });
  return [
    ...GOWRI_DAY[weekday].map((key, i) => slot(key, sunrise + i * day, day, 'day')),
    ...GOWRI_NIGHT[weekday].map((key, i) => slot(key, sunset + i * night, night, 'night')),
  ];
}

/**
 * Nalla Neram derived from Gowri for places outside IST (where the printed
 * weekday table does not apply): the good daytime slots, minus Rahu Kalam,
 * Yamagandam and Kuligai, with touching ranges merged.
 */
export function gowriNallaNeram(slots, inauspicious) {
  let ranges = slots.filter((s) => s.good && s.part === 'day').map((s) => [s.start, s.end]);
  for (const [bs, be] of inauspicious) {
    ranges = ranges.flatMap(([s, e]) => {
      if (be <= s || bs >= e) return [[s, e]];
      return [[s, bs], [be, e]].filter(([a, b]) => b - a >= 1);
    });
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges.reduce((out, r) => {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
    return out;
  }, []);
}
