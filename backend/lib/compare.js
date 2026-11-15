/**
 * diffScore: how differently the scraped and the generated rasi palan read.
 *
 * Two Tamil texts written by different authors share almost no wording, so a
 * lexical diff would always say "completely different". Instead we compare
 * what a reader takes away:
 *
 *   1. Tone, from -1 (cautionary) to +1 (favourable). The generated tone comes
 *      from its score (Chandra Gochara weighted with the day's Panchangam,
 *      see lib/rasiFactors.js); the scraped tone from a small lexicon
 *      of Tamil favourable / cautionary word stems.
 *   2. Chandrashtamam: a factual flag that should agree on both sides.
 *
 *   score = |generatedTone − scrapedTone| / 2  (+0.3 if chandrashtamam disagrees)
 *
 * 0 means the same message, 1 means opposite messages.
 */

const POSITIVE_STEMS = [
  'வெற்றி', 'லாபம்', 'ஆதாயம்', 'மகிழ்ச்சி', 'சந்தோஷ', 'முன்னேற்ற', 'பாராட்டு', 'நிறைவேறு', 'நிறைவேற்ற',
  'சிறப்பு', 'நன்மை', 'உயர்வு', 'பணவரவு', 'பண வரவு', 'சாதக', 'உற்சாக', 'இனிமை', 'அனுகூல', 'ஆதரவ', 'ஆதரிப்ப',
  'வளர்ச்சி', 'நல்ல செய்தி', 'சுப', 'மனநிறைவு', 'மன நிறைவு', 'கைகூடு', 'அதிர்ஷ்ட', 'புகழ்', 'இணக்க',
  'சீராகு', 'நிம்மதி', 'ஒத்துழைப்பு', 'உயரும்', 'திருப்தி', 'அங்கீகார', 'வசூலா', 'முகமலர்ச்சி',
];

const NEGATIVE_STEMS = [
  'சந்திராஷ்டம', 'தடை', 'தாமத', 'எச்சரிக்கை', 'கவனம் தேவை', 'கவனமாக', 'செலவு', 'விரய', 'பிரச்சினை',
  'பிரச்னை', 'சிக்கல்', 'கவலை', 'மன அழுத்த', 'அலைச்சல்', 'வாக்குவாத', 'நஷ்ட', 'இழப்பு', 'தவிர்',
  'சோர்வு', 'குழப்ப', 'எதிர்ப்பு', 'டென்ஷன்', 'ஏமாற்ற', 'கோப', 'அவசர', 'பொறுமை', 'நிதான', 'விரோத',
  'இழுபறி', 'தடுமாற்ற', 'விவாத', 'மனக்கசப்பு', 'பணிச்சுமை', 'பகைத்து', 'விட்டுக் கொடு',
];

const TAMIL_WORD = '[\\u0B80-\\u0BFF]*';

/**
 * "கடன் பிரச்சினைகள் குறையும்", "இழுபறியாக இருந்து வந்த வேலைகள் முடியும்" are
 * good news: a problem word followed, within a few words, by a resolving verb.
 */
const RESOLVED_PROBLEM = new RegExp(
  `(?:${NEGATIVE_STEMS.map((s) => s.replace(/\s+/g, '\\s*')).join('|')})${TAMIL_WORD}\\s+(?:${TAMIL_WORD}\\s+){0,3}(?:தீர|நீங்|விலக|குறை|சமாளி|மறை|முடியு|முடிந்|முடிப்பீ)${TAMIL_WORD}`,
  'gu',
);

/** Boilerplate present under every rasi on some sites — not a judgement of the day. */
const LUCKY_ITEMS = /அதிர்ஷ்ட\s*(?:நிறம்|எண்|திசை|கல்|தெய்வம்)[^.]*\.?/gu;

function countStems(text, stems) {
  let total = 0;
  for (const stem of stems) total += text.split(stem).length - 1;
  return total;
}

/** Tone of free Tamil text in [-1, 1], plus the evidence behind it. */
function textTone(rawText) {
  const text = String(rawText || '').replace(LUCKY_ITEMS, ' ');
  const resolved = (text.match(RESOLVED_PROBLEM) || []).length;
  const remaining = text.replace(RESOLVED_PROBLEM, ' ');

  const positives = countStems(remaining, POSITIVE_STEMS) + resolved;
  const negatives = countStems(remaining, NEGATIVE_STEMS);
  const tone = (positives - negatives) / (positives + negatives + 1);

  return {
    tone: Math.round(tone * 100) / 100,
    positives,
    negatives,
    mentionsChandrashtamam: text.includes('சந்திராஷ்டம'),
  };
}

const LEVELS = [
  [0.3, 'agree'],
  [0.55, 'partial'],
  [Infinity, 'disagree'],
];

/**
 * @param generated result of generateRasiPalan()
 * @param scrapedText the scraped prediction, or null/'' when unavailable
 * @returns null when there is nothing to compare
 */
function diffScore(generated, scrapedText) {
  if (!generated || !scrapedText) return null;

  const scraped = textTone(scrapedText);
  const generatedTone = generated.score / 2;
  const chandrashtamamAgrees = generated.isChandrashtamam === scraped.mentionsChandrashtamam;

  const raw = Math.abs(generatedTone - scraped.tone) / 2 + (chandrashtamamAgrees ? 0 : 0.3);
  const score = Math.round(Math.min(1, raw) * 100) / 100;
  const cues = scraped.positives + scraped.negatives;

  return {
    score,
    level: LEVELS.find(([limit]) => score < limit)[1],
    // Few tone words in the scraped text means its tone is a weak estimate.
    confidence: cues >= 4 ? 'high' : cues >= 2 ? 'medium' : 'low',
    generatedTone,
    scrapedTone: scraped.tone,
    scrapedCues: { positive: scraped.positives, negative: scraped.negatives },
    chandrashtamam: { generated: generated.isChandrashtamam, scraped: scraped.mentionsChandrashtamam },
  };
}

export { diffScore, textTone };
