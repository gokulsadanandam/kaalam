/**
 * Astronomical audit fixes: true Lahiri ayanamsa, rigorous sunrise in any
 * IANA timezone, explicit location fallback, Nalla Neram table and Gowri.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import app, { _internals } from '../index.js';
import { lahiriAyanamsa } from '../lib/panchangam.js';
import { resolveLocation, inTamilNadu } from '../lib/location.js';
import { offsetForDay, solarTimes, tzOffsetMinutes } from '../lib/time.js';
import { gowriSlots, weekdayNallaNeram, gowriNallaNeram } from '../lib/nallaNeram.js';

const { computePanchangam, gowriFor } = _internals;
const hm = (h, m = 0) => h * 60 + m;

test('Lahiri ayanamsa includes nutation: 23°15′00.658″ at 1956-03-21 0h', () => {
  const arcsec = (lahiriAyanamsa(Date.UTC(1956, 2, 21)) - (23 + 15 / 60)) * 3600;
  assert.ok(Math.abs(arcsec - 0.658) < 1, `got 23°15′${arcsec.toFixed(3)}″`);
});

test('timezones: IANA offsets with DST, sunrise in local clock time', () => {
  assert.equal(tzOffsetMinutes('Asia/Kolkata', Date.UTC(2026, 10, 12)), 330);
  assert.equal(offsetForDay({ year: 2026, month: 11, day: 12 }, 'America/New_York'), -300);
  assert.equal(offsetForDay({ year: 2026, month: 7, day: 1 }, 'America/New_York'), -240);

  // New York, 12 Nov 2026: sunrise ~6:40 AM, sunset ~4:40 PM EST (not "5:09 PM" IST-shifted).
  const winter = solarTimes({ year: 2026, month: 11, day: 12 }, 40.7128, -74.006, -300);
  assert.ok(winter.sunrise > hm(6, 30) && winter.sunrise < hm(6, 50), `sunrise ${winter.sunrise}`);
  assert.ok(winter.sunset > hm(16, 30) && winter.sunset < hm(16, 50), `sunset ${winter.sunset}`);
  // 1 Jul 2026 (EDT): sunrise ~5:28 AM.
  const summer = solarTimes({ year: 2026, month: 7, day: 1 }, 40.7128, -74.006, -240);
  assert.ok(summer.sunrise > hm(5, 20) && summer.sunrise < hm(5, 35), `sunrise ${summer.sunrise}`);

  // Chennai, 12 Nov 2026: drikpanchang sunrise 6:06 AM, sunset 5:40 PM.
  const p = computePanchangam({ year: 2026, month: 11, day: 12, weekday: 4 }, 13.0827, 80.2707);
  assert.equal(p.sunrise, '6:06 AM');
  assert.equal(p.sunset, '5:40 PM');
});

test('resolveLocation: explicit place, or Chennai with isFallback and a reason', () => {
  assert.deepEqual(
    resolveLocation({ lat: '19.07', lon: '72.88' }),
    { name: null, lat: 19.07, lon: 72.88, timezone: 'Asia/Kolkata', isFallback: false },
  );
  assert.equal(resolveLocation({ lat: '40.7', lon: '-74', tz: 'America/New_York' }).timezone, 'America/New_York');
  assert.equal(resolveLocation({ lat: '40.7', lon: '-74', tz: 'Mars/Base' }).reason, 'invalid_timezone');

  const cases = [
    [{}, 'missing_coordinates'],
    [{ location: 'India' }, 'unresolved_place'],
    [{ lat: 'abc', lon: '80' }, 'invalid_coordinates'],
    [{ lat: '78.2', lon: '15.6' }, 'invalid_coordinates'], // Svalbard: polar day/night
    [{ lat: '19.07' }, 'incomplete_coordinates'],
  ];
  for (const [query, reason] of cases) {
    const r = resolveLocation(query);
    assert.equal(r.isFallback, true);
    assert.equal(r.reason, reason, JSON.stringify(query));
    // Never a mix of a given and a default coordinate.
    assert.deepEqual([r.lat, r.lon, r.timezone], [13.0827, 80.2707, 'Asia/Kolkata']);
  }
  assert.ok(inTamilNadu({ lat: 9.93, lon: 78.12 })); // Madurai
  assert.ok(!inTamilNadu({ lat: 19.07, lon: 72.88 })); // Mumbai
});

test('weekday Nalla Neram table (Daily Thanthi / Maha Calendar)', () => {
  assert.deepEqual(weekdayNallaNeram(4), [[hm(10, 45), hm(11, 45)], [hm(12, 15), hm(13, 15)]]);
  assert.deepEqual(weekdayNallaNeram(0), [[hm(7, 45), hm(8, 45)], [hm(15, 15), hm(16, 15)]]);
  assert.deepEqual(weekdayNallaNeram(1), [[hm(6, 15), hm(7, 15)], [hm(16, 45), hm(17, 45)]]);
});

test('Gowri Panchangam matches drikpanchang (Chennai, Thu 12 Nov 2026)', () => {
  const raw = computePanchangam({ year: 2026, month: 11, day: 12, weekday: 4 }, 13.0827, 80.2707).raw;
  const slots = gowriSlots(4, raw.sunrise, raw.sunset, raw.nextSunrise, 'en');
  assert.equal(slots.length, 16);
  const expected = [
    ['Dhanam', hm(6, 6)], ['Sugam', hm(7, 33)], ['Soram', hm(9, 0)], ['Uthi', hm(10, 26)],
    ['Amirdha', hm(11, 53)], ['Visham', hm(13, 20)], ['Rogam', hm(14, 46)], ['Laabam', hm(16, 13)],
    ['Amirdha', hm(17, 40)],
  ];
  expected.forEach(([name, start], i) => {
    assert.equal(slots[i].name, name);
    assert.ok(Math.abs(slots[i].start - start) <= 1, `${name} ${slots[i].start} vs ${start}`);
  });
  assert.deepEqual(slots.slice(8).map((s) => s.part), Array(8).fill('night'));
  assert.ok(Math.abs(slots[15].end - (raw.nextSunrise + 1440)) <= 1, 'night ends at next sunrise');

  const display = gowriFor(raw, 'ta');
  assert.equal(display[0].name, 'தனம்');
  assert.equal(display[0].good, true);
  assert.match(display[0].time, /^6:0[67] – 7:3[34] AM$/);
});

test('gowriNallaNeram removes Rahu/Yama/Kuligai and merges adjacent slots', () => {
  const slots = [
    { good: true, part: 'day', start: 360, end: 450 },
    { good: true, part: 'day', start: 450, end: 540 },
    { good: false, part: 'day', start: 540, end: 630 },
    { good: true, part: 'day', start: 630, end: 720 },
    { good: true, part: 'night', start: 1100, end: 1200 },
  ];
  assert.deepEqual(gowriNallaNeram(slots, [[400, 420], [700, 760]]), [[360, 400], [420, 540], [630, 700]]);
});

test('API: location metadata, tz, Gowri and Nalla Neram source', async () => {
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (path) => (await fetch(base + path)).json();

    const fallback = await get('/api/panchangam?date=2026-11-12&location=India');
    assert.deepEqual(fallback.location, {
      name: 'Chennai', lat: 13.0827, lon: 80.2707, timezone: 'Asia/Kolkata', isFallback: true, reason: 'unresolved_place',
    });
    assert.equal(fallback.nallaNeramSource === 'newspaper' || fallback.nallaNeramSource === 'weekday-table', true);
    assert.equal(fallback.gowri.length, 16);

    const ny = await get('/api/panchangam?date=2026-11-12&lat=40.7128&lon=-74.006&tz=America/New_York&lang=en');
    assert.equal(ny.location.isFallback, false);
    assert.equal(ny.location.timezone, 'America/New_York');
    assert.match(ny.sunrise, /^6:\d\d AM$/);
    assert.match(ny.sunset, /^4:\d\d PM$/);
    assert.equal(ny.nallaNeramSource, 'gowri');

    const r = await get('/api/rasipalan?rasi=mesham&date=2026-11-12&lat=abc&lon=80');
    assert.equal(r.location.isFallback, true);
    assert.equal(r.location.reason, 'invalid_coordinates');
    assert.ok(['newspaper', 'weekday-table'].includes(r.nallaNeramSource));
    assert.ok(!r.timeline.periods.some((p) => p.type === 'abhijit'));

    const birth = await get('/api/birth-rasi?date=1990-07-01&time=10:00&tz=America/New_York');
    const birthOffset = await get('/api/birth-rasi?date=1990-07-01&time=10:00&tzOffset=-240');
    assert.equal(birth.moonLongitude, birthOffset.moonLongitude, 'tz resolves to EDT');
    const badTz = await fetch(`${base}/api/birth-rasi?date=1990-07-01&time=10:00&tz=Nowhere/City`);
    assert.equal(badTz.status, 400);

    // Daily-calendar extras, as on the Maha Calendar sheet for Thu 12 Nov 2026.
    const { calendar } = await get('/api/panchangam?date=2026-11-12');
    assert.equal(calendar.dayOfYear, 316);
    assert.equal(calendar.daysLeft, 49);
    assert.deepEqual(calendar.soolam, { direction: 'தெற்கு', remedy: 'தைலம்' });
    assert.equal(calendar.lagna.name, 'துலாம்');
    assert.match(calendar.lagna.until, /^6:[23]\d AM$/);
    assert.equal(calendar.ayanam, 'தட்சிணாயனம்');
    assert.equal(calendar.ruthu, 'சரத் ருது');
    assert.equal(calendar.lunarMonth, 'கார்த்திகை'); // "கார்த்திகை வளர்பிறை" on the sheet
    // The sheet's chart: Saturn Meenam, Mars Kadagam, Jupiter + Ketu Simmam, Rahu Kumbam, Sun + Mercury Thulam.
    const rasiOf = Object.fromEntries(calendar.planets.map((p) => [p.key, p.rasiIndex]));
    assert.deepEqual(
      [rasiOf.saturn, rasiOf.mars, rasiOf.jupiter, rasiOf.ketu, rasiOf.rahu, rasiOf.sun, rasiOf.mercury, rasiOf.moon],
      [11, 3, 4, 4, 10, 6, 6, 7],
    );
  } finally {
    server.close();
  }
});
