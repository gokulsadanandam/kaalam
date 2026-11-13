/**
 * Extras printed on Tamil daily calendar sheets, computed:
 *
 *  - சூலம் (soolam, the direction to avoid travelling) and its பரிகாரம்
 *    (remedy), a fixed weekday table. Checked against the Maha Calendar
 *    sheets (Thu 12 Nov 2026: தெற்கு / தைலம்; Sat 14 Nov: கிழக்கு / தயிர்).
 *  - The lagnam (rising sign) at sunrise and when it ends ("துலா லக்னம்
 *    இருப்பு …"), from sidereal time and the true obliquity, Lahiri ayanamsa.
 *  - Day of the year and days left.
 */
import Astronomy from './astronomy.js';
import { lahiriAyanamsa, namesFor } from './panchangam.js';

const SOOLAM = Object.freeze({
  ta: {
    direction: ['மேற்கு', 'கிழக்கு', 'வடக்கு', 'வடக்கு', 'தெற்கு', 'மேற்கு', 'கிழக்கு'],
    remedy: ['வெல்லம்', 'தயிர்', 'பால்', 'பால்', 'தைலம்', 'வெல்லம்', 'தயிர்'],
  },
  en: {
    direction: ['West', 'East', 'North', 'North', 'South', 'West', 'East'],
    remedy: ['Jaggery', 'Curd', 'Milk', 'Milk', 'Sesame oil', 'Jaggery', 'Curd'],
  },
});

export function soolam(weekday, lang = 'ta') {
  const t = lang === 'en' ? SOOLAM.en : SOOLAM.ta;
  return { direction: t.direction[weekday], remedy: t.remedy[weekday] };
}

const rad = Math.PI / 180;
const norm = (deg) => ((deg % 360) + 360) % 360;

/** Sidereal (Lahiri) longitude of the ascendant at [ms] for [lat], [lon]. */
export function ascendant(ms, lat, lon) {
  const time = Astronomy.MakeTime(new Date(ms));
  const ramc = norm(Astronomy.SiderealTime(time) * 15 + lon) * rad;
  const eps = Astronomy.e_tilt(time).tobl * rad;
  const phi = lat * rad;
  const tropical = norm(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / rad);
  return norm(tropical - lahiriAyanamsa(ms));
}

/**
 * Lagnam rising at sunrise and the instant it ends.
 * @returns { index, name, endMs }
 */
export function sunriseLagna(sunriseMs, lat, lon, lang = 'ta') {
  const index = Math.floor(ascendant(sunriseMs, lat, lon) / 30);
  const inSign = (ms) => Math.floor(ascendant(ms, lat, lon) / 30) === index;
  // A sign rises in roughly 1.5–3 hours; step by minutes, then bisect.
  let lo = sunriseMs;
  let hi = sunriseMs + 60_000;
  while (inSign(hi) && hi - sunriseMs < 4 * 3_600_000) {
    lo = hi;
    hi += 60_000;
  }
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (inSign(mid)) lo = mid;
    else hi = mid;
  }
  return { index, name: namesFor(lang).rasis[index], endMs: hi };
}

/** 1-based day of the year and days remaining after it. */
export function dayOfYear({ year, month, day }) {
  const n = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86_400_000);
  const total = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  return { dayOfYear: n, daysLeft: total - n };
}

// ---------------------------------------------------------------------------
// Ayanam, ruthu, lunar month and the planets (the chart on a calendar sheet)
// ---------------------------------------------------------------------------

const SEASONS = Object.freeze({
  ta: {
    ayanam: ['உத்தராயணம்', 'தட்சிணாயனம்'],
    ruthu: ['வசந்த ருது', 'கிரீஷ்ம ருது', 'வர்ஷ ருது', 'சரத் ருது', 'ஹேமந்த ருது', 'சிசிர ருது'],
  },
  en: {
    ayanam: ['Uttarayanam', 'Dakshinayanam'],
    ruthu: ['Vasantha ruthu', 'Grishma ruthu', 'Varsha ruthu', 'Sharad ruthu', 'Hemantha ruthu', 'Shishira ruthu'],
  },
});

const siderealSun = (ms) => norm(Astronomy.SunPosition(new Date(ms)).elon - lahiriAyanamsa(ms));

/**
 * Ayanam (Thai 1 starts Uttarayanam, Aadi 1 Dakshinayanam) and ruthu (two
 * solar months each, Chithirai–Vaikasi = Vasantha), from the Sun's rasi.
 */
export function seasons(ms, lang = 'ta') {
  const t = lang === 'en' ? SEASONS.en : SEASONS.ta;
  const rasi = Math.floor(siderealSun(ms) / 30);
  const uttarayanam = rasi >= 9 || rasi <= 2;
  return { ayanam: t.ayanam[uttarayanam ? 0 : 1], ruthu: t.ruthu[Math.floor(rasi / 2)] };
}

/**
 * Amanta lunar month in force at [ms], named as Tamil calendars print it
 * ("கார்த்திகை வளர்பிறை"): the month begun by the last new moon, named by the
 * Sun's rasi at that new moon (Sun in Meenam -> Chithirai, Thulam ->
 * Karthigai). Adhika (leap) months are not marked.
 */
export function lunarMonth(ms, lang = 'ta') {
  let newMoon = Astronomy.SearchMoonPhase(0, Astronomy.MakeTime(new Date(ms - 32 * 86_400_000)), 40);
  for (;;) {
    const next = Astronomy.SearchMoonPhase(0, newMoon.AddDays(1), 40);
    if (!next || next.date.getTime() > ms) break;
    newMoon = next;
  }
  const sunRasi = Math.floor(siderealSun(newMoon.date.getTime()) / 30);
  return namesFor(lang).months[(sunRasi + 1) % 12];
}

const PLANETS = Object.freeze([
  { key: 'sun', ta: 'சூரி', en: 'Su' },
  { key: 'moon', ta: 'சந்', en: 'Mo' },
  { key: 'mars', ta: 'செவ்', en: 'Ma', body: 'Mars' },
  { key: 'mercury', ta: 'புத', en: 'Me', body: 'Mercury' },
  { key: 'jupiter', ta: 'குரு', en: 'Ju', body: 'Jupiter' },
  { key: 'venus', ta: 'சுக்', en: 'Ve', body: 'Venus' },
  { key: 'saturn', ta: 'சனி', en: 'Sa', body: 'Saturn' },
  { key: 'rahu', ta: 'ராகு', en: 'Ra' },
  { key: 'ketu', ta: 'கேது', en: 'Ke' },
]);

/** Tropical apparent longitude of a planet (true ecliptic of date). */
function tropicalLongitude(planet, ms) {
  const time = Astronomy.MakeTime(new Date(ms));
  if (planet.key === 'sun') return Astronomy.SunPosition(time).elon;
  if (planet.key === 'moon') return Astronomy.EclipticGeoMoon(time).lon;
  if (planet.body) return Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[planet.body], time, true)).elon;
  // Mean lunar node (Rahu), as most Tamil almanacs use; Ketu opposite.
  const T = (ms - Date.UTC(2000, 0, 1, 12)) / (36525 * 86_400_000);
  const rahu = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T;
  return planet.key === 'rahu' ? rahu : rahu + 180;
}

/**
 * Sidereal positions of the nine grahas at [ms] (the sunrise chart printed on
 * calendar sheets): rasi index, degree within the rasi, and whether the planet
 * is retrograde (Rahu and Ketu always are).
 */
export function planetPositions(ms, lang = 'ta') {
  const ayanamsa = lahiriAyanamsa(ms);
  return PLANETS.map((p) => {
    const lon = norm(tropicalLongitude(p, ms) - ayanamsa);
    let retrograde = p.key === 'rahu' || p.key === 'ketu';
    if (p.body) {
      const delta = ((tropicalLongitude(p, ms + 86_400_000) - tropicalLongitude(p, ms) + 540) % 360) - 180;
      retrograde = delta < 0;
    }
    return {
      key: p.key,
      name: lang === 'en' ? p.en : p.ta,
      rasiIndex: Math.floor(lon / 30),
      degree: Math.round((lon % 30) * 10) / 10,
      retrograde,
    };
  });
}
