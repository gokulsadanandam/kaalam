/**
 * Day timeline, Nalla Neram parsing, headlines, chandrashtamam timing,
 * structured Panchangam and the birth-details rasi finder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import app, { _internals } from '../index.js';
import { generateRasiPalan } from '../lib/rasiPalanGenerator.js';
import { resolveLocation } from '../lib/location.js';

const { parseNallaNeramRanges, buildTimeline, computeAstroDay, computePanchangam, nallaNeramFor } = _internals;
const CHENNAI = [13.0827, 80.2707];
const hm = (h, m = 0) => h * 60 + m;

test('parseNallaNeramRanges: formats seen in the feeds', () => {
  // dailythanthi.com, 10 and 11 Nov 2026
  assert.deepEqual(parseNallaNeramRanges('காலை 7.45 - 8.45, மாலை 4.45 - 5.45'), [[hm(7, 45), hm(8, 45)], [hm(16, 45), hm(17, 45)]]);
  assert.deepEqual(parseNallaNeramRanges('காலை 9.15 – 10.15, மாலை 4.45– 5.45'), [[hm(9, 15), hm(10, 15)], [hm(16, 45), hm(17, 45)]]);
  // hindutamil.in: noon and night, and a range inheriting "காலை"
  assert.deepEqual(parseNallaNeramRanges('காலை 8-9, நண்பகல் 12-1, இரவு 7-8'), [[hm(8), hm(9)], [hm(12), hm(13)], [hm(19), hm(20)]]);
  assert.deepEqual(
    parseNallaNeramRanges('காலை 6-7.30, 9-10, மதியம் 1.30-3, மாலை 4-5, இரவு 7-8'),
    [[hm(6), hm(7, 30)], [hm(9), hm(10)], [hm(13, 30), hm(15)], [hm(16), hm(17)], [hm(19), hm(20)]],
  );
  assert.deepEqual(parseNallaNeramRanges('காலை 11-12'), [[hm(11), hm(12)]]);
  assert.deepEqual(parseNallaNeramRanges('காலை 10.30 - 1'), [[hm(10, 30), hm(13)]]);
  assert.deepEqual(parseNallaNeramRanges('நாட்காட்டியில் சரிபார்க்கவும்'), []);
  assert.deepEqual(parseNallaNeramRanges(null), []);
});

test('buildTimeline: computed periods plus the resolved Nalla Neram (no Abhijit)', () => {
  const thursday = computePanchangam({ year: 2026, month: 11, day: 12, weekday: 4 }, ...CHENNAI);
  const computed = buildTimeline(thursday.raw, null);
  assert.deepEqual(computed.periods.map((p) => p.type), ['yamagandam', 'kuligai', 'rahuKalam']);
  const rahu = computed.periods.find((p) => p.type === 'rahuKalam');
  assert.ok(Math.abs(rahu.end - rahu.start - (thursday.raw.sunset - thursday.raw.sunrise) / 8) <= 1);
  assert.ok(computed.sunrise < rahu.start && rahu.end <= computed.sunset + 1);

  const chennai = resolveLocation({});
  const withPaper = buildTimeline(thursday.raw, nallaNeramFor(thursday.raw, chennai, 'காலை 9.15 – 10.15, மாலை 4.45– 5.45'));
  const nalla = withPaper.periods.filter((p) => p.type === 'nallaNeram');
  assert.equal(nalla.length, 2);
  assert.equal(nalla[0].source, 'newspaper');
  assert.ok(!withPaper.periods.some((p) => p.type === 'abhijit'));

  // No newspaper line: the printed weekday table (Thursday 10:45–11:45, 12:15–1:15).
  const table = buildTimeline(thursday.raw, nallaNeramFor(thursday.raw, chennai, null));
  assert.deepEqual(
    table.periods.filter((p) => p.type === 'nallaNeram').map((p) => [p.start, p.end, p.source]),
    [[hm(10, 45), hm(11, 45), 'weekday-table'], [hm(12, 15), hm(13, 15), 'weekday-table']],
  );
});

test('Nalla Neram source: newspaper only in Tamil Nadu; IST table elsewhere in India; Gowri abroad', () => {
  const day = { year: 2026, month: 11, day: 12, weekday: 4 };
  const paper = 'காலை 9.15 – 10.15, மாலை 4.45– 5.45';
  const mumbai = resolveLocation({ lat: 19.076, lon: 72.8777 });
  const m = nallaNeramFor(computePanchangam(day, mumbai.lat, mumbai.lon).raw, mumbai, paper);
  assert.equal(m.source, 'weekday-table');
  assert.equal(m.text, 'காலை 10.45 - 11.45, மதியம் 12.15 - 1.15');

  const ny = resolveLocation({ lat: 40.7128, lon: -74.006, tz: 'America/New_York' });
  const raw = computePanchangam(day, ny.lat, ny.lon, -300).raw;
  const g = nallaNeramFor(raw, ny, paper);
  assert.equal(g.source, 'gowri');
  for (const [s, e] of g.ranges) {
    assert.ok(s >= raw.sunrise - 1 && e <= raw.sunset + 1, 'daytime only');
    for (const [bs, be] of [raw.rahuKalam, raw.yamagandam, raw.kuligai]) assert.ok(e <= bs || s >= be, 'avoids Rahu/Yama/Kuligai');
  }
});

test('headline, Moon change and chandrashtamam timing (12 Nov 2026: Moon leaves Viruchigam at 2:19 PM, as drikpanchang)', () => {
  const ta = computeAstroDay({ year: 2026, month: 11, day: 12, weekday: 4, iso: '2026-11-12' }, ...CHENNAI, 'ta');
  assert.deepEqual(ta.moonChange, { time: '2:19 PM', fromRasi: 'விருச்சிகம்', toRasi: 'தனுசு', text: 'சந்திரன் தனுசு ராசிக்கு மாறுகிறார்' });

  // Viruchigam: Moon in own sign (house 1) until 2:19 PM, then house 2 for the
  // rest of the Panchangam day, which therefore governs the reading.
  assert.equal(ta.generated.viruchigam.house, 2);
  assert.equal(ta.generated.viruchigam.headline, 'செலவுகளில் கவனம்; மதியம் வரை சாதகம்');
  assert.match(ta.generated.viruchigam.prediction, /2:19 PM வரை நிலைமை சாதகமாக இருக்கும்\. /);
  // Mesham's day is chandrashtamam until the afternoon: one clear headline, not two.
  assert.equal(ta.generated.mesham.headline, 'மதியம் வரை சந்திராஷ்டமம் — நிதானம் தேவை');
  // Rishabam enters chandrashtamam at 2:19 PM and it rules the rest of the day.
  assert.equal(ta.generated.rishabam.house, 8);
  assert.equal(ta.generated.rishabam.headline, 'மதியம் முதல் சந்திராஷ்டமம் — நிதானம் தேவை');
  // Mesham: chandrashtamam until 2:19 PM; Rishabam: from 2:19 PM.
  assert.deepEqual(ta.generated.mesham.chandrashtamam, { state: 'until', time: '2:19 PM', text: '2:19 PM வரை உங்களுக்கு சந்திராஷ்டமம்' });
  assert.equal(ta.generated.rishabam.chandrashtamam.state, 'from');
  assert.equal(ta.generated.kanni.chandrashtamam.text, 'இன்று உங்களுக்கு சந்திராஷ்டமம் இல்லை');

  const en = computeAstroDay({ year: 2026, month: 11, day: 12, weekday: 4, iso: '2026-11-12' }, ...CHENNAI, 'en');
  assert.equal(en.moonChange.text, 'The Moon moves into Dhanusu');
  assert.equal(en.generated.viruchigam.headline, 'Watch your spending; good until the afternoon');
  assert.equal(en.generated.mesham.headline, 'Chandrashtamam until the afternoon — stay calm');
  assert.equal(en.generated.mesham.chandrashtamam.text, 'Chandrashtamam for you until 2:19 PM');
});

test('structured Panchangam spans', () => {
  const { panchangam } = computeAstroDay({ year: 2026, month: 11, day: 11, weekday: 3, iso: '2026-11-11' }, ...CHENNAI, 'ta');
  assert.deepEqual(panchangam.spans.nakshatra, [{ name: 'அனுஷம்', until: '11:38 AM' }, { name: 'கேட்டை', until: null }]);
  assert.equal(panchangam.spans.tithi[0].until, '3:53 PM');
  assert.equal(panchangam.spans.chandraRasi.length, 1);
});

test('headline has no suffix when the Moon stays in one sign', () => {
  const hour = 3_600_000;
  const dayTimes = { sunriseMs: 0, sunsetMs: 12 * hour, nextSunriseMs: 24 * hour };
  const g = generateRasiPalan(0, [{ index: 2, endMs: null }], dayTimes, () => 'x', 'ta');
  assert.equal(g.headline, 'முயற்சிகளில் வெற்றி');
  assert.equal(g.chandrashtamam.state, 'none');
});

test('GET /api/birth-rasi', async () => {
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    // Anusham ends 11:38 AM IST on 11 Nov 2026 (drikpanchang); both sides are Viruchigam.
    const before = await (await fetch(`${base}/api/birth-rasi?date=2026-11-11&time=11:00`)).json();
    assert.equal(before.rasi, 'viruchigam');
    assert.equal(before.nakshatra, 'அனுஷம்');
    assert.equal(before.pada, 4);
    const after = await (await fetch(`${base}/api/birth-rasi?date=2026-11-11&time=12:15&lang=en`)).json();
    assert.equal(after.nakshatra, 'Kettai');
    assert.equal(after.pada, 1);
    assert.equal(after.rasiName, 'Viruchigam (Scorpio)');

    for (const bad of ['date=2026-11-11', 'date=2026-11-11&time=25:00', 'time=10:00', 'date=1800-01-01&time=10:00']) {
      assert.equal((await fetch(`${base}/api/birth-rasi?${bad}`)).status, 400, bad);
    }
  } finally {
    server.close();
  }
});

test('GET /api/rasipalan includes timeline, headline and moonChange', async () => {
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const r = await (await fetch(`${base}/api/rasipalan?rasi=viruchigam&date=2026-11-12`)).json();
    assert.equal(r.generated.headline, 'செலவுகளில் கவனம்; மதியம் வரை சாதகம்');
    assert.equal(r.moonChange.time, '2:19 PM');
    assert.ok(r.timeline.periods.some((p) => p.type === 'rahuKalam'));
    assert.equal(typeof r.timeline.sunrise, 'number');
    assert.equal(r.panchangam.spans.nakshatra[0].name, 'கேட்டை');
  } finally {
    server.close();
  }
});
