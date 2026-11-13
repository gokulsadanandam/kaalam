/**
 * Offline tests for the parsing + Panchangam pipeline (no network needed).
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { _internals } from '../index.js';

const {
  normaliseRasi,
  cleanText,
  parseHtml,
  parseRss,
  extractNallaNeram,
  computePanchangam,
  formatRange,
} = _internals;

const LONG = 'இன்று உங்களுக்கு மகிழ்ச்சியான நாள். பணவரவு அதிகரிக்கும், குடும்பத்தில் அமைதி நிலவும்.';

test('normaliseRasi maps English, Western and Tamil spellings', () => {
  assert.equal(normaliseRasi('Mesham').key, 'mesham');
  assert.equal(normaliseRasi('rishabham').key, 'rishabam');
  assert.equal(normaliseRasi('SCORPIO').key, 'viruchigam');
  assert.equal(normaliseRasi('மீனம்').key, 'meenam');
  assert.equal(normaliseRasi('makaram').key, 'magaram');
  assert.equal(normaliseRasi('nonsense'), null);
  assert.equal(normaliseRasi(undefined), null);
  assert.equal(normaliseRasi(['mesham']), null); // ?rasi=a&rasi=b arrives as an array
});

test('parseHtml: heading + sibling paragraph layout', () => {
  const html = `<article>
    <h3>மேஷம்</h3><p>${LONG}</p><p>அதிர்ஷ்ட நிறம்: சிவப்பு</p>
    <h3>ரிஷபம்</h3><p>${LONG} ரிஷபம்</p>
  </article>`;
  const { predictions } = parseHtml(html);
  assert.ok(predictions.mesham.startsWith('இன்று'));
  assert.ok(predictions.mesham.includes('சிவப்பு'));
  assert.ok(!predictions.mesham.includes('ரிஷபம்'), 'must stop at next rasi heading');
  assert.ok(predictions.rishabam);
});

test('parseHtml: inline <strong> and prefixed paragraph layouts', () => {
  const html = `<div>
    <p><strong>கடகம்:</strong> ${LONG}</p>
    <p>சிம்மம் ராசி: ${LONG}</p>
  </div>`;
  const { predictions } = parseHtml(html);
  assert.ok(predictions.kadagam.startsWith('இன்று'));
  assert.ok(predictions.simmam.startsWith('இன்று'));
});

test('parseHtml: card grid where heading is wrapped', () => {
  const html = `<div class="grid">
    <div class="card-head"><h4>கன்னி</h4></div><div class="card-body">${LONG}</div>
    <div class="card-head"><h4>துலாம்</h4></div><div class="card-body">${LONG}</div>
  </div>`;
  const { predictions } = parseHtml(html);
  assert.ok(predictions.kanni);
  assert.ok(predictions.thulam);
});

test('word-edge matching: கன்னியாகுமரி is not கன்னி', () => {
  const html = `<h3>கன்னியாகுமரி செய்திகள்</h3><p>${LONG}</p>`;
  assert.equal(parseHtml(html).predictions.kanni, undefined);
});

test('parseRss: one item per rasi', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>மீனம் ராசி பலன்</title><description><![CDATA[<p>${LONG}</p>]]></description></item>
    <item><title>Kumbam - கும்பம்</title><description>${LONG}</description></item>
  </channel></rss>`;
  const { predictions } = parseRss(xml);
  assert.ok(predictions.meenam.startsWith('இன்று'));
  assert.ok(predictions.kumbam);
});

test('extractNallaNeram stops before Rahu Kalam', () => {
  const text = 'நல்ல நேரம்: காலை 7.30 - 8.30, மாலை 4.30 - 5.30 ராகு காலம்: 1.30 - 3.00';
  assert.equal(extractNallaNeram(text), 'காலை 7.30 - 8.30, மாலை 4.30 - 5.30');
  assert.equal(extractNallaNeram('நல்ல நேரம் இல்லை'), null);
});

const ZWSP = '\u200B';
const TODAY = { iso: '2026-11-10' };

test('cleanText deletes zero-width characters instead of splitting words', () => {
  assert.equal(cleanText(`சந்${ZWSP}திராஷ்டமம் தொடர்${ZWSP}வ${ZWSP}தால்`), 'சந்திராஷ்டமம் தொடர்வதால்');
  assert.equal(cleanText('a\u00A0b\uFEFF'), 'a b');
});

test('extractNallaNeram stops at யோகம் and skips கௌரி நல்ல நேரம்', () => {
  // hindutamil.in calendar item shape
  const calendar = `நல்ல நேரம்: காலை 8-9, நண்${ZWSP}பகல் 12-1, இரவு 7-8.யோகம்: மந்தயோகம் காலை 9.19 வரை.`;
  assert.equal(extractNallaNeram(calendar), 'காலை 8-9, நண்பகல் 12-1, இரவு 7-8');
  assert.equal(extractNallaNeram('கௌரி நல்ல நேரம்: காலை 10.45 - 11.45'), null);
  // dailythanthi.com, 11 Nov 2026: morning and evening as two separate lines
  const split = 'நல்ல நேரம்: காலை 9.15 – 10.15நல்ல நேரம்: மாலை 4.45– 5.45ராகு காலம்: மதியம் 12.00 - 1.30கௌரி நல்ல நேரம்: காலை 10.45 - 11.45';
  assert.equal(extractNallaNeram(split), 'காலை 9.15 – 10.15, மாலை 4.45– 5.45');
});

/** dailythanthi.com shape: Panchangam block, then <h2> per rasi. */
function thanthiItem(title, pubDate, lead) {
  const rasis = ['<h2>மேஷம்</h2>', '<h2>ரிஷபம்</h2>', '<p>மிதுனம்</p>']; // editors sometimes use <p>
  const body = rasis.map((r) => `${r}<p>${lead} ${LONG}</p><p>அதிர்ஷ்ட நிறம்: சிவப்பு</p>`).join('');
  return `<item><title>${title}</title><pubDate>${pubDate}</pubDate><content:encoded><![CDATA[
    <h2>இன்றைய பஞ்சாங்கம்</h2><p>யோகம்: மரண, சித்த யோகம். </p>
    <p>நல்ல நேரம்: காலை 7.45 - 8.45, மாலை 4.45 - 5.45</p><p>ராகு காலம்: மாலை 3.00 - 4.30</p>
    <p>கௌரி நல்ல நேரம்: காலை 10.45 - 11.45, இரவு 7.30 - 8.30 </p>
    <h2>இன்றைய ராசிபலன்</h2>${body}]]></content:encoded></item>`;
}

test('parseHtml: unlabelled readings in rasi order, each closed by a lucky colour (dailythanthi.com 14 Jan 2026)', () => {
  const panchangam = '<p>இன்றைய பஞ்சாங்கம்:-</p><p>சூலம் வடக்கு </p><p><a href="#">சந்திராஷ்டமம்</a>: பரணி </p>';
  const readings = Array.from({ length: 12 }, (_, i) => `<p>READING${i} ${LONG}</p><p>அதிர்ஷ்ட நிறம்: வெள்ளை</p>`).join('');
  const { predictions } = parseHtml(panchangam + readings + '<p>இன்றைய பஞ்சாங்கம் முடிவு</p>');
  assert.equal(Object.keys(predictions).length, 12);
  assert.ok(predictions.mesham.startsWith('READING0 '));
  assert.ok(predictions.meenam.startsWith('READING11 '));
  assert.ok(!predictions.mesham.includes('சூலம்'));
  // Eleven blocks is ambiguous: nothing is assigned.
  assert.deepEqual(parseHtml(panchangam + readings.split('</p><p>அதிர்ஷ்ட').slice(1).join('</p><p>அதிர்ஷ்ட')).predictions, {});
});

test('parseRss: Daily Thanthi feed uses only today\'s daily item', () => {
  const xml = `<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    ${thanthiItem('வார ராசிபலன்: நவம்பர் 08 முதல் 14 வரை', 'Tue, 10 Nov 2026 07:27:11 +0000', 'WEEKLY')}
    ${thanthiItem('புதிய வாய்ப்புகள்... இன்றைய ராசிபலன் - நவம்பர் 10, 2026', 'Tue, 10 Nov 2026 01:11:50 +0000', 'TODAY')}
    ${thanthiItem('இன்றைய ராசிபலன் - நவம்பர் 09, 2026', 'Mon, 09 Nov 2026 01:07:55 +0000', 'YESTERDAY')}
  </channel></rss>`;

  const { predictions, nallaNeram } = parseRss(xml, { today: TODAY });
  assert.ok(predictions.mesham.startsWith('TODAY'));
  assert.ok(predictions.mithunam.startsWith('TODAY'));
  assert.ok(!predictions.rishabam.includes('மிதுனம்'), '<p>மிதுனம்</p> must end ரிஷபம்\'s section');
  assert.equal(nallaNeram, 'காலை 7.45 - 8.45, மாலை 4.45 - 5.45');

  // Before the day's article is published, return nothing — not yesterday's text.
  const early = parseRss(xml, { today: { iso: '2026-11-11' } });
  assert.deepEqual(early.predictions, {});
  assert.equal(early.todaysItems, 0, 'lets the scraper log "not published yet" instead of "layout not recognised"');
});

test('parseRss: hindutamil.in inline-strong item with zero-width spaces', () => {
  const paras = ['மேஷம்', 'ரிஷபம்', 'மிதுனம்', 'கடகம்']
    .map((r) => `<p><strong>${r}:</strong> சந்${ZWSP}திராஷ்டமம் தொடர்${ZWSP}வ${ZWSP}தால் ${LONG}</p>`)
    .join('');
  const xml = `<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    <item><title>ஜோதிட நாள்காட்டி 10.11.2026</title><pubDate>Tue, 10 Nov 2026 00:14:43 +0000</pubDate>
      <description>நல்ல நேரம்: காலை 8-9, இரவு 7-8.யோகம்: சித்தயோகம்.</description></item>
    <item><title>மேஷம் முதல் மீனம் வரை: இன்றைய ராசிபலன் 10 நவம்பர் 2026</title>
      <pubDate>Tue, 10 Nov 2026 00:18:48 +0000</pubDate><content:encoded><![CDATA[${paras}]]></content:encoded></item>
  </channel></rss>`;

  const { predictions, nallaNeram } = parseRss(xml, { today: TODAY });
  assert.ok(predictions.mesham.startsWith('சந்திராஷ்டமம் தொடர்வதால்'));
  assert.ok(predictions.kadagam);
  assert.equal(nallaNeram, 'காலை 8-9, இரவு 7-8');
});

test('scrapeAllSources: Nalla Neram only from a trusted paper, even after the readings are complete', async () => {
  const { scrapeAllSources, RASIS } = _internals;
  const { createServer } = await import('node:http');
  const paras = RASIS.map((r) => `<p><strong>${r.tamil}:</strong> ${LONG}</p>`).join('');
  const hinduTamil = `<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    <item><title>ஜோதிட நாள்காட்டி 10.11.2026</title><pubDate>Tue, 10 Nov 2026 00:14:43 +0000</pubDate>
      <description>நல்ல நேரம்: காலை 9-10, மாலை 4-5.யோகம்: சித்தயோகம்.</description></item>
    <item><title>இன்றைய ராசிபலன் 10 நவம்பர் 2026</title><pubDate>Tue, 10 Nov 2026 00:18:48 +0000</pubDate>
      <content:encoded><![CDATA[${paras}]]></content:encoded></item></channel></rss>`;
  const thanthi = `<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    ${thanthiItem('இன்றைய ராசிபலன் - நவம்பர் 10, 2026', 'Tue, 10 Nov 2026 01:11:50 +0000', 'TODAY')}</channel></rss>`;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
    res.end(req.url === '/ht' ? hinduTamil : thanthi);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    // "localhost" plays dailythanthi.com (trusted); 127.0.0.1 plays hindutamil.in.
    const sources = [`http://127.0.0.1:${port}/ht`, `http://localhost:${port}/dt`];
    const merged = await scrapeAllSources(TODAY, { sources, nallaHosts: ['localhost'] });
    assert.equal(Object.keys(merged.predictions).length, 12);
    assert.equal(merged.source, '127.0.0.1');
    assert.equal(merged.nallaNeram, 'காலை 7.45 - 8.45, மாலை 4.45 - 5.45');

    // No trusted paper at all: no Nalla Neram line (the weekday table is used).
    const untrusted = await scrapeAllSources(TODAY, { sources: sources.slice(0, 1), nallaHosts: ['localhost'] });
    assert.equal(untrusted.nallaNeram, null);
  } finally {
    server.close();
  }
});

test('Panchangam: Monday Rahu Kalam lands near 7:30 – 9:00 AM in Chennai', () => {
  // 2026-03-23 is a Monday close to the equinox (≈12h day).
  const p = computePanchangam({ year: 2026, month: 3, day: 23, weekday: 1 }, 13.0827, 80.2707);
  assert.match(p.rahuKalam, /^7:\d\d – 9:\d\d AM$/);
  assert.match(p.sunrise, /^6:\d\d AM$/);
  assert.ok(p.abhijit);
});

test('Panchangam: no Abhijit on Wednesday', () => {
  const p = computePanchangam({ year: 2026, month: 11, day: 11, weekday: 3 }, 13.0827, 80.2707);
  assert.equal(p.abhijit, null);
});

test('formatRange collapses shared meridiem', () => {
  assert.equal(formatRange(450, 540), '7:30 – 9:00 AM');
  assert.equal(formatRange(690, 780), '11:30 AM – 1:00 PM');
});
