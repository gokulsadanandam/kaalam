/**
 * Astronomical Panchangam: tithi, nakshatram, yogam, karanam, chandra rasi,
 * chandrashtamam and the Tamil solar date — computed, never scraped.
 *
 * Method (Drik / Thirukanitha):
 *   - Apparent geocentric Sun and Moon longitudes from `astronomy-engine`
 *     (true ecliptic of date, ~1 arcminute).
 *   - Sidereal = tropical − Lahiri (Chitrapaksha) ayanamsa.
 *   - Each element is an angle divided into equal spans; its end time is found
 *     by stepping hourly and bisecting to 5 seconds.
 *
 * Printed Tamil calendars that follow the Vakya system can differ from these
 * Drik values by a few minutes up to an hour or so.
 *
 * All times are UTC epoch milliseconds; the caller formats them.
 */
import Astronomy from './astronomy.js';

const HOUR_MS = 3_600_000;
const NAKSHATRA_SPAN = 360 / 27;

/** Same order as the API's RASIS list (Mesham = 0). */
const RASI_NAMES = [
  'மேஷம்', 'ரிஷபம்', 'மிதுனம்', 'கடகம்', 'சிம்மம்', 'கன்னி',
  'துலாம்', 'விருச்சிகம்', 'தனுசு', 'மகரம்', 'கும்பம்', 'மீனம்',
];

/** Tamil month = the sidereal rasi the Sun is in (Mesham -> சித்திரை). */
const TAMIL_MONTHS = [
  'சித்திரை', 'வைகாசி', 'ஆனி', 'ஆடி', 'ஆவணி', 'புரட்டாசி',
  'ஐப்பசி', 'கார்த்திகை', 'மார்கழி', 'தை', 'மாசி', 'பங்குனி',
];

/** 60-year cycle; பிரபவ began at Chithirai 1, 1987. */
const TAMIL_YEARS = [
  'பிரபவ', 'விபவ', 'சுக்ல', 'பிரமோதூத', 'பிரசோற்பத்தி', 'ஆங்கீரச', 'ஸ்ரீமுக', 'பவ', 'யுவ', 'தாது',
  'ஈஸ்வர', 'வெகுதானிய', 'பிரமாதி', 'விக்கிரம', 'விஷு', 'சித்திரபானு', 'சுபானு', 'தாரண', 'பார்த்திப', 'விய',
  'சர்வஜித்', 'சர்வதாரி', 'விரோதி', 'விக்ருதி', 'கர', 'நந்தன', 'விஜய', 'ஜய', 'மன்மத', 'துன்முகி',
  'ஹேவிளம்பி', 'விளம்பி', 'விகாரி', 'சார்வரி', 'பிலவ', 'சுபகிருது', 'சோபகிருது', 'குரோதி', 'விசுவாவசு', 'பராபவ',
  'பிலவங்க', 'கீலக', 'சௌமிய', 'சாதாரண', 'விரோதகிருது', 'பரிதாபி', 'பிரமாதீச', 'ஆனந்த', 'ராட்சச', 'நள',
  'பிங்கள', 'காளயுக்தி', 'சித்தார்த்தி', 'ரௌத்திரி', 'துன்மதி', 'துந்துபி', 'ருத்ரோத்காரி', 'ரக்தாட்சி', 'குரோதன', 'அட்சய',
];
const TAMIL_YEAR_EPOCH = 1987;

const TITHIS = [
  'பிரதமை', 'துவிதியை', 'திருதியை', 'சதுர்த்தி', 'பஞ்சமி', 'சஷ்டி', 'சப்தமி', 'அஷ்டமி',
  'நவமி', 'தசமி', 'ஏகாதசி', 'துவாதசி', 'திரயோதசி', 'சதுர்த்தசி',
];

const NAKSHATRAS = [
  'அசுவினி', 'பரணி', 'கார்த்திகை', 'ரோகிணி', 'மிருகசீரிடம்', 'திருவாதிரை', 'புனர்பூசம்', 'பூசம்', 'ஆயில்யம்',
  'மகம்', 'பூரம்', 'உத்திரம்', 'அஸ்தம்', 'சித்திரை', 'சுவாதி', 'விசாகம்', 'அனுஷம்', 'கேட்டை',
  'மூலம்', 'பூராடம்', 'உத்திராடம்', 'திருவோணம்', 'அவிட்டம்', 'சதயம்', 'பூரட்டாதி', 'உத்திரட்டாதி', 'ரேவதி',
];

const YOGAS = [
  'விஷ்கம்பம்', 'பிரீதி', 'ஆயுஷ்மான்', 'சௌபாக்கியம்', 'சோபனம்', 'அதிகண்டம்', 'சுகர்மம்', 'திருதி', 'சூலம்',
  'கண்டம்', 'விருத்தி', 'துருவம்', 'வியாகாதம்', 'ஹர்ஷணம்', 'வஜ்ரம்', 'சித்தி', 'வியதீபாதம்', 'வரியான்',
  'பரிகம்', 'சிவம்', 'சித்தம்', 'சாத்தியம்', 'சுபம்', 'சுப்பிரம்', 'பிராம்மியம்', 'ஐந்திரம்', 'வைதிருதி',
];

const MOVABLE_KARANAS = ['பவம்', 'பாலவம்', 'கௌலவம்', 'தைதுலம்', 'கரசை', 'வணிசை', 'பத்திரை'];
const FIXED_KARANAS = ['சகுனி', 'சதுஷ்பாதம்', 'நாகவம்']; // karana 57, 58, 59; karana 0 is கிம்ஸ்துக்னம்

/** Every name in both languages. English uses the transliterations common in Tamil calendars. */
const NAMES = Object.freeze({
  ta: {
    rasis: RASI_NAMES,
    months: TAMIL_MONTHS,
    years: TAMIL_YEARS,
    tithis: TITHIS,
    fullMoon: 'பௌர்ணமி',
    newMoon: 'அமாவாசை',
    nakshatras: NAKSHATRAS,
    yogas: YOGAS,
    movableKaranas: MOVABLE_KARANAS,
    fixedKaranas: FIXED_KARANAS,
    kimstughna: 'கிம்ஸ்துக்னம்',
    waxing: 'வளர்பிறை',
    waning: 'தேய்பிறை',
  },
  en: {
    rasis: ['Mesham', 'Rishabam', 'Mithunam', 'Kadagam', 'Simmam', 'Kanni',
      'Thulam', 'Viruchigam', 'Dhanusu', 'Magaram', 'Kumbam', 'Meenam'],
    months: ['Chithirai', 'Vaikasi', 'Aani', 'Aadi', 'Aavani', 'Purattasi',
      'Aippasi', 'Karthigai', 'Margazhi', 'Thai', 'Maasi', 'Panguni'],
    years: [
      'Prabhava', 'Vibhava', 'Shukla', 'Pramodhoota', 'Prajothpatti', 'Aangirasa', 'Srimukha', 'Bhava', 'Yuva', 'Dhaathu',
      'Eeswara', 'Vehudhanya', 'Pramathi', 'Vikrama', 'Vishu', 'Chitrabhanu', 'Subhanu', 'Thaarana', 'Paarthiba', 'Viya',
      'Sarvajith', 'Sarvadhari', 'Virodhi', 'Vikruthi', 'Kara', 'Nandhana', 'Vijaya', 'Jaya', 'Manmatha', 'Dhunmuki',
      'Hevilambi', 'Vilambi', 'Vikari', 'Sarvari', 'Plava', 'Subhakruth', 'Sobhakruth', 'Krodhi', 'Visuvaavasu', 'Parabhava',
      'Plavanga', 'Keelaka', 'Saumya', 'Sadharana', 'Virodhikruth', 'Paridhaabi', 'Pramaadhisa', 'Aanandha', 'Rakshasa', 'Nala',
      'Pingala', 'Kalayukthi', 'Siddharthi', 'Raudhri', 'Dhunmathi', 'Dhundubhi', 'Rudhrodhgaari', 'Raktakshi', 'Krodhana', 'Akshaya',
    ],
    tithis: ['Prathamai', 'Dwithiyai', 'Thrithiyai', 'Chathurthi', 'Panchami', 'Shashti', 'Sapthami', 'Ashtami',
      'Navami', 'Dasami', 'Ekadasi', 'Dwadasi', 'Thrayodasi', 'Chathurdasi'],
    fullMoon: 'Pournami',
    newMoon: 'Amavasai',
    nakshatras: [
      'Ashwini', 'Bharani', 'Karthigai', 'Rohini', 'Mirugaseersham', 'Thiruvathirai', 'Punarpoosam', 'Poosam', 'Ayilyam',
      'Magam', 'Pooram', 'Uthiram', 'Hastham', 'Chithirai', 'Swathi', 'Visakam', 'Anusham', 'Kettai',
      'Moolam', 'Pooradam', 'Uthiradam', 'Thiruvonam', 'Avittam', 'Sathayam', 'Poorattathi', 'Uthirattathi', 'Revathi',
    ],
    yogas: [
      'Vishkambham', 'Preethi', 'Aayushman', 'Saubhagyam', 'Shobhanam', 'Athigandam', 'Sukarmam', 'Dhruthi', 'Soolam',
      'Gandam', 'Vriddhi', 'Dhruvam', 'Vyaghatham', 'Harshanam', 'Vajram', 'Siddhi', 'Vyatheepatham', 'Variyan',
      'Parigam', 'Sivam', 'Siddham', 'Saadhyam', 'Subham', 'Subhram', 'Brahmyam', 'Aindhram', 'Vaidhruthi',
    ],
    movableKaranas: ['Bavam', 'Balavam', 'Kaulavam', 'Thaithulam', 'Garasai', 'Vanisai', 'Bhadhrai'],
    fixedKaranas: ['Sakuni', 'Chathushpadham', 'Naagavam'],
    kimstughna: 'Kimsthugnam',
    waxing: 'Valarpirai (waxing moon)',
    waning: 'Theipirai (waning moon)',
  },
});

/** 'en' or 'ta' (anything else falls back to Tamil). */
function namesFor(lang) {
  return NAMES[lang] || NAMES.ta;
}

function norm360(x) {
  return ((x % 360) + 360) % 360;
}

function norm180(x) {
  const n = norm360(x);
  return n > 180 ? n - 360 : n;
}

/**
 * Lahiri (Chitrapaksha) ayanamsa in degrees — the *true* ayanamsa, as Lahiri
 * is defined (23°15'00.658" on 1956-03-21 0h, including nutation): the J2000
 * mean value plus IAU 2006 general precession in longitude, plus nutation in
 * longitude Δψ. Since the Sun and Moon longitudes are apparent (true equinox
 * of date), adding Δψ here cancels it out of every sidereal position.
 */
function lahiriAyanamsa(ms) {
  const T = (ms - Date.UTC(2000, 0, 1, 12)) / (36525 * 86_400_000);
  return 23.857092 + (5028.796195 * T + 1.1054348 * T * T) / 3600
    + Astronomy.e_tilt(Astronomy.MakeTime(new Date(ms))).dpsi / 3600; // Δψ is in arcseconds
}

function positions(ms) {
  const date = new Date(ms);
  return {
    sun: Astronomy.SunPosition(date).elon,
    moon: Astronomy.EclipticGeoMoon(date).lon,
    ayanamsa: lahiriAyanamsa(ms),
  };
}

const elongation = (p) => norm360(p.moon - p.sun);
const moonSidereal = (p) => norm360(p.moon - p.ayanamsa);

/** Every element is an angle that only ever increases, cut into equal spans. */
const ELEMENTS = Object.freeze({
  tithi: { span: 12, count: 30, angle: elongation },
  karana: { span: 6, count: 60, angle: elongation },
  nakshatra: { span: NAKSHATRA_SPAN, count: 27, angle: moonSidereal },
  yoga: { span: NAKSHATRA_SPAN, count: 27, angle: (p) => norm360(p.moon + p.sun - 2 * p.ayanamsa) },
  moonRasi: { span: 30, count: 12, angle: moonSidereal },
  sunRasi: { span: 30, count: 12, angle: (p) => norm360(p.sun - p.ayanamsa) },
});

function indexAt(element, ms) {
  return Math.floor(element.angle(positions(ms)) / element.span) % element.count;
}

/** When does `element` leave the index it has at `startMs`? null if beyond the horizon. */
function endOf(element, startMs, horizonMs = 34 * HOUR_MS) {
  const boundary = ((indexAt(element, startMs) + 1) * element.span) % 360;
  const crossed = (ms) => norm180(element.angle(positions(ms)) - boundary) >= 0;

  let lo = startMs;
  let hi = null;
  for (let t = startMs + HOUR_MS; t <= startMs + horizonMs; t += HOUR_MS) {
    if (crossed(t)) {
      hi = t;
      break;
    }
    lo = t;
  }
  if (hi === null) return null;
  // Return a time *after* the change (≤ 5 s late) so the next span starts on the next value.
  while (hi - lo > 5_000) {
    const mid = (lo + hi) / 2;
    if (crossed(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

/** The run of values an element takes from `startMs` until `untilMs`. */
function spansBetween(element, startMs, untilMs) {
  const spans = [];
  let t = startMs;
  while (spans.length < 4) {
    const index = indexAt(element, t);
    const endMs = endOf(element, t);
    spans.push({ index, endMs });
    if (endMs === null || endMs >= untilMs) break;
    t = endMs + 1000;
  }
  return spans;
}

function tithiName(index, n) {
  if (index === 14) return n.fullMoon;
  if (index === 29) return n.newMoon;
  return n.tithis[index % 15];
}

function karanaName(index, n) {
  if (index === 0) return n.kimstughna;
  if (index >= 57) return n.fixedKaranas[index - 57];
  return n.movableKaranas[(index - 1) % 7];
}

const named = (spans, nameOf) => spans.map((s) => ({ ...s, name: nameOf(s.index) }));

/**
 * Tamil solar date. Tamil Nadu convention: a month starts on the day of the
 * Sun's sankranti if it happens before sunset, otherwise the next day — i.e.
 * the month is the Sun's sidereal rasi *at sunset*.
 *
 * @param sunsetMsForDaysAgo (n) => sunset of the local day n days before today
 */
function tamilDate(sunsetMsForDaysAgo, gregorianYear, gregorianMonth, n) {
  const monthIndex = indexAt(ELEMENTS.sunRasi, sunsetMsForDaysAgo(0));
  let day = 1;
  while (day < 33 && indexAt(ELEMENTS.sunRasi, sunsetMsForDaysAgo(day)) === monthIndex) day++;

  // The Tamil year starts at Chithirai 1 (mid-April); மார்கழி..பங்குனி dates
  // in January–April still belong to the previous year.
  const yearBase = gregorianMonth <= 4 && monthIndex >= 8 ? gregorianYear - 1 : gregorianYear;
  const yearIndex = (((yearBase - TAMIL_YEAR_EPOCH) % 60) + 60) % 60;

  return { year: n.years[yearIndex], yearIndex, month: n.months[monthIndex], monthIndex, day };
}

/**
 * Chandrashtamam: the Moon in the 8th rasi from one's own. So the affected
 * rasi is 7 rasis behind the Moon's, and the affected birth stars are 16
 * stars behind the Moon's star (the Moon in the 17th star from them).
 */
function chandrashtamam(moonRasiSpans, nakshatraSpans, n) {
  return {
    rasis: moonRasiSpans.map((s) => ({ index: (s.index + 5) % 12, name: n.rasis[(s.index + 5) % 12], endMs: s.endMs })),
    stars: [...new Set(nakshatraSpans.map((s) => n.nakshatras[(s.index + 11) % 27]))],
  };
}

/**
 * Full Panchangam for one local day, sunrise to next sunrise (the traditional
 * Hindu day). Values are those prevailing at sunrise, with change times.
 * Names are in `lang` ('ta' default, or 'en'); the numbers never change.
 */
function computeAstroPanchangam({ sunriseMs, nextSunriseMs, sunsetMsForDaysAgo, gregorianYear, gregorianMonth, lang = 'ta' }) {
  const n = namesFor(lang);
  const window = (element) => spansBetween(element, sunriseMs, nextSunriseMs);

  const tithi = named(window(ELEMENTS.tithi), (i) => tithiName(i, n));
  const nakshatra = named(window(ELEMENTS.nakshatra), (i) => n.nakshatras[i]);
  const moonRasi = named(window(ELEMENTS.moonRasi), (i) => n.rasis[i]);

  return {
    tamilDate: tamilDate(sunsetMsForDaysAgo, gregorianYear, gregorianMonth, n),
    paksha: tithi[0].index < 15 ? n.waxing : n.waning,
    tithi,
    nakshatra,
    yoga: named(window(ELEMENTS.yoga), (i) => n.yogas[i]),
    karana: named(window(ELEMENTS.karana), (i) => karanaName(i, n)),
    moonRasi,
    chandrashtamam: chandrashtamam(moonRasi, nakshatra, n),
  };
}

/**
 * The same Panchangam with every name in `lang`. Only names depend on the
 * language, so one computed day serves both.
 */
function localizeAstroPanchangam(astro, lang = 'ta') {
  const n = namesFor(lang);
  const tithi = named(astro.tithi, (i) => tithiName(i, n));
  const nakshatra = named(astro.nakshatra, (i) => n.nakshatras[i]);
  const moonRasi = named(astro.moonRasi, (i) => n.rasis[i]);
  return {
    tamilDate: { ...astro.tamilDate, year: n.years[astro.tamilDate.yearIndex], month: n.months[astro.tamilDate.monthIndex] },
    paksha: tithi[0].index < 15 ? n.waxing : n.waning,
    tithi,
    nakshatra,
    yoga: named(astro.yoga, (i) => n.yogas[i]),
    karana: named(astro.karana, (i) => karanaName(i, n)),
    moonRasi,
    chandrashtamam: chandrashtamam(moonRasi, nakshatra, n),
  };
}

/**
 * Moon's sidereal (Lahiri) position at an instant: janma rasi, nakshatra and
 * pada for someone born then. Used by "find my rasi from birth details".
 */
function moonPosition(ms, lang = 'ta') {
  const n = namesFor(lang);
  const longitude = moonSidereal(positions(ms));
  const nakshatraIndex = Math.floor(longitude / NAKSHATRA_SPAN) % 27;
  const pada = Math.floor((longitude % NAKSHATRA_SPAN) / (NAKSHATRA_SPAN / 4)) + 1;
  const rasiIndex = Math.floor(longitude / 30) % 12;
  return {
    rasiIndex,
    rasi: n.rasis[rasiIndex],
    nakshatraIndex,
    nakshatra: n.nakshatras[nakshatraIndex],
    pada,
    longitude: Math.round(longitude * 1000) / 1000,
  };
}

export {
  computeAstroPanchangam,
  localizeAstroPanchangam,
  lahiriAyanamsa,
  moonPosition,
  namesFor,
  RASI_NAMES,
  NAKSHATRAS,
  TAMIL_MONTHS,
  TAMIL_YEARS,
};
