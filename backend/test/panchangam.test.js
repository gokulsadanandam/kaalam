/**
 * Computed Panchangam, generated rasi palan and diffScore (no network).
 * Reference values: drikpanchang.com for Chennai, and the Tamil calendar
 * dates of Thai Pongal and Tamil New Year 2026.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import app, { _internals } from '../index.js';
import { generateRasiPalan, houseFrom } from '../lib/rasiPalanGenerator.js';
import { diffScore, textTone } from '../lib/compare.js';
import MAHA_WORDS_EN from '../lib/mahaWordsEn.js';

const { computeAstroDay, buildPayload, RASIS, RASI_NAMES } = _internals;

const CHENNAI = [13.0827, 80.2707];
const day = (iso, weekday) => {
  const [year, month, d] = iso.split('-').map(Number);
  return { year, month, day: d, weekday, iso };
};

test('RASIS order matches the Panchangam rasi index (Mesham = 0)', () => {
  assert.deepEqual(RASIS.map((r) => r.tamil), RASI_NAMES);
});

test('Panchangam matches drikpanchang for Chennai, 11 Nov 2026', () => {
  const { panchangam: p } = computeAstroDay(day('2026-11-11', 3), ...CHENNAI);
  // drikpanchang: Anuradha upto 11:38 AM, Kaulava upto 03:53 PM, Taitila upto 04:58 AM Nov 12
  assert.equal(p.nakshatra, 'அனுஷம் 11:38 AM வரை, பின்பு கேட்டை');
  assert.equal(p.tithi, 'துவிதியை 3:53 PM வரை, பின்பு திருதியை');
  assert.match(p.karanam, /^கௌலவம் 3:53 PM வரை, பின்பு தைதுலம் நாளை 4:5[89] AM வரை/);
  assert.equal(p.paksha, 'வளர்பிறை');
  assert.equal(p.tamilDate, 'பராபவ ஆண்டு ஐப்பசி 25');
  assert.equal(p.chandraRasi, 'விருச்சிகம்');
  assert.equal(p.chandrashtamam, 'மேஷம்');
  assert.equal(p.chandrashtamamStars, 'அசுவினி, பரணி');
});

test('Tamil date: Thai 1 is Pongal and Chithirai 1 starts the new year', () => {
  const at = (iso, weekday) => computeAstroDay(day(iso, weekday), ...CHENNAI).panchangam.tamilDate;
  assert.equal(at('2026-01-13', 2), 'விசுவாவசு ஆண்டு மார்கழி 29');
  assert.equal(at('2026-01-14', 3), 'விசுவாவசு ஆண்டு தை 1');
  assert.equal(at('2026-04-13', 1), 'விசுவாவசு ஆண்டு பங்குனி 30');
  assert.equal(at('2026-04-14', 2), 'பராபவ ஆண்டு சித்திரை 1');
});

test('a value never follows itself across a whole month (span chaining)', () => {
  for (let d = 1; d <= 30; d++) {
    const iso = `2026-11-${String(d).padStart(2, '0')}`;
    const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
    const p = computeAstroDay(day(iso, weekday), ...CHENNAI).panchangam;
    for (const field of ['tithi', 'nakshatra', 'yogam', 'karanam', 'chandraRasi', 'chandrashtamam']) {
      const names = p[field].split(', பின்பு ').map((part) => part.replace(/ (?:நாளை )?\d{1,2}:\d\d [AP]M வரை$/, ''));
      for (let i = 1; i < names.length; i++) assert.notEqual(names[i], names[i - 1], `${iso} ${field}: ${p[field]}`);
    }
  }
});

test('Chandra Gochara: houses counted from the rasi itself', () => {
  assert.equal(houseFrom(0, 7), 8); // Moon in விருச்சிகம் is 8th from மேஷம்
  assert.equal(houseFrom(7, 7), 1);
  assert.equal(houseFrom(11, 0), 2);

  const { generated } = computeAstroDay(day('2026-11-11', 3), ...CHENNAI);
  assert.equal(generated.mesham.house, 8);
  assert.equal(generated.mesham.isChandrashtamam, true);
  assert.equal(generated.mesham.summary, 'சந்திராஷ்டமம்');
  assert.equal(generated.kanni.house, 3);
  assert.equal(generated.kanni.score, 2);
});

test('generator mentions a Moon change into or out of chandrashtamam', () => {
  const hour = 3_600_000;
  const dayTimes = { sunriseMs: 0, sunsetMs: 12 * hour, nextSunriseMs: 24 * hour };
  const fmt = () => 'T';
  // மேஷம், Moon moves from துலாம் (7th) into விருச்சிகம் (8th) 9 h after sunrise:
  // the 8th house holds most of the day (15 of 24 h), so it is the reading.
  const into = generateRasiPalan(0, [{ index: 6, endMs: 9 * hour }, { index: 7, endMs: null }], dayTimes, fmt);
  assert.equal(into.house, 8);
  assert.equal(into.isChandrashtamam, true);
  assert.match(into.prediction, /T முதல் சந்திராஷ்டமம் தொடங்குவதால்/);
  // A late change (after the middle of the day) leaves the earlier house in charge.
  const late = generateRasiPalan(0, [{ index: 6, endMs: 14 * hour }, { index: 7, endMs: null }], dayTimes, fmt);
  assert.equal(late.house, 7);
  assert.match(late.prediction, /T முதல் சந்திராஷ்டமம் தொடங்குவதால்/);
  // Moon leaves விருச்சிகம் early in the morning: the day is read by the new house.
  const outOf = generateRasiPalan(0, [{ index: 7, endMs: 2 * hour }, { index: 8, endMs: null }], dayTimes, fmt);
  assert.equal(outOf.house, 9);
  assert.match(outOf.prediction, /T வரை சந்திராஷ்டமம் இருப்பதால்/);
});

test('textTone: resolved problems count as good news, lucky-colour lines are ignored', () => {
  assert.ok(textTone('கடன் பிரச்சினைகள் குறையும். வெற்றி கிடைக்கும்.').tone > 0.5);
  assert.equal(textTone('அதிர்ஷ்ட நிறம்: சிவப்பு').tone, 0);
  assert.ok(textTone('இன்று சந்திராஷ்டமம். வாக்குவாதம் தவிர்க்கவும். செலவு அதிகரிக்கும்.').tone < -0.5);
  // hindutamil.in, விருச்சிகம், 12 Nov 2026: cautionary throughout.
  const viruchigam = textTone('குடும்பத்தில் விட்டுக் கொடுத்து போவது நல்லது. பூர்வீக வீடு, மனை தொடர்பான வழக்கில் இழுபறி நிலை நீடிக்கலாம். திட்டமிட்ட பணிகளை முடிப்பதில் தடுமாற்றம் ஏற்படும். அலுவலகத்தில் விவாதங்களை தவிர்க்கவும்.');
  assert.ok(viruchigam.tone < -0.5 && viruchigam.negatives >= 4, JSON.stringify(viruchigam));
  // A problem resolved a few words later is good news (சிம்மம், same day).
  assert.ok(textTone('இழுபறியாக இருந்து வந்த வேலைகள் முடியும்.').tone > 0);
});

test('diffScore: agreement, disagreement and nothing to compare', () => {
  const chandrashtamam = { score: -2, isChandrashtamam: true };
  const veryGood = { score: 2, isChandrashtamam: false };
  // dailythanthi.com text for மேஷம், 10 Nov 2026 (abridged)
  const scraped = 'இன்று சந்திராஷ்டமம் என்பதால் எந்த விஷயத்திலும் அவசரமாக முடிவெடுக்காமல் யோசித்து செயல்படுங்கள். பணியிடத்தில் மன அழுத்தம் ஏற்படலாம். வாக்குவாதங்களைத் தவிர்க்கவும்.';

  const agree = diffScore(chandrashtamam, scraped);
  assert.equal(agree.level, 'agree');
  assert.ok(agree.score < 0.2);
  assert.deepEqual(agree.chandrashtamam, { generated: true, scraped: true });
  assert.equal(agree.confidence, 'high');

  const disagree = diffScore(veryGood, scraped);
  assert.equal(disagree.level, 'disagree');
  assert.ok(disagree.score > 0.9);

  assert.equal(diffScore(veryGood, null), null);
  assert.equal(diffScore(null, scraped), null);
});

test('buildPayload adds panchangam, generated and diffScore without touching old fields', () => {
  const today = day('2026-11-11', 3);
  const astroDay = computeAstroDay(today, ...CHENNAI);
  const rasi = RASIS[0];
  const scrape = { predictions: { mesham: 'இன்று சந்திராஷ்டமம். வாக்குவாதங்களைத் தவிர்க்கவும்.' }, nallaNeram: null, source: 'x' };
  const payload = buildPayload(rasi, today, scrape, null, astroDay);
  assert.equal(payload.prediction, scrape.predictions.mesham);
  assert.equal(payload.isFallback, false);
  assert.equal(payload.generated.house, 8);
  assert.equal(typeof payload.diffScore, 'number');
  assert.equal(payload.panchangam.tamilDay, 25);

  const noScrape = buildPayload(rasi, today, { predictions: {}, nallaNeram: null, source: null }, null, astroDay);
  assert.equal(noScrape.isFallback, true);
  assert.equal(noScrape.diffScore, null);
  assert.ok(noScrape.generated.prediction.includes('சந்திராஷ்டமம்'));
  // Without newspaper text, today's fallback is the day's computed reading, not a fixed placeholder.
  assert.equal(noScrape.prediction, noScrape.generated.prediction);
});

test('Tara Bala for Magaram\'s stars changes day to day (15–16 Nov 2026, Moon in Magaram both days)', () => {
  const at = (iso, weekday) => computeAstroDay(day(iso, weekday), ...CHENNAI, 'en').generated.magaram;
  const sun = at('2026-11-15', 0);
  const mon = at('2026-11-16', 1);
  assert.equal(sun.house, 1);
  assert.equal(mon.house, 1);
  // Uthiradam padas 2–4, Thiruvonam 1–4, Avittam 1–2.
  assert.deepEqual(sun.stars.map((s) => [s.nakshatra, s.padas.join('')]), [['Uthiradam', '234'], ['Thiruvonam', '1234'], ['Avittam', '12']]);
  // Day star Uthiradam, then Thiruvonam.
  assert.deepEqual(sun.stars.map((s) => s.taraName), ['Janma', 'Parama Mitra', 'Mitra']);
  assert.deepEqual(mon.stars.map((s) => s.taraName), ['Sampat', 'Janma', 'Parama Mitra']);
  assert.match(sun.stars[0].note, /^Janma Tara — mixed; Sampat Tara \(favourable\) from 11:29 PM$/);

  const f = sun.basis.factors;
  assert.deepEqual(Object.values(f.weights), [0.4, 0.3, 0.15, 0.1, 0.05]);
  assert.equal(f.weekday.relation, 'enemy'); // Sun to Saturn
  assert.equal(mon.basis.factors.weekday.relation, 'enemy'); // Moon to Saturn
  assert.equal(f.dominant.factor, 'weekday'); // Saturday (own lord) -> Sunday (enemy)
  assert.notEqual(sun.prediction, mon.prediction);
  assert.notEqual(sun.headline, mon.headline);
  // Chandrashtamam still overrides the composite.
  assert.equal(computeAstroDay(day('2026-11-11', 3), ...CHENNAI, 'en').generated.mesham.score, -2);
});

test('no rasi gets the same reading on two consecutive days, for a whole year', () => {
  const start = Date.UTC(2026, 0, 1);
  for (const lang of ['ta', 'en']) {
    let previous = null;
    for (let i = 0; i <= 365; i++) {
      const d = new Date(start + i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      const { generated } = computeAstroDay(day(iso, d.getUTCDay()), ...CHENNAI, lang);
      for (const rasi of RASIS) {
        const g = generated[rasi.key];
        assert.ok([-2, -1, 1, 2].includes(g.score), `${iso} ${rasi.key} score ${g.score}`);
        if (previous) assert.notEqual(g.prediction, previous[rasi.key].prediction, `${lang} ${iso} ${rasi.key} repeats the day before`);
      }
      previous = generated;
    }
  }
});

/** Every English reading of 2026 for Chennai, computed once for the regression tests below. */
let englishYear = null;
function readingsOf2026() {
  if (englishYear) return englishYear;
  englishYear = [];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365; i++) {
    const d = new Date(start + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const { generated } = computeAstroDay(day(iso, d.getUTCDay()), ...CHENNAI, 'en');
    for (const rasi of RASIS) englishYear.push({ iso, rasi: rasi.key, g: generated[rasi.key] });
  }
  return englishYear;
}

test('a Vishti karana window of 15% of the day or more is always in the reading', () => {
  let windows = 0;
  for (const { iso, rasi, g } of readingsOf2026()) {
    const { vishtiFraction } = g.basis.factors.karana;
    if (vishtiFraction < 0.15 || g.house === 8) continue; // Chandrashtamam days keep their own modifier
    windows++;
    assert.match(g.prediction, /\(Vishti\) karana .* is unsuitable for starting journeys/, `${iso} ${rasi} (Vishti ${vishtiFraction})`);
  }
  assert.ok(windows > 1000, `only ${windows} Vishti readings in the year`);
});

test('Janma Tara stars are named even when another star of the rasi is in Vipat, Pratyak or Naidhana', () => {
  let cases = 0;
  for (const { iso, rasi, g } of readingsOf2026()) {
    const janma = g.stars.filter((s) => s.rating === 'mixed');
    if (!janma.length || !g.stars.some((s) => s.rating === 'caution')) continue;
    cases++;
    for (const star of janma) {
      assert.ok(g.prediction.includes(`${star.nakshatra} (Janma — pace yourself)`), `${iso} ${rasi}: ${star.nakshatra} missing in "${g.prediction}"`);
    }
  }
  assert.ok(cases > 100, `only ${cases} Janma-with-caution readings in the year`);
});

test('Prathamai holding a quarter of the day is in the reading when there is no Vishti window', () => {
  let cases = 0;
  for (const { iso, rasi, g } of readingsOf2026()) {
    const { tithi, karana } = g.basis.factors;
    if (tithi.prathamaiFraction < 0.25 || karana.vishtiFraction >= 0.15 || g.house === 8) continue;
    cases++;
    assert.match(g.prediction, /Prathamai tithi is avoided for major new beginnings/, `${iso} ${rasi}`);
  }
  assert.ok(cases > 100, `only ${cases} Prathamai readings in the year`);
});

test('a house reading that points the other way from the score is followed by a bridging sentence', () => {
  const favourable = new Set([1, 3, 6, 7, 10, 11]);
  let toGood = 0;
  let toCaution = 0;
  for (const { iso, rasi, g } of readingsOf2026()) {
    const good = /Even so, the rest of the day's Panchangam is supportive/.test(g.prediction);
    const caution = /However, unfavourable Panchangam influences today/.test(g.prediction);
    const compositeNegative = g.basis.factors.total < 0;
    assert.equal(good, !favourable.has(g.house) && g.score > 0, `${iso} ${rasi} (house ${g.house}, score ${g.score})`);
    // Negative only through the Chandrashtamam cap: the Chandrashtamam sentence explains it, no bridge.
    assert.equal(caution, favourable.has(g.house) && compositeNegative, `${iso} ${rasi} (house ${g.house}, total ${g.basis.factors.total})`);
    if (caution) assert.ok(g.score < 0, `${iso} ${rasi}`);
    toGood += good;
    toCaution += caution;
  }
  assert.ok(toGood > 0 && toCaution > 0, `${toGood} / ${toCaution}`);
});

test('no reading of the year says "at tomorrow"', () => {
  let nextDay = 0;
  for (const { iso, rasi, g } of readingsOf2026()) {
    assert.doesNotMatch(g.prediction, /\bat tomorrow\b/, `${iso} ${rasi}`);
    assert.doesNotMatch(g.headline, /\bat tomorrow\b/, `${iso} ${rasi}`);
    if (/tomorrow at \d/.test(g.prediction)) nextDay++;
  }
  assert.ok(nextDay > 0, 'expected some changes after midnight ("tomorrow at …")');
});

test('Chandrashtamam shorter than an hour is mentioned but does not turn a good day to -1', () => {
  const hour = 3_600_000;
  const dayTimes = { sunriseMs: 0, sunsetMs: 12 * hour, nextSunriseMs: 24 * hour };
  const whole = (index) => [{ index, name: 'x', endMs: null }];
  // மேஷம் on a Tuesday (own lord), day star Ayilyam (Parama Mitra / Mitra for Ashwini / Bharani),
  // Panchami, a good yoga, Bavam karana: the composite is positive although the Moon is in the 9th.
  const panchanga = { iso: '2026-01-06', weekday: 2, nakshatra: whole(8), tithi: whole(4), yoga: whole(1), karana: whole(1) };
  const reading = (minutes) => generateRasiPalan(
    0, [{ index: 7, name: 'x', endMs: minutes * 60_000 }, { index: 8, name: 'x', endMs: null }], dayTimes, () => 'T', 'en', null, panchanga,
  );

  const brief = reading(30);
  assert.equal(brief.house, 9);
  assert.equal(brief.isChandrashtamam, true);
  assert.equal(brief.chandrashtamam.state, 'until');
  assert.match(brief.prediction, /Chandrashtamam lasts until T/);
  assert.ok(brief.basis.factors.total > 0, `composite ${brief.basis.factors.total}`);
  assert.equal(brief.score, 1);

  // Two hours of it still caps the day at -1.
  const longer = reading(120);
  assert.ok(longer.basis.factors.total > 0, `composite ${longer.basis.factors.total}`);
  assert.equal(longer.score, -1);
});

test('GET /api/panchangam returns all 12 generated readings and validates date', async () => {
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ok = await fetch(`${base}/api/panchangam?date=2026-11-11`);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.tamilDate, 'பராபவ ஆண்டு ஐப்பசி 25');
    assert.equal(body.rasiPalan.length, 12);
    assert.equal(body.rasiPalan[0].generated.house, 8);
    assert.match(body.rahuKalam, /PM$/);

    for (const bad of ['2026-02-30', 'tomorrow', '1800-01-01']) {
      const res = await fetch(`${base}/api/panchangam?date=${bad}`);
      assert.equal(res.status, 400, bad);
    }
  } finally {
    server.close();
  }
});

test('English Panchangam: same values as Tamil, English names', () => {
  const en = computeAstroDay(day('2026-11-11', 3), ...CHENNAI, 'en');
  assert.equal(en.panchangam.nakshatra, 'Anusham until 11:38 AM, then Kettai');
  assert.equal(en.panchangam.tithi, 'Dwithiyai until 3:53 PM, then Thrithiyai');
  assert.match(en.panchangam.karanam, /^Kaulavam until 3:53 PM, then Thaithulam until tomorrow 4:5[89] AM, then Garasai$/);
  assert.equal(en.panchangam.tamilDate, 'Aippasi 25, Parabhava year');
  assert.equal(en.panchangam.paksha, 'Valarpirai (waxing moon)');
  assert.equal(en.panchangam.chandrashtamam, 'Mesham');
  assert.equal(en.panchangam.chandrashtamamStars, 'Ashwini, Bharani');

  // Readings: same house and score in both languages, English text.
  const ta = computeAstroDay(day('2026-11-11', 3), ...CHENNAI, 'ta');
  for (const key of Object.keys(ta.generated)) {
    assert.equal(en.generated[key].house, ta.generated[key].house);
    assert.equal(en.generated[key].score, ta.generated[key].score);
    assert.doesNotMatch(en.generated[key].prediction, /[\u0B80-\u0BFF]/, `${key} must be English`);
  }
  assert.equal(en.generated.mesham.summary, 'Chandrashtamam');
  assert.equal(en.generated.mesham.tone, 'Caution');
});

test('English transition sentences mention the change time', () => {
  const hour = 3_600_000;
  const dayTimes = { sunriseMs: 0, sunsetMs: 12 * hour, nextSunriseMs: 24 * hour };
  const into = generateRasiPalan(0, [{ index: 6, endMs: 9 * hour }, { index: 7, endMs: null }], dayTimes, () => '3 PM', 'en');
  assert.match(into.prediction, /Chandrashtamam begins at 3 PM/);
  const outOf = generateRasiPalan(0, [{ index: 7, endMs: 2 * hour }, { index: 8, endMs: null }], dayTimes, () => '8 AM', 'en');
  assert.match(outOf.prediction, /Chandrashtamam lasts until 8 AM/);
});

test('buildPayload in English translates timing labels and fallbacks, keeps newspaper text', () => {
  const today = day('2026-11-11', 3);
  const astroDay = computeAstroDay(today, ...CHENNAI, 'en');
  const scrape = { predictions: { mesham: 'இன்று சந்திராஷ்டமம்.' }, nallaNeram: 'காலை 9.15 – 10.15, மாலை 4.45– 5.45', source: 'x' };
  const p = buildPayload(RASIS[0], today, scrape, null, astroDay, { lang: 'en' });
  assert.equal(p.nallaNeram, 'Morning 9.15 – 10.15, Evening 4.45– 5.45');
  assert.equal(p.prediction, 'இன்று சந்திராஷ்டமம்.'); // newspaper text stays Tamil
  assert.equal(p.rasiName, 'Mesham (Aries)');
  assert.equal(p.weekday, 'Wednesday');
  assert.equal(p.lang, 'en');

  const empty = buildPayload(RASIS[0], today, { predictions: {}, nallaNeram: null, source: null }, null, astroDay, { lang: 'en', isToday: false });
  assert.match(empty.prediction, /^Aries: no newspaper reading/);
  assert.equal(empty.isToday, false);
});

test('buildPayload: calendar sheet word, Daily Thanthi before Hindu Tamil, credited excerpts', () => {
  const today = day('2026-11-12', 4);
  const astroDay = computeAstroDay(today, ...CHENNAI, 'ta');
  const long = 'இன்று மறைந்திருந்த சில உண்மைகள் உங்களுக்குத் தெளிவாகப் புரியக்கூடும். இதனால் முக்கியமான முடிவுகளை எடுப்பதில் குழப்பம் குறையும்.';
  const archive = {
    tamildailycalendar: { status: 'ok', url: 'https://www.tamildailycalendar.com/2026/12112026.jpg', rasis: { viruchigam: { word: 'எதிர்ப்பு', confidence: 0.95 } } },
    dailythanthi: { status: 'ok', url: 'https://www.dailythanthi.com/x', nallaNeram: null, rasis: { viruchigam: { text: long } } },
    hindutamil: { status: 'ok', url: 'https://www.hindutamil.in/y', rasis: { viruchigam: { text: 'குடும்பத்தில் விட்டுக் கொடுத்து போவது நல்லது. அலுவலகத்தில் விவாதங்களை தவிர்க்கவும்.' } } },
  };
  const viruchigam = RASIS.find((r) => r.key === 'viruchigam');
  const p = buildPayload(viruchigam, today, { predictions: {}, nallaNeram: null, source: null }, null, astroDay, { archive });
  assert.deepEqual(p.sources.sheet, { word: 'எதிர்ப்பு', english: MAHA_WORDS_EN['எதிர்ப்பு'] || null, confidence: 0.95 });
  // How the computed reading was worked out: Moon in Viruchigam (house 1) then Dhanusu (house 2, rules the day).
  assert.deepEqual(p.generated.basis.moon.map((m) => [m.house, m.until]), [[1, '2:19 PM'], [2, null]]);
  assert.equal(p.generated.basis.ruling, 1);
  assert.equal(p.gochara.length, 12);
  assert.deepEqual(p.gochara[7], { house: 8, summary: 'சந்திராஷ்டமம்', score: -2 });
  assert.deepEqual(p.sources.papers.map((x) => x.source), ['dailythanthi', 'hindutamil']);
  // Public build: first sentence only, with credit and link; the full text never leaves the server.
  assert.equal(p.sources.papers[0].excerpt, 'இன்று மறைந்திருந்த சில உண்மைகள் உங்களுக்குத் தெளிவாகப் புரியக்கூடும்.');
  assert.equal(p.sources.papers[0].text, undefined);
  assert.equal(p.prediction, p.sources.papers[0].excerpt);
  assert.equal(p.source, 'www.dailythanthi.com');
  assert.equal(p.sourceUrl, 'https://www.dailythanthi.com/x');
  assert.equal(p.isFallback, false);

  // A sheet that was not read completely is never shown.
  const review = buildPayload(viruchigam, today, { predictions: {} }, null, astroDay, { archive: { tamildailycalendar: { ...archive.tamildailycalendar, status: 'review' } } });
  assert.equal(review.sources.sheet, null);
  assert.equal(review.isFallback, true);
  // A rasi name read as the "word" is a misread: no sheet word (the computed summary is used).
  const label = buildPayload(viruchigam, today, { predictions: {} }, null, astroDay, {
    archive: { tamildailycalendar: { status: 'ok', rasis: { viruchigam: { word: 'மீனம்', confidence: 0.85 } } } },
  });
  assert.equal(label.sources.sheet, null);
  assert.equal(MAHA_WORDS_EN['எதிர்ப்பு'], 'Opposition');
});

test('GET /api/rasipalan supports date and lang', async () => {
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const past = await (await fetch(`${base}/api/rasipalan?rasi=mesham&date=2026-11-11&lang=en`)).json();
    assert.equal(past.date, '2026-11-11');
    assert.equal(past.isToday, false);
    assert.equal(past.lang, 'en');
    assert.equal(past.generated.house, 8);
    assert.equal(past.panchangam.nakshatra, 'Anusham until 11:38 AM, then Kettai');
    assert.equal(past.weekday, 'Wednesday');

    const future = await (await fetch(`${base}/api/rasipalan?rasi=kanni&date=2027-01-15`)).json(); // Pongal 2027
    assert.equal(future.isToday, false);
    assert.equal(future.lang, 'ta');
    assert.equal(future.panchangam.tamilMonth, 'தை');
    assert.equal(future.panchangam.tamilDay, 1);

    assert.equal((await fetch(`${base}/api/rasipalan?rasi=mesham&date=2026-13-01`)).status, 400);
    const english = await (await fetch(`${base}/api/panchangam?date=2026-11-11&lang=en`)).json();
    assert.equal(english.weekday, 'Wednesday');
    assert.equal(english.rasiPalan[0].generated.summary, 'Chandrashtamam');
  } finally {
    server.close();
  }
});
