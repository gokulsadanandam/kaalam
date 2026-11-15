/**
 * Daily strength factors for one rasi, from the Panchangam of one day
 * (sunrise to next sunrise). Every factor is a value from -1 (adverse) to +1
 * (favourable), averaged over the part of the day each element holds, then
 * weighted into one composite:
 *
 *   Chandra Gochara 40%  the Moon's house counted from the rasi
 *   Tara Bala       30%  the day's star counted from each of the rasi's stars
 *   Tithi & Yoga    15%  tithi group (Nanda … Purna, Prathamai, Ashtami, Amavasai) and yoga
 *   Weekday lord    10%  natural friendship of the day's lord with the rasi lord
 *   Karana           5%  Vishti (Bhadrai) and the fixed karanas are adverse
 */

const WEIGHTS = Object.freeze({ gochara: 0.4, tara: 0.3, tithiYoga: 0.15, weekday: 0.1, karana: 0.05 });

/** Chandra Gochara score (-2 … +2) by house 1 … 12. */
const GOCHARA_SCORES = Object.freeze([null, 1, -1, 2, -1, -1, 2, 1, -2, -1, 2, 2, -1]);

/** Tara 1 … 9: Janma, Sampat, Vipat, Kshema, Pratyak, Sadhana, Naidhana, Mitra, Parama Mitra. */
const TARAS = Object.freeze([
  null,
  { score: -0.5, rating: 'mixed' },
  { score: 1, rating: 'good' },
  { score: -0.75, rating: 'caution' },
  { score: 0.75, rating: 'good' },
  { score: -0.75, rating: 'caution' },
  { score: 1, rating: 'good' },
  { score: -1, rating: 'caution' },
  { score: 0.75, rating: 'good' },
  { score: 1, rating: 'good' },
]);

/** Vishkambha, Atiganda, Shula, Ganda, Vyaghata, Vajra, Vyatipata, Parigha, Vaidhriti. */
const ADVERSE_YOGAS = new Set([0, 5, 8, 9, 12, 14, 16, 18, 26]);

/** Planets 0 … 6 = Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn (also the weekday lords, Sunday = 0). */
const RASI_LORDS = Object.freeze([2, 5, 3, 1, 0, 3, 5, 2, 4, 6, 6, 4]);
/** Naisargika (natural) friends and enemies, as each planet regards the others. */
const FRIENDS = Object.freeze([[1, 2, 4], [0, 3], [0, 1, 4], [0, 5], [0, 1, 2], [3, 6], [3, 5]]);
const ENEMIES = Object.freeze([[5, 6], [], [3], [1], [3, 5], [0, 1], [0, 1, 2]]);
const RELATION_SCORES = Object.freeze({ own: 1, friend: 0.5, neutral: 0, enemy: -0.5 });

const houseFrom = (rasiIndex, moonRasiIndex) => ((moonRasiIndex - rasiIndex + 12) % 12) + 1;

/** Tara (1 … 9) of the day's star counted from a birth star. */
function taraOf(birthStar, dayStar) {
  return (((dayStar - birthStar + 27) % 27) % 9) + 1;
}

/** The rasi's 9 padas grouped by star: [{ nakshatraIndex, padas: [2, 3, 4] }]. */
function rasiStars(rasiIndex) {
  const stars = [];
  for (let p = rasiIndex * 9; p < rasiIndex * 9 + 9; p++) {
    const nakshatraIndex = Math.floor(p / 4);
    const last = stars[stars.length - 1];
    if (last && last.nakshatraIndex === nakshatraIndex) last.padas.push((p % 4) + 1);
    else stars.push({ nakshatraIndex, padas: [(p % 4) + 1] });
  }
  return stars;
}

/**
 * Spans clipped to the day, with the share of the day each one holds.
 * `endMs` null means the value lasts past the end of the day.
 * A day with no length (next sunrise not after sunrise) is read by the value
 * at sunrise alone; no spans at all gives [].
 */
function segments(spans, startMs, endMs) {
  const total = endMs - startMs;
  if (!(total > 0)) {
    const s = (spans || [])[0];
    return s ? [{ index: s.index, name: s.name, startMs, endMs: startMs, fraction: 1 }] : [];
  }
  const out = [];
  let from = startMs;
  for (const s of spans || []) {
    const to = s.endMs === null || s.endMs > endMs ? endMs : s.endMs;
    if (to > from) out.push({ index: s.index, name: s.name, startMs: from, endMs: to, fraction: (to - from) / total });
    from = to;
    if (from >= endMs) break;
  }
  return out;
}

const weighted = (segs, valueOf) => segs.reduce((sum, s) => sum + s.fraction * valueOf(s.index), 0);
const dominant = (segs) => segs.reduce((best, s) => (!best || s.fraction > best.fraction ? s : best), null);

function tithiScore(index) {
  if (index === 29) return -1; // Amavasai
  if (index === 14) return 1; // Pournami
  const inPaksha = index % 15;
  if (inPaksha === 0) return -0.25; // Prathamai (either paksha): avoided for major beginnings in Tamil practice
  if (inPaksha === 7) return -0.75; // Ashtami
  return [0.5, 0.75, 0.75, -0.75, 0.75][inPaksha % 5]; // Nanda, Bhadra, Jaya, Rikta, Purna
}

/** 'nanda' | 'bhadra' | 'jaya' | 'rikta' | 'purna' | 'prathamai' | 'ashtami' | 'pournami' | 'amavasai'. */
function tithiKind(index) {
  if (index === 29) return 'amavasai';
  if (index === 14) return 'pournami';
  if (index % 15 === 0) return 'prathamai';
  if (index % 15 === 7) return 'ashtami';
  return ['nanda', 'bhadra', 'jaya', 'rikta', 'purna'][(index % 15) % 5];
}

const yogaScore = (index) => (ADVERSE_YOGAS.has(index) ? (index === 16 || index === 26 ? -1 : -0.75) : 0.5);

const isVishti = (index) => index >= 1 && index <= 56 && (index - 1) % 7 === 6;
const isFixedKarana = (index) => index >= 57;
function karanaScore(index) {
  if (index === 0) return 0.5; // Kimstughna
  if (isFixedKarana(index)) return -0.5;
  return isVishti(index) ? -1 : 0.5;
}

function relationOf(rasiLord, dayLord) {
  if (rasiLord === dayLord) return 'own';
  if (FRIENDS[rasiLord].includes(dayLord)) return 'friend';
  if (ENEMIES[rasiLord].includes(dayLord)) return 'enemy';
  return 'neutral';
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * All factors for one rasi on one day.
 *
 * @param rasiIndex 0 = Mesham … 11 = Meenam
 * @param day { sunriseMs, nextSunriseMs, weekday, moonRasi, nakshatra, tithi, yoga, karana }
 *            (span arrays as returned by computeAstroPanchangam)
 */
function dayFactors(rasiIndex, day) {
  const seg = (spans) => segments(spans, day.sunriseMs, day.nextSunriseMs);

  const moonSegs = seg(day.moonRasi);
  const gochara = weighted(moonSegs, (i) => GOCHARA_SCORES[houseFrom(rasiIndex, i)] / 2);

  const starSegs = seg(day.nakshatra);
  const stars = rasiStars(rasiIndex).map((star) => {
    const parts = starSegs.map((s) => ({ ...s, tara: taraOf(star.nakshatraIndex, s.index) }));
    const main = dominant(parts);
    return {
      ...star,
      value: round(weighted(starSegs, (i) => TARAS[taraOf(star.nakshatraIndex, i)].score)),
      // Without any star span the factor is neutral (value 0) and has no tara to name.
      tara: main ? main.tara : null,
      rating: main ? TARAS[main.tara].rating : 'mixed',
      parts,
    };
  });
  const tara = stars.reduce((sum, s) => sum + (s.padas.length / 9) * s.value, 0);

  const tithiSegs = seg(day.tithi);
  const yogaSegs = seg(day.yoga);
  const tithi = weighted(tithiSegs, tithiScore);
  const yoga = weighted(yogaSegs, yogaScore);

  const dayLord = day.weekday;
  const rasiLord = RASI_LORDS[rasiIndex];
  const relation = relationOf(rasiLord, dayLord);

  const karanaSegs = seg(day.karana);
  const karana = weighted(karanaSegs, karanaScore);

  const values = {
    gochara: round(gochara),
    tara: round(tara),
    tithiYoga: round((tithi + yoga) / 2),
    weekday: RELATION_SCORES[relation],
    karana: round(karana),
  };
  const total = round(Object.keys(WEIGHTS).reduce((sum, k) => sum + WEIGHTS[k] * values[k], 0));

  return {
    values,
    total,
    detail: {
      moon: moonSegs,
      dayStar: dominant(starSegs),
      stars,
      tithi: {
        value: round(tithi),
        main: dominant(tithiSegs),
        segments: tithiSegs,
        // Share of the day under Prathamai (either paksha).
        prathamaiFraction: round(tithiSegs.reduce((sum, s) => sum + (s.index % 15 === 0 ? s.fraction : 0), 0)),
      },
      yoga: { value: round(yoga), main: dominant(yogaSegs) },
      weekday: { dayLord, rasiLord, relation },
      karana: {
        segments: karanaSegs,
        vishti: karanaSegs.find((s) => isVishti(s.index)) || null,
        // Share of the day under Vishti: the averaged karana value hides it (+0.5 and -1 cancel).
        vishtiFraction: round(karanaSegs.reduce((sum, s) => sum + (isVishti(s.index) ? s.fraction : 0), 0)),
        main: dominant(karanaSegs),
      },
    },
  };
}

/**
 * Composite (-1 … +1) to the app's score: -2, -1, +1 or +2 (never 0).
 * The factor scales lean positive (most yogas and karanas are good, an enemy
 * weekday lord is only -0.5), so -2 starts at -0.25 while +2 needs +0.4.
 */
function scoreOf(total) {
  if (total >= 0.4) return 2;
  if (total >= 0) return 1;
  if (total > -0.25) return -1;
  return -2;
}

const SHIFT_FACTORS = Object.freeze(['tara', 'tithiYoga', 'weekday', 'karana']);

/**
 * A large day-to-day swing of each factor's own value. The weekday lord
 * changes every day by up to 1.5, while a rasi's Tara average (three stars
 * whose taras partly cancel) rarely moves by more than 0.7; dividing by these
 * puts the four on one scale, so the lunar factors can carry the day's story.
 */
const SHIFT_SCALE = Object.freeze({ tara: 0.7, tithiYoga: 0.8, weekday: 1.5, karana: 1.0 });

/**
 * The non-Moon factor whose own value (-1 … +1, unweighted) moved most since
 * the previous day, each measured against its typical swing (SHIFT_SCALE);
 * without a previous day, the strongest one today on the same scale.
 * Returns { factor, change, direction }: change is the raw move in the
 * factor's value, null without a previous day.
 */
function dominantShift(today, previous) {
  if (previous) {
    let best = null;
    for (const k of SHIFT_FACTORS) {
      const change = today.values[k] - previous.values[k];
      const size = Math.abs(change) / SHIFT_SCALE[k];
      if (!best || size > best.size) best = { factor: k, change, size };
    }
    if (best.size >= 0.1) {
      return { factor: best.factor, change: round(best.change), direction: Math.sign(best.change) };
    }
  }
  let best = null;
  for (const k of SHIFT_FACTORS) {
    const c = today.values[k];
    const size = Math.abs(c) / SHIFT_SCALE[k];
    if (!best || size > best.size) best = { factor: k, c, size };
  }
  return { factor: best.factor, change: null, direction: Math.sign(best.c) || 1 };
}

export {
  GOCHARA_SCORES,
  TARAS,
  WEIGHTS,
  RASI_LORDS,
  dayFactors,
  dominantShift,
  scoreOf,
  rasiStars,
  taraOf,
  tithiKind,
  tithiScore,
  yogaScore,
  isVishti,
  isFixedKarana,
  segments,
};
