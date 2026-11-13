/**
 * Original rasi palan generated from Chandra Gochara — the classical reading
 * of the Moon's transit through the houses counted from each rasi.
 *
 * Favourable houses: 1, 3, 6, 7, 10, 11. Unfavourable: 2, 4, 5, 9, 12.
 * The 8th house is சந்திராஷ்டமம், the most cautionary day of the month.
 *
 * All text below is written for this project, so the output carries no
 * third-party copyright. `score` runs from -2 (caution) to +2 (very good).
 */

const GOCHARA = Object.freeze({
  1: {
    score: 1,
    summary: 'நலம்',
    text: 'சந்திரன் உங்கள் ராசியிலேயே சஞ்சரிப்பதால் மனதில் உற்சாகம் இருக்கும். உடல்நலனில் சற்று அக்கறை காட்டினால் நாள் இனிமையாக அமையும். குடும்பத்தினருடன் மகிழ்ச்சியாக நேரம் செலவிடுவீர்கள்.',
  },
  2: {
    score: -1,
    summary: 'செலவு',
    text: 'சந்திரன் இரண்டாம் இடத்தில் இருப்பதால் எதிர்பாராத செலவுகள் வரலாம். பேச்சில் நிதானம் தேவை. பண விஷயங்களில் கவனமாக இருப்பது நல்லது.',
  },
  3: {
    score: 2,
    summary: 'வெற்றி',
    text: 'சந்திரன் மூன்றாம் இடத்தில் இருப்பதால் முயற்சிகள் வெற்றி தரும். உடன்பிறந்தவர்களின் ஆதரவு கிடைக்கும். தைரியமாக முடிவெடுத்து முன்னேறுவீர்கள்.',
  },
  4: {
    score: -1,
    summary: 'கவனம்',
    text: 'சந்திரன் நான்காம் இடத்தில் இருப்பதால் மனதில் சிறு கவலைகள் தோன்றலாம். பயணங்களிலும் வாகனங்களிலும் கவனம் தேவை. தாயாரின் உடல்நலனில் அக்கறை காட்டுங்கள்.',
  },
  5: {
    score: -1,
    summary: 'பொறுமை',
    text: 'சந்திரன் ஐந்தாம் இடத்தில் இருப்பதால் காரியங்களில் தாமதம் ஏற்படலாம். பிள்ளைகள் விஷயத்தில் அக்கறை தேவை. அவசர முடிவுகளைத் தவிர்ப்பது நல்லது.',
  },
  6: {
    score: 2,
    summary: 'லாபம்',
    text: 'சந்திரன் ஆறாம் இடத்தில் இருப்பதால் போட்டிகளில் வெற்றி கிடைக்கும். கடன் பிரச்சினைகள் குறையும். உடல்நலம் சீராகி உற்சாகமாகச் செயல்படுவீர்கள்.',
  },
  7: {
    score: 1,
    summary: 'மகிழ்ச்சி',
    text: 'சந்திரன் ஏழாம் இடத்தில் இருப்பதால் வாழ்க்கைத் துணையுடன் இணக்கம் கூடும். கூட்டு முயற்சிகள் கை கொடுக்கும். நண்பர்களால் மகிழ்ச்சி உண்டு.',
  },
  8: {
    score: -2,
    summary: 'சந்திராஷ்டமம்',
    text: 'இன்று சந்திராஷ்டமம். புதிய முயற்சிகளையும் முக்கிய முடிவுகளையும் தள்ளிப்போடுங்கள். வாக்குவாதங்களைத் தவிர்த்து நிதானமாகச் செயல்படுவது நல்லது.',
  },
  9: {
    score: -1,
    summary: 'தடை',
    text: 'சந்திரன் ஒன்பதாம் இடத்தில் இருப்பதால் சில காரியங்களில் தடைகள் வரலாம். பெரியோரின் ஆலோசனையுடன் செயல்படுவது நல்லது. இறை வழிபாடு மன அமைதி தரும்.',
  },
  10: {
    score: 2,
    summary: 'முன்னேற்றம்',
    text: 'சந்திரன் பத்தாம் இடத்தில் இருப்பதால் தொழிலிலும் பணியிலும் முன்னேற்றம் காண்பீர்கள். மேலதிகாரிகளின் பாராட்டு கிடைக்கும். எடுத்த காரியம் நிறைவேறும்.',
  },
  11: {
    score: 2,
    summary: 'ஆதாயம்',
    text: 'சந்திரன் பதினொன்றாம் இடத்தில் இருப்பதால் பண வரவு அதிகரிக்கும். நண்பர்களால் ஆதாயம் உண்டு. நீண்ட நாள் எதிர்பார்ப்பு நிறைவேறும்.',
  },
  12: {
    score: -1,
    summary: 'விரயம்',
    text: 'சந்திரன் பன்னிரண்டாம் இடத்தில் இருப்பதால் வீண் செலவுகளும் அலைச்சலும் ஏற்படலாம். போதுமான ஓய்வு எடுங்கள். பிறருக்கு வாக்குறுதி கொடுப்பதில் கவனம் தேவை.',
  },
});

const TONE = Object.freeze({ 2: 'மிக நன்று', 1: 'நன்று', [-1]: 'மிதம்', [-2]: 'எச்சரிக்கை' });

/** English versions of the same readings (same houses, same scores). */
const GOCHARA_EN = Object.freeze({
  1: {
    summary: 'Good',
    text: 'With the Moon in your own sign, you will feel cheerful and energetic. Take a little care of your health and the day will go smoothly. Time with family brings joy.',
  },
  2: {
    summary: 'Expenses',
    text: 'With the Moon in the 2nd house, unexpected expenses may come up. Choose your words carefully and be careful with money matters.',
  },
  3: {
    summary: 'Success',
    text: 'With the Moon in the 3rd house, your efforts will succeed. Siblings will support you. Make bold decisions and move ahead.',
  },
  4: {
    summary: 'Caution',
    text: 'With the Moon in the 4th house, small worries may trouble your mind. Take care while travelling and driving. Look after your mother\'s health.',
  },
  5: {
    summary: 'Patience',
    text: 'With the Moon in the 5th house, some tasks may be delayed. Pay attention to your children\'s needs. Avoid hasty decisions.',
  },
  6: {
    summary: 'Gains',
    text: 'With the Moon in the 6th house, you will win against competition. Debt worries ease. Your health improves and you will work with enthusiasm.',
  },
  7: {
    summary: 'Happiness',
    text: 'With the Moon in the 7th house, harmony with your spouse grows. Partnerships work in your favour. Friends bring happiness.',
  },
  8: {
    summary: 'Chandrashtamam',
    text: 'Today is Chandrashtamam. Postpone new ventures and important decisions. Avoid arguments and act calmly.',
  },
  9: {
    summary: 'Obstacles',
    text: 'With the Moon in the 9th house, some tasks may meet obstacles. Act on the advice of elders. Prayer will bring peace of mind.',
  },
  10: {
    summary: 'Progress',
    text: 'With the Moon in the 10th house, you will make progress at work and in business. Superiors will appreciate you. What you start will be completed.',
  },
  11: {
    summary: 'Profit',
    text: 'With the Moon in the 11th house, income increases. Friends bring benefits. A long-awaited wish will be fulfilled.',
  },
  12: {
    summary: 'Losses',
    text: 'With the Moon in the 12th house, needless spending and running around are possible. Get enough rest. Be careful when making promises to others.',
  },
});

const TONE_EN = Object.freeze({ 2: 'Very good', 1: 'Good', [-1]: 'Moderate', [-2]: 'Caution' });

/** One-line headline per house: [Tamil, English]. */
const HEADLINES = Object.freeze({
  1: ['மனதில் உற்சாகம்', 'Cheerful and energetic'],
  2: ['செலவுகளில் கவனம்', 'Watch your spending'],
  3: ['முயற்சிகளில் வெற்றி', 'Your efforts succeed'],
  4: ['பயணங்களில் கவனம்', 'Take care while travelling'],
  5: ['அவசர முடிவுகள் வேண்டாம்', 'No hasty decisions'],
  6: ['போட்டிகளில் வெற்றி', 'You win against rivals'],
  7: ['குடும்பத்தில் இணக்கம்', 'Harmony at home'],
  8: ['சந்திராஷ்டமம் — நிதானம் தேவை', 'Chandrashtamam — stay calm'],
  9: ['தடைகளைப் பொறுமையாகக் கடப்பீர்', 'Patience through obstacles'],
  10: ['பணியில் முன்னேற்றம்', 'Progress at work'],
  11: ['பண வரவு உண்டு', 'Gains and income'],
  12: ['வீண் செலவைத் தவிர்க்கவும்', 'Avoid needless spending'],
});

/** Part of day for a change time given as minutes after midnight. */
function partOfDay(minutes) {
  if (minutes < 12 * 60) return 0;
  if (minutes < 16 * 60) return 1;
  if (minutes < 19 * 60) return 2;
  return 3;
}

/** Headline suffixes for a Moon change, by part of day: morning, afternoon, evening, night. */
const HEADLINE_CHANGE = Object.freeze({
  ta: {
    parts: ['காலையில்', 'மதியத்தில்', 'மாலையில்', 'இரவில்'],
    untilParts: ['காலை', 'மதியம்', 'மாலை', 'இரவு'],
    worse: (p) => `${p} சற்று கவனம்`,
    better: (p) => `${p} நிலைமை சீராகும்`,
    into: (p) => `${p} சந்திராஷ்டமம் தொடக்கம்`,
    outOf: (p) => `${p} சந்திராஷ்டமம் விலகும்`,
    chandrashtamamUntil: (p) => `${p} வரை சந்திராஷ்டமம் — நிதானம் தேவை`,
    chandrashtamamFrom: (p) => `${p} முதல் சந்திராஷ்டமம் — நிதானம் தேவை`,
    goodUntil: (p) => `${p} வரை சாதகம்`,
    carefulUntil: (p) => `${p} வரை கவனம்`,
  },
  en: {
    parts: ['in the morning', 'in the afternoon', 'in the evening', 'at night'],
    untilParts: ['the morning', 'the afternoon', 'the evening', 'night'],
    worse: (p) => `take care ${p}`,
    better: (p) => `better ${p}`,
    into: (p) => `Chandrashtamam begins ${p}`,
    outOf: (p) => `Chandrashtamam ends ${p}`,
    chandrashtamamUntil: (p) => `Chandrashtamam until ${p} — stay calm`,
    chandrashtamamFrom: (p) => `Chandrashtamam from ${p} — stay calm`,
    goodUntil: (p) => `good until ${p}`,
    carefulUntil: (p) => `careful until ${p}`,
  },
});

/** Chandrashtamam for one rasi today, in words. */
const CHANDRASHTAMAM_TEXT = Object.freeze({
  ta: {
    none: 'இன்று உங்களுக்கு சந்திராஷ்டமம் இல்லை',
    allDay: 'இன்று உங்களுக்கு சந்திராஷ்டமம்',
    until: (t) => `${t} வரை உங்களுக்கு சந்திராஷ்டமம்`,
    from: (t) => `${t} முதல் உங்களுக்கு சந்திராஷ்டமம்`,
  },
  en: {
    none: 'No Chandrashtamam for you today',
    allDay: 'Chandrashtamam for you today',
    until: (t) => `Chandrashtamam for you until ${t}`,
    from: (t) => `Chandrashtamam for you from ${t}`,
  },
});

/** House (1..12) of the Moon counted from `rasiIndex`, the rasi itself being 1. */
function houseFrom(rasiIndex, moonRasiIndex) {
  return ((moonRasiIndex - rasiIndex + 12) % 12) + 1;
}

const SENTENCES = Object.freeze({
  ta: {
    intoChandrashtamam: (t) => `${t} முதல் சந்திராஷ்டமம் தொடங்குவதால், அதன் பிறகு கவனமாகச் செயல்படுங்கள்.`,
    outOfChandrashtamam: (t) => `${t} உடன் சந்திராஷ்டமம் விலகுவதால், அதன் பிறகு நிலைமை சீராகும்.`,
    better: (t) => `${t} முதல் சந்திரன் இடம் மாறுவதால் நிலைமை மேம்படும்.`,
    worse: (t) => `${t} முதல் சந்திரன் இடம் மாறுவதால் சற்று கவனம் தேவை.`,
    morningChandrashtamam: (t) => `${t} வரை சந்திராஷ்டமம் இருப்பதால் காலையில் கவனம் தேவை.`,
    betterUntil: (t) => `${t} வரை நிலைமை சாதகமாக இருக்கும்.`,
    worseUntil: (t) => `${t} வரை சற்று கவனம் தேவை.`,
  },
  en: {
    intoChandrashtamam: (t) => `Chandrashtamam begins at ${t}, so be careful after that.`,
    outOfChandrashtamam: (t) => `Chandrashtamam ends at ${t}, and things settle down after that.`,
    better: (t) => `The Moon changes sign at ${t}, and things improve after that.`,
    worse: (t) => `The Moon changes sign at ${t}; take a little more care after that.`,
    morningChandrashtamam: (t) => `Chandrashtamam lasts until ${t}, so be careful in the morning.`,
    betterUntil: (t) => `Things go well until ${t}.`,
    worseUntil: (t) => `Take a little more care until ${t}.`,
  },
});

/** One sentence about the Moon changing rasi during the day, or ''. */
function transitionSentence(fromHouse, toHouse, timeText, s) {
  if (toHouse === 8) return s.intoChandrashtamam(timeText);
  if (fromHouse === 8) return s.outOfChandrashtamam(timeText);
  const delta = GOCHARA[toHouse].score - GOCHARA[fromHouse].score;
  if (delta > 0) return s.better(timeText);
  if (delta < 0) return s.worse(timeText);
  return '';
}

/**
 * @param rasiIndex     0 = மேஷம் … 11 = மீனம்
 * @param moonRasiSpans [{ index, endMs }] from sunrise to next sunrise
 * @param day           { sunriseMs, sunsetMs, nextSunriseMs }
 * @param formatTime    (ms) => display string, e.g. "2:18 PM"
 * @param lang          'ta' (default) or 'en'
 * @param minutesOfDay  (ms) => minutes after local midnight (for "evening" etc.)
 */
function generateRasiPalan(rasiIndex, moonRasiSpans, day, formatTime, lang = 'ta', minutesOfDay = null) {
  const english = lang === 'en';
  const sentences = english ? SENTENCES.en : SENTENCES.ta;
  const change = english ? HEADLINE_CHANGE.en : HEADLINE_CHANGE.ta;
  const [first, second] = moonRasiSpans;
  const changeMs = second ? first.endMs : null;
  const midday = (day.sunriseMs + day.sunsetMs) / 2;
  const hour = 3_600_000;

  // Read the day by the Moon that rules most of the Panchangam day (sunrise to
  // next sunrise), as Tamil daily calendars do: a sign change before about
  // 6 PM means the new sign governs the day.
  const midpoint = (day.sunriseMs + day.nextSunriseMs) / 2;
  const primary = changeMs !== null && changeMs < midpoint ? second : first;
  const house = houseFrom(rasiIndex, primary.index);
  const entry = GOCHARA[house];
  const text = english ? GOCHARA_EN[house] : entry;

  let prediction = text.text;
  let headline = HEADLINES[house][english ? 1 : 0];
  if (changeMs !== null) {
    const fromHouse = houseFrom(rasiIndex, first.index);
    const toHouse = houseFrom(rasiIndex, second.index);
    const partIndex = partOfDay(minutesOfDay ? minutesOfDay(changeMs) : 12 * 60);
    const part = change.parts[partIndex];
    const untilPart = change.untilParts[partIndex];
    const time = formatTime(changeMs);
    const delta = GOCHARA[toHouse].score - GOCHARA[fromHouse].score;
    let sentence = '';
    let suffix = '';
    if (primary === first) {
      // Late change (evening or night).
      if (changeMs < day.sunsetMs || toHouse === 8 || fromHouse === 8) {
        sentence = transitionSentence(fromHouse, toHouse, time, sentences);
        if (toHouse === 8) suffix = change.into(part);
        else if (fromHouse === 8) headline = change.chandrashtamamUntil(untilPart); // the day *is* house 8
        else if (delta < 0) suffix = change.worse(part);
        else if (delta > 0) suffix = change.better(part);
      }
    } else if (fromHouse === 8) {
      sentence = sentences.morningChandrashtamam(time);
      // Chandrashtamam covering most of the daylight is what the day feels like.
      if (changeMs > midday) headline = change.chandrashtamamUntil(untilPart);
      else suffix = change.outOf(part);
    } else if (toHouse === 8) {
      sentence = sentences.intoChandrashtamam(time);
      if (changeMs > day.sunriseMs + hour) headline = change.chandrashtamamFrom(untilPart);
    } else if (changeMs - day.sunriseMs >= 2 * hour && delta !== 0) {
      // The earlier sign held for a meaningful part of the morning.
      sentence = delta < 0 ? sentences.betterUntil(time) : sentences.worseUntil(time);
      suffix = delta < 0 ? change.goodUntil(untilPart) : change.carefulUntil(untilPart);
    }
    if (sentence) prediction = `${prediction} ${sentence}`;
    if (suffix) headline = `${headline}; ${suffix}`;
  }

  const houses = moonRasiSpans.map((s) => houseFrom(rasiIndex, s.index));
  const words = english ? CHANDRASHTAMAM_TEXT.en : CHANDRASHTAMAM_TEXT.ta;
  let chandrashtamam;
  if (!houses.includes(8)) chandrashtamam = { state: 'none', text: words.none };
  else if (houses.every((h) => h === 8)) chandrashtamam = { state: 'allDay', text: words.allDay };
  else if (houses[0] === 8) chandrashtamam = { state: 'until', time: formatTime(changeMs), text: words.until(formatTime(changeMs)) };
  else chandrashtamam = { state: 'from', time: formatTime(changeMs), text: words.from(formatTime(changeMs)) };

  // How the reading was worked out, for the app's "how is this calculated" view:
  // each sign the Moon is in during this Panchangam day, its house from this
  // rasi, and which one decided the reading (the one holding most of the day).
  const basis = {
    moon: moonRasiSpans.map((s, i) => ({
      rasi: s.name,
      rasiIndex: s.index,
      house: houses[i],
      until: s.endMs !== null && s.endMs < day.nextSunriseMs ? formatTime(s.endMs) : null,
    })),
    ruling: moonRasiSpans.indexOf(primary),
  };

  return {
    prediction,
    headline,
    summary: text.summary,
    house,
    score: entry.score,
    tone: (english ? TONE_EN : TONE)[entry.score],
    isChandrashtamam: houses.includes(8),
    chandrashtamam,
    basis,
    method: 'chandra-gochara',
  };
}

/** The Chandra Gochara rule table in [lang]: house 1–12 -> { summary, score }. */
function gocharaTable(lang = 'ta') {
  return Object.keys(GOCHARA).map((h) => ({
    house: Number(h),
    summary: (lang === 'en' ? GOCHARA_EN : GOCHARA)[h].summary,
    score: GOCHARA[h].score,
  }));
}

export { generateRasiPalan, houseFrom, gocharaTable, GOCHARA };
