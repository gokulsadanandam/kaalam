/**
 * Original rasi palan generated from Chandra Gochara — the classical reading
 * of the Moon's transit through the houses counted from each rasi — refined
 * by the day's Panchangam (see lib/rasiFactors.js for the weights): Tara Bala
 * for each of the rasi's stars, tithi and yoga, the weekday lord and karana.
 *
 * Favourable houses: 1, 3, 6, 7, 10, 11. Unfavourable: 2, 4, 5, 9, 12.
 * The 8th house is சந்திராஷ்டமம், the most cautionary day of the month.
 *
 * Each house has four phrasings; the phrasing is picked from the date so two
 * consecutive days never use the same one (the Moon stays ~2.25 days in a sign).
 *
 * All text below is written for this project, so the output carries no
 * third-party copyright. `score` runs from -2 (caution) to +2 (very good).
 */

import {
  GOCHARA_SCORES, TARAS, WEIGHTS, RASI_LORDS, dayFactors, dominantShift, scoreOf, tithiKind, tithiScore, yogaScore, isFixedKarana,
} from './rasiFactors.js';
import { namesFor } from './panchangam.js';

const GOCHARA = Object.freeze({
  1: {
    score: GOCHARA_SCORES[1],
    summary: 'நலம்',
    text: 'சந்திரன் உங்கள் ராசியிலேயே சஞ்சரிப்பதால் மனதில் உற்சாகம் இருக்கும். உடல்நலனில் சற்று அக்கறை காட்டினால் நாள் இனிமையாக அமையும். குடும்பத்தினருடன் மகிழ்ச்சியாக நேரம் செலவிடுவீர்கள்.',
  },
  2: {
    score: GOCHARA_SCORES[2],
    summary: 'செலவு',
    text: 'சந்திரன் இரண்டாம் இடத்தில் இருப்பதால் எதிர்பாராத செலவுகள் வரலாம். பேச்சில் நிதானம் தேவை. பண விஷயங்களில் கவனமாக இருப்பது நல்லது.',
  },
  3: {
    score: GOCHARA_SCORES[3],
    summary: 'வெற்றி',
    text: 'சந்திரன் மூன்றாம் இடத்தில் இருப்பதால் முயற்சிகள் வெற்றி தரும். உடன்பிறந்தவர்களின் ஆதரவு கிடைக்கும். தைரியமாக முடிவெடுத்து முன்னேறுவீர்கள்.',
  },
  4: {
    score: GOCHARA_SCORES[4],
    summary: 'கவனம்',
    text: 'சந்திரன் நான்காம் இடத்தில் இருப்பதால் மனதில் சிறு கவலைகள் தோன்றலாம். பயணங்களிலும் வாகனங்களிலும் கவனம் தேவை. தாயாரின் உடல்நலனில் அக்கறை காட்டுங்கள்.',
  },
  5: {
    score: GOCHARA_SCORES[5],
    summary: 'பொறுமை',
    text: 'சந்திரன் ஐந்தாம் இடத்தில் இருப்பதால் காரியங்களில் தாமதம் ஏற்படலாம். பிள்ளைகள் விஷயத்தில் அக்கறை தேவை. அவசர முடிவுகளைத் தவிர்ப்பது நல்லது.',
  },
  6: {
    score: GOCHARA_SCORES[6],
    summary: 'லாபம்',
    text: 'சந்திரன் ஆறாம் இடத்தில் இருப்பதால் போட்டிகளில் வெற்றி கிடைக்கும். கடன் பிரச்சினைகள் குறையும். உடல்நலம் சீராகி உற்சாகமாகச் செயல்படுவீர்கள்.',
  },
  7: {
    score: GOCHARA_SCORES[7],
    summary: 'மகிழ்ச்சி',
    text: 'சந்திரன் ஏழாம் இடத்தில் இருப்பதால் வாழ்க்கைத் துணையுடன் இணக்கம் கூடும். கூட்டு முயற்சிகள் கை கொடுக்கும். நண்பர்களால் மகிழ்ச்சி உண்டு.',
  },
  8: {
    score: GOCHARA_SCORES[8],
    summary: 'சந்திராஷ்டமம்',
    text: 'இன்று சந்திராஷ்டமம். புதிய முயற்சிகளையும் முக்கிய முடிவுகளையும் தள்ளிப்போடுங்கள். வாக்குவாதங்களைத் தவிர்த்து நிதானமாகச் செயல்படுவது நல்லது.',
  },
  9: {
    score: GOCHARA_SCORES[9],
    summary: 'தடை',
    text: 'சந்திரன் ஒன்பதாம் இடத்தில் இருப்பதால் சில காரியங்களில் தடைகள் வரலாம். பெரியோரின் ஆலோசனையுடன் செயல்படுவது நல்லது. இறை வழிபாடு மன அமைதி தரும்.',
  },
  10: {
    score: GOCHARA_SCORES[10],
    summary: 'முன்னேற்றம்',
    text: 'சந்திரன் பத்தாம் இடத்தில் இருப்பதால் தொழிலிலும் பணியிலும் முன்னேற்றம் காண்பீர்கள். மேலதிகாரிகளின் பாராட்டு கிடைக்கும். எடுத்த காரியம் நிறைவேறும்.',
  },
  11: {
    score: GOCHARA_SCORES[11],
    summary: 'ஆதாயம்',
    text: 'சந்திரன் பதினொன்றாம் இடத்தில் இருப்பதால் பண வரவு அதிகரிக்கும். நண்பர்களால் ஆதாயம் உண்டு. நீண்ட நாள் எதிர்பார்ப்பு நிறைவேறும்.',
  },
  12: {
    score: GOCHARA_SCORES[12],
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

/**
 * Three more phrasings per house (the GOCHARA / GOCHARA_EN text is phrasing 0).
 * Every house-8 phrasing names சந்திராஷ்டமம் / Chandrashtamam.
 */
const MORE_TEXT = Object.freeze({
  ta: {
    1: [
      'உங்கள் ராசியிலேயே சந்திரன் சஞ்சரிப்பதால் மனம் தெளிவாக இருக்கும். ஒழுங்கான உணவும் ஓய்வும் உற்சாகத்தைத் தக்கவைக்கும். குடும்பத்தில் சிறு மகிழ்ச்சிகள் நிறைவு தரும்.',
      'ஜென்ம ராசியில் சந்திரன் இருப்பதால் தன்னம்பிக்கை கூடும். தள்ளிப்போட்ட சொந்த வேலைகளை முடிக்க ஏற்ற நாள். போதிய ஓய்வு எடுப்பது நல்லது.',
      'சந்திரன் உங்கள் ராசியில் இருப்பதால் மனநிலை இனிமையாக இருக்கும். உங்கள் அன்பான அணுகுமுறை பிறரைக் கவரும். உடல்நலனில் சிறிது கவனம் வைத்தால் நாள் சிறப்பாக அமையும்.',
    ],
    2: [
      'சந்திரன் இரண்டாம் இடத்தில் சஞ்சரிப்பதால் செலவுகள் கூடலாம். திட்டமிட்டுச் செலவு செய்யுங்கள்; இன்று கடன் கொடுப்பதைத் தவிர்க்கவும். இனிமையான பேச்சு குடும்ப அமைதியைக் காக்கும்.',
      'இரண்டாம் இடத்து சந்திரனால் சிறு சிறு செலவுகளில் பணம் கரையலாம். கணக்கு வழக்குகளைக் கவனமாகச் சரிபாருங்கள். குடும்ப விஷயங்களில் யோசித்துப் பேசுங்கள்.',
      'சந்திரன் இரண்டாம் இடத்தில் இருப்பதால் பணத்திலும் பேச்சிலும் கவனம் தேவை. பெரிய கொள்முதல்களை முடிந்தால் தள்ளிப்போடுங்கள். நேரத்துக்கு உணவு உண்டு, எரிச்சலைத் தவிர்க்கவும்.',
    ],
    3: [
      'சந்திரன் மூன்றாம் இடத்தில் சஞ்சரிப்பதால் தைரியமும் சுறுசுறுப்பும் கூடும். குறுகிய பயணங்களும் தொலைபேசி அழைப்புகளும் நல்ல செய்தி தரும். உடன்பிறந்தோரும் அக்கம்பக்கத்தினரும் உதவுவார்கள்.',
      'மூன்றாம் இடத்து சந்திரனால் முன்முயற்சிகள் பலன் தரும். நீங்கள் முதல் அடி எடுத்து வைத்தால் நிலுவைப் பணிகள் முன்னேறும். உங்கள் பேச்சு இன்று எடுபடும்.',
      'சந்திரன் மூன்றாம் இடத்தில் இருப்பதால் தன்னம்பிக்கை உயரும். போட்டிகளில் உங்கள் கை ஓங்கும். உடன்பிறந்தவர் அல்லது நண்பரின் வார்த்தை நல்ல வாய்ப்பைத் திறக்கும்.',
    ],
    4: [
      'சந்திரன் நான்காம் இடத்தில் சஞ்சரிப்பதால் மன அமைதி சற்று குறையலாம். வாகனத்தைக் கவனமாக ஓட்டுங்கள்; வீடு, வாகன ஆவணங்களை ஒழுங்காக வைத்திருங்கள். தாயாருடன் நேரம் செலவிடுங்கள்.',
      'நான்காம் இடத்து சந்திரனால் வீட்டு வசதிகளில் கவனம் தேவைப்படலாம். தேவையற்ற கவலைகளை விடுங்கள்; நிலைமை நீங்கள் நினைப்பதைவிட நன்றாகவே இருக்கும். அவசியமான பயணங்களை மட்டும் மேற்கொள்ளுங்கள்.',
      'சந்திரன் நான்காம் இடத்தில் இருப்பதால் சிறு விஷயங்களும் மனதை பாதிக்கலாம். வீட்டுத் திட்டங்களை எளிமையாக வைத்துக்கொள்ளுங்கள். மாலையில் வீட்டில் அமைதியாக இருப்பது மன நிம்மதி தரும்.',
    ],
    5: [
      'சந்திரன் ஐந்தாம் இடத்தில் சஞ்சரிப்பதால் திட்டங்கள் மெதுவாக நகரலாம். அபாயமான முதலீடுகளைத் தவிர்க்கவும். பிள்ளைகளிடம் பொறுமையாக நடந்துகொள்ளுங்கள்.',
      'ஐந்தாம் இடத்து சந்திரனால் மனம் அலைபாயலாம். புதிய பொறுப்புகளை ஏற்கும் முன் ஒருமுறைக்கு இருமுறை யோசியுங்கள். பெரிய முடிவுகளைவிட படைப்பு சார்ந்த பணிகள் இன்று நன்றாக அமையும்.',
      'சந்திரன் ஐந்தாம் இடத்தில் இருப்பதால் நிதானம் அவசியம். நிலுவையில் உள்ள விஷயங்கள் தெளிவான பிறகு செயல்படுங்கள். பிறரிடம் அதிக எதிர்பார்ப்பு வைக்க வேண்டாம்.',
    ],
    6: [
      'சந்திரன் ஆறாம் இடத்தில் சஞ்சரிப்பதால் எதிர்ப்புகளையும் தடைகளையும் வெல்வீர்கள். பழைய பாக்கிகள் வசூலாகலாம். உடல் ஆரோக்கியமும் உற்சாகமும் கூடும்.',
      'ஆறாம் இடத்து சந்திரனால் தொல்லை தந்த பிரச்சினைகள் குறையத் தொடங்கும். இன்று செய்யும் வேலைக்கு அங்கீகாரம் கிடைக்கும். கடன்களை அடைக்க ஏற்ற நாள்.',
      'சந்திரன் ஆறாம் இடத்தில் இருப்பதால் மன உறுதி கூடும். வழக்கு, விவாதங்கள் உங்களுக்குச் சாதகமாகத் திரும்பும். தொடர்ந்த உடற்பயிற்சி உற்சாகத்தைக் காக்கும்.',
    ],
    7: [
      'சந்திரன் ஏழாம் இடத்தில் சஞ்சரிப்பதால் உறவுகளில் நெருக்கம் கூடும். கூட்டாளிகள் ஒத்துழைப்பார்கள். இனிய சந்திப்பு அல்லது சிறு பயணம் அமையலாம்.',
      'ஏழாம் இடத்து சந்திரனால் கூட்டு முயற்சிகள் நன்றாக நடக்கும். வாழ்க்கைத் துணையுடன் புரிதல் அதிகரிக்கும். பொதுமக்களுடனான தொடர்புகள் சுமுகமாக இருக்கும்.',
      'சந்திரன் ஏழாம் இடத்தில் இருப்பதால் ஒப்பந்தங்களும் குழு முயற்சிகளும் கைகூடும். நண்பர்கள் உங்கள் துணையை நாடுவார்கள். திட்டங்களைப் பகிர்ந்துகொண்டால் ஆதரவு கிடைக்கும்.',
    ],
    8: [
      'இன்று சந்திராஷ்டமம். வழக்கமான வேலைகளை மட்டும் செய்து அபாயங்களைத் தவிருங்கள். மென்மையாகப் பேசுங்கள்; தூண்டுதல்களுக்கு எதிர்வினையாற்ற வேண்டாம்.',
      'உங்களுக்கு இன்று சந்திராஷ்டமம். புதிய பொறுப்புகளையும் நீண்ட பயணங்களையும் தவிர்க்கவும். நன்கு ஓய்வெடுங்கள்; பதற்றங்கள் தானாக விலகும்.',
      'இன்று சந்திராஷ்டமம் என்பதால் பொறுமை தேவை. முக்கிய ஆவணங்களை இருமுறை சரிபாருங்கள்; வாக்குவாதங்களைத் தவிர்க்கவும். வழிபாடும் அமைதியான நேரமும் மனதை நிலைப்படுத்தும்.',
    ],
    9: [
      'சந்திரன் ஒன்பதாம் இடத்தில் சஞ்சரிப்பதால் திட்டங்கள் மெதுவாக நகரலாம். பெரியோர், ஆசிரியர்களின் கருத்துகளை மதியுங்கள். ஆலய தரிசனம் மன ஆறுதல் தரும்.',
      'ஒன்பதாம் இடத்து சந்திரனால் அதிர்ஷ்டத்துக்கு உழைப்பின் துணை தேவைப்படும். தந்தை, மேலோருடன் வாக்குவாதம் தவிர்க்கவும். தொலைதூரத் திட்டங்களை மறுபரிசீலனை செய்யுங்கள்.',
      'சந்திரன் ஒன்பதாம் இடத்தில் இருப்பதால் தாமதங்களைப் பொறுமையாக ஏற்றுக்கொள்ளுங்கள். ஆன்மிக வாசிப்பும் தானதர்மமும் மனதுக்கு இதம் தரும். இன்று குறுக்கு வழிகளை நாட வேண்டாம்.',
    ],
    10: [
      'சந்திரன் பத்தாம் இடத்தில் சஞ்சரிப்பதால் உங்கள் பணி பலரின் கவனம் பெறும். பொறுப்புகள் பாராட்டைப் பெற்றுத் தரும். வியாபார நடவடிக்கைகள் முன்னேறும்.',
      'பத்தாம் இடத்து சந்திரனால் பணியிடத்தில் உழைப்புக்குப் பலன் கிடைக்கும். நிலுவையில் இருந்த அனுமதி கிடைக்கலாம். உங்கள் மதிப்பு உயரும்.',
      'சந்திரன் பத்தாம் இடத்தில் இருப்பதால் தொழில் முயற்சிகள் கைகொடுக்கும். கூட்டங்களில் முன்னின்று செயல்படுங்கள். இன்று தொடங்கும் வேலைகள் நன்றாக முன்னேறும்.',
    ],
    11: [
      'சந்திரன் பதினொன்றாம் இடத்தில் சஞ்சரிப்பதால் லாபமும் நல்ல செய்திகளும் வந்து சேரும். நண்பர்களும் மூத்த சகோதரர்களும் உதவுவார்கள். எதிர்பார்த்த பணம் கைக்கு வரும்.',
      'பதினொன்றாம் இடத்து சந்திரனால் விருப்பங்கள் நிறைவேறும். சமூகத் தொடர்புகள் பயனளிக்கும். பாக்கிகளை வசூலிக்க ஏற்ற நாள்.',
      'சந்திரன் பதினொன்றாம் இடத்தில் இருப்பதால் வருமானமும் நம்பிக்கையும் உயரும். புதிய தொடர்புகள் பலன் தரும். உதவியவர்களுடன் மகிழ்ச்சியைப் பகிர்ந்துகொள்ளுங்கள்.',
    ],
    12: [
      'சந்திரன் பன்னிரண்டாம் இடத்தில் சஞ்சரிப்பதால் கூடுதல் செலவும் களைப்பும் ஏற்படலாம். நன்றாகத் தூங்குங்கள்; இரவு கண்விழிப்பதைத் தவிர்க்கவும். நற்காரியங்களுக்குச் செலவிடுவது மன நிம்மதி தரும்.',
      'பன்னிரண்டாம் இடத்து சந்திரனால் பயணங்களும் அலைச்சலும் கூடலாம். விலைமதிப்புள்ள பொருட்களைப் பத்திரமாக வைத்திருங்கள். நேரத்தையும் பணத்தையும் அளவுக்கு மீறி ஒப்புக்கொடுக்க வேண்டாம்.',
      'சந்திரன் பன்னிரண்டாம் இடத்தில் இருப்பதால் ஓய்வும் சிந்தனையும் தேவை. அத்தியாவசியமற்ற கொள்முதல்களைத் தள்ளிப்போடுங்கள். அமைதியான வழிபாடு அல்லது தியானம் உதவும்.',
    ],
  },
  en: {
    1: [
      'The Moon passing through your own sign lifts your spirits. Regular meals and rest keep you at your best. Small family moments bring contentment.',
      'With the Moon in your rasi, your mind is clear and confident. It is a good day to finish personal tasks you have put off. Get enough rest.',
      'The Moon in your own sign brings a pleasant mood. Others notice your warmth today. Keep a light watch on your health and the day stays bright.',
    ],
    2: [
      'The Moon in your 2nd house brings spending pressure. Keep to a budget and avoid lending money today. Gentle words keep the peace at home.',
      'With the Moon in the 2nd house, money may slip away on small things. Check bills and accounts carefully. Think before you speak in family matters.',
      'The Moon transiting your 2nd house asks for care with money and speech. Postpone large purchases if you can. Eat on time and avoid irritability.',
    ],
    3: [
      'The Moon in your 3rd house gives courage and drive. Short trips and phone calls bring good news. Siblings and neighbours lend a hand.',
      'With the Moon in the 3rd house, initiative pays off. Pending tasks move forward once you take the first step. Your words carry weight today.',
      'The Moon transiting your 3rd house boosts your confidence. You have the upper hand in competition. A word from a sibling or friend opens a useful door.',
    ],
    4: [
      'The Moon in your 4th house may unsettle your peace of mind. Drive carefully and keep property and vehicle papers in order. Spend time with your mother.',
      'With the Moon in the 4th house, comforts at home may need attention. Let go of needless worry; things are better than they seem. Travel only when necessary.',
      'The Moon transiting your 4th house makes small issues feel bigger. Keep household plans simple. A quiet evening at home restores calm.',
    ],
    5: [
      'The Moon in your 5th house can make plans move slowly. Avoid risky investments. Be patient with your children.',
      'With the Moon in the 5th house, your mind may wander. Think twice before taking on anything new. Creative work goes better than big decisions today.',
      'The Moon transiting your 5th house asks you to slow down. Let pending matters become clear before you act. Keep your expectations of others realistic.',
    ],
    6: [
      'The Moon in your 6th house helps you overcome rivals and hurdles. Old dues may be cleared. Your energy and health are on the rise.',
      'With the Moon in the 6th house, problems that troubled you start to ease. Work done today earns recognition. A good day to settle debts.',
      'The Moon transiting your 6th house strengthens your resolve. Disputes turn in your favour. Regular exercise keeps the momentum going.',
    ],
    7: [
      'The Moon in your 7th house brings warmth to relationships. Partners and associates cooperate. A pleasant meeting or short outing is likely.',
      'With the Moon in the 7th house, joint efforts work well. Understanding with your spouse deepens. Dealings with the public go smoothly.',
      'The Moon transiting your 7th house favours agreements and teamwork. Friends seek your company. Share your plans and support will come.',
    ],
    8: [
      'Chandrashtamam is on today. Keep to routine work and avoid risks. Speak gently and do not react to provocation.',
      'It is Chandrashtamam for you today. Avoid new commitments and long journeys. Rest well and let tensions pass.',
      'Today is Chandrashtamam, so patience is needed. Double-check important papers and avoid arguments. Prayer or quiet time steadies the mind.',
    ],
    9: [
      'The Moon in your 9th house may slow your plans. Respect the views of elders and teachers. A temple visit brings comfort.',
      'With the Moon in the 9th house, luck needs a little help from effort. Avoid arguments with your father or seniors. Review long-distance plans.',
      'The Moon transiting your 9th house asks for patience with delays. Spiritual reading or charity lifts the mood. Do not take shortcuts today.',
    ],
    10: [
      'The Moon in your 10th house puts your work in the spotlight. Responsibilities bring recognition. Business dealings move ahead.',
      'With the Moon in the 10th house, your efforts at work pay off. A pending approval may come through. Your reputation grows.',
      'The Moon transiting your 10th house supports your career. Take the lead in meetings. Work started today progresses well.',
    ],
    11: [
      'The Moon in your 11th house brings gains and good news. Friends and elder siblings help. Expected money arrives.',
      'With the Moon in the 11th house, wishes find fulfilment. Social contacts prove useful. A good day to collect dues.',
      'The Moon transiting your 11th house raises income and hopes. New contacts bring benefits. Share your joy with those who helped you.',
    ],
    12: [
      'The Moon in your 12th house may bring extra expenses and fatigue. Sleep well and avoid late nights. Spending on good causes brings peace.',
      'With the Moon in the 12th house, travel and running around may increase. Keep valuables safe. Do not overcommit your time or money.',
      'The Moon transiting your 12th house calls for rest and reflection. Postpone purchases that can wait. Quiet prayer or meditation helps.',
    ],
  },
});

const PHRASINGS = 4;

/** Phrasing 0 … 3 for a date; consecutive dates always differ (and any 4 in a row are all different). */
function phrasingFor(iso, rasiIndex) {
  if (!iso) return 0;
  const [y, m, d] = iso.split('-').map(Number);
  const epochDay = Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
  return (((epochDay + rasiIndex) % PHRASINGS) + PHRASINGS) % PHRASINGS;
}

function houseText(house, lang, phrasing) {
  if (phrasing === 0) return (lang === 'en' ? GOCHARA_EN : GOCHARA)[house].text;
  return MORE_TEXT[lang === 'en' ? 'en' : 'ta'][house][phrasing - 1];
}

/** Planets 0 … 6: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn. */
const PLANETS = Object.freeze({
  ta: ['சூரியன்', 'சந்திரன்', 'செவ்வாய்', 'புதன்', 'குரு', 'சுக்கிரன்', 'சனி'],
  en: ['the Sun', 'the Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'],
});

/** Tara 1 … 9 and its rating, for the per-star notes. */
const TARA_WORDS = Object.freeze({
  ta: {
    names: [null, 'ஜென்ம', 'சம்பத்', 'விபத்', 'க்ஷேம', 'பிரத்யக்', 'சாதக', 'நைதன', 'மைத்ர', 'பரம மைத்ர'],
    ratings: { good: 'சாதகம்', mixed: 'கலவையான பலன்', caution: 'கவனம் தேவை' },
    note: (tara, rating) => `${tara} தாரை — ${rating}`,
    then: (time, tara) => `; ${time} முதல் ${tara} தாரை`,
  },
  en: {
    names: [null, 'Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyak', 'Sadhana', 'Naidhana', 'Mitra', 'Parama Mitra'],
    ratings: { good: 'favourable', mixed: 'mixed', caution: 'take care' },
    note: (tara, rating) => `${tara} Tara — ${rating}`,
    then: (time, tara) => `; ${tara} from ${time}`,
  },
});

/** Sentences built from the day's Panchangam. Names come from the Panchangam in the same language. */
const PANCHANGA_TEXT = Object.freeze({
  ta: {
    joinNames: (names) => names.join(', '),
    taraAllGood: (star) => `இன்றைய நட்சத்திரம் ${star} என்பதால் உங்கள் ராசியின் எல்லா நட்சத்திரக்காரர்களுக்கும் தாரா பலம் சாதகமாக உள்ளது.`,
    taraCaution: (star, bad, good) => `இன்றைய நட்சத்திரம் ${star} என்பதால் ${bad} நட்சத்திரக்காரர்கள் கவனமாகச் செயல்படுவது நல்லது`
      + (good ? `; ${good} நட்சத்திரக்காரர்களுக்குச் சாதகம்.` : '.'),
    taraJanma: (star, janma, good) => `இன்று ${star} நட்சத்திரம் என்பதால் ${janma} நட்சத்திரக்காரர்களுக்கு ஜென்ம தாரை — உடலுக்கு ஓய்வு கொடுத்து நிதானமாகச் செயல்படுங்கள்`
      + (good ? `; ${good} நட்சத்திரக்காரர்களுக்குச் சாதகம்.` : '.'),
    starWithTara: (name, tara) => `${name} (${tara} தாரை)`,
    tithi: {
      good: (t) => `${t} திதி புதிய தொடக்கங்களுக்கு ஏற்றது.`,
      bad: (t) => `${t} திதி என்பதால் புதிய காரியங்களைத் தொடங்காமல் வழக்கமான வேலைகளைச் செய்யுங்கள்.`,
      pournami: () => 'பௌர்ணமி என்பதால் மனதில் நிறைவும் நம்பிக்கையும் இருக்கும்; வழிபாட்டுக்கும் குடும்பத்துக்கும் ஏற்ற நாள்.',
      amavasai: () => 'அமாவாசை என்பதால் முன்னோர் வழிபாடு செய்து, புதிய முயற்சிகளைத் தள்ளிப்போடுங்கள்.',
    },
    yoga: {
      good: (y) => `${y} யோகம் சீரான முன்னேற்றத்துக்குத் துணை செய்யும்.`,
      bad: (y) => `${y} யோகம் என்பதால் ஒப்பந்தங்களிலும் பெரிய கொள்முதல்களிலும் அவசரம் வேண்டாம்.`,
    },
    weekday: {
      own: (lord) => `இன்றைய வார அதிபதி ${lord} உங்கள் ராசிநாதனே என்பதால் முயற்சிகளுக்குக் கூடுதல் பலன் உண்டு.`,
      friend: (lord, rasiLord) => `இன்றைய வார அதிபதி ${lord} உங்கள் ராசிநாதனுக்கு (${rasiLord}) நட்புக் கிரகம் என்பதால் ஆதரவு கிடைக்கும்.`,
      neutral: (lord, rasiLord) => `இன்றைய வார அதிபதி ${lord} உங்கள் ராசிநாதனுக்கு (${rasiLord}) சமமான கிரகம் என்பதால் உழைப்புக்கு ஏற்ற பலன் கிடைக்கும்.`,
      enemy: (lord, rasiLord) => `இன்றைய வார அதிபதி ${lord} உங்கள் ராசிநாதனுக்கு (${rasiLord}) பகைக் கிரகம் என்பதால் எதிர்பார்ப்புகளை அளவாக வைத்துக்கொள்ளுங்கள்.`,
    },
    karana: {
      vishti: (k, range) => `${k} கரணம் (விஷ்டி) ${range} என்பதால் அந்த நேரத்தில் பயணங்களையும் சுப காரியங்களையும் தொடங்க வேண்டாம்.`,
      fixed: (k) => `${k} ஸ்திர கரணம் என்பதால் புதியவற்றைத் தொடங்குவதைவிட இருப்பதை முடிப்பது நல்லது.`,
      good: (k) => `${k} கரணம் வழக்கமான பணிகளுக்கு ஏற்றது.`,
      until: (end) => `${end} வரை`,
      from: (start) => `${start} முதல்`,
      between: (start, end) => `${start} முதல் ${end} வரை`,
      allDay: 'நாள் முழுவதும்',
    },
    headline: {
      taraUp: 'நட்சத்திர பலம் கூடும்',
      taraDown: 'நட்சத்திர பலத்தில் கவனம்',
      good: (name) => `${name} சாதகம்`,
      bad: (name) => `${name} — நிதானம்`,
      vishti: 'விஷ்டி கரணம் — பயணத்தில் கவனம்',
    },
    weekdays: ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி'],
  },
  en: {
    joinNames: (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]),
    taraAllGood: (star) => `With ${star} as the day's star, Tara Bala is favourable for all your birth stars.`,
    taraCaution: (star, bad, good) => `With ${star} as the day's star, ${bad} natives should move carefully`
      + (good ? `, while ${good} natives are favoured.` : '.'),
    taraJanma: (star, janma, good) => `${star} is the day's star, so ${janma} natives have Janma Tara — rest well and avoid strain`
      + (good ? `; ${good} natives are favoured.` : '.'),
    starWithTara: (name, tara) => `${name} (${tara})`,
    tithi: {
      good: (t) => `${t} tithi supports new beginnings.`,
      bad: (t) => `${t} tithi is not suited to starting new work; stick to routine tasks.`,
      pournami: () => 'It is Pournami, bringing a full and hopeful mood — a good day for prayer and family.',
      amavasai: () => 'It is Amavasai: honour your ancestors and postpone new ventures.',
    },
    yoga: {
      good: (y) => `${y} yoga favours steady progress.`,
      bad: (y) => `${y} yoga prevails, so do not rush agreements or big purchases.`,
    },
    weekday: {
      own: (lord) => `Today's weekday lord, ${lord}, is your own rasi lord, so your efforts carry extra weight.`,
      friend: (lord, rasiLord) => `Today's weekday lord, ${lord}, is a friend of your rasi lord ${rasiLord}, which lends support.`,
      neutral: (lord, rasiLord) => `Today's weekday lord, ${lord}, is neutral to your rasi lord ${rasiLord}; steady effort brings steady results.`,
      enemy: (lord, rasiLord) => `Today's weekday lord, ${lord}, is unfriendly to your rasi lord ${rasiLord}; keep expectations modest.`,
    },
    karana: {
      vishti: (k, range) => `${k} (Vishti) karana ${range} is unsuitable for starting journeys or auspicious work.`,
      fixed: (k) => `${k} is a fixed karana; finish existing work rather than start something new.`,
      good: (k) => `${k} karana suits regular work.`,
      until: (end) => `until ${end}`,
      from: (start) => `from ${start}`,
      between: (start, end) => `from ${start} to ${end}`,
      allDay: 'through the day',
    },
    headline: {
      taraUp: 'stars turn favourable',
      taraDown: 'stars call for care',
      good: (name) => `${name} helps`,
      bad: (name) => `${name} — go slow`,
      vishti: 'Vishti karana — care with travel',
    },
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
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

const round3 = (x) => Math.round(x * 1000) / 1000;

/** Per-star Tara Bala for the rasi's stars: rating, note and changes during the day. */
function starNotes(factors, names, words, formatTime) {
  const taraName = (t) => words.names[t];
  return factors.detail.stars.map((star) => {
    const [first, ...rest] = star.parts;
    const note = words.note(taraName(first.tara), words.ratings[TARAS[first.tara].rating])
      + rest.map((p) => words.then(formatTime(p.startMs), taraName(p.tara))).join('');
    return {
      nakshatra: names.nakshatras[star.nakshatraIndex],
      nakshatraIndex: star.nakshatraIndex,
      padas: star.padas,
      tara: star.tara,
      taraName: taraName(star.tara),
      rating: star.rating,
      value: star.value,
      note,
      changes: rest.map((p) => ({ time: formatTime(p.startMs), tara: p.tara, taraName: taraName(p.tara) })),
    };
  });
}

/** One sentence on Tara Bala across the rasi's stars. */
function taraSentence(factors, stars, names, P) {
  const dayStar = names.nakshatras[factors.detail.dayStar.index];
  const caution = stars.filter((s) => s.rating === 'caution');
  const janma = stars.filter((s) => s.rating === 'mixed');
  const good = stars.filter((s) => s.rating === 'good');
  const goodNames = good.length ? P.joinNames(good.map((s) => s.nakshatra)) : null;
  if (caution.length) return P.taraCaution(dayStar, P.joinNames(caution.map((s) => P.starWithTara(s.nakshatra, s.taraName))), goodNames);
  if (janma.length) return P.taraJanma(dayStar, P.joinNames(janma.map((s) => s.nakshatra)), goodNames);
  return P.taraAllGood(dayStar);
}

/** Of tithi and yoga, the one to talk about: an adverse one first, else the stronger. */
function tithiOrYoga(factors) {
  const t = factors.detail.tithi.main;
  const y = factors.detail.yoga.main;
  const ts = tithiScore(t.index);
  const ys = yogaScore(y.index);
  if ((ts < 0) !== (ys < 0)) return ys < 0 ? { kind: 'yoga', seg: y, score: ys } : { kind: 'tithi', seg: t, score: ts };
  return Math.abs(ys) > Math.abs(ts) ? { kind: 'yoga', seg: y, score: ys } : { kind: 'tithi', seg: t, score: ts };
}

/** The Panchangam sentence for one factor ('tithiYoga', 'weekday' or 'karana'). */
function factorSentence(factor, factors, lang, P, formatTime, day) {
  if (factor === 'tithiYoga') {
    const pick = tithiOrYoga(factors);
    if (pick.kind === 'yoga') return (pick.score > 0 ? P.yoga.good : P.yoga.bad)(pick.seg.name);
    const kind = tithiKind(pick.seg.index);
    if (kind === 'pournami') return P.tithi.pournami();
    if (kind === 'amavasai') return P.tithi.amavasai();
    return (pick.score > 0 ? P.tithi.good : P.tithi.bad)(pick.seg.name);
  }
  if (factor === 'weekday') {
    const { dayLord, rasiLord, relation } = factors.detail.weekday;
    const planets = PLANETS[lang === 'en' ? 'en' : 'ta'];
    return P.weekday[relation](planets[dayLord], planets[rasiLord]);
  }
  const { vishti, main } = factors.detail.karana;
  if (vishti) {
    const fromStart = vishti.startMs <= day.sunriseMs;
    const toEnd = vishti.endMs >= day.nextSunriseMs;
    let range;
    if (fromStart && toEnd) range = P.karana.allDay;
    else if (fromStart) range = P.karana.until(formatTime(vishti.endMs));
    else if (toEnd) range = P.karana.from(formatTime(vishti.startMs));
    else range = P.karana.between(formatTime(vishti.startMs), formatTime(vishti.endMs));
    return P.karana.vishti(vishti.name, range);
  }
  return (isFixedKarana(main.index) ? P.karana.fixed : P.karana.good)(main.name);
}

/** Short headline suffix for the day's dominant shift, or ''. */
function shiftSuffix(shift, factors, lang, P) {
  const h = P.headline;
  if (shift.factor === 'tara') return shift.direction > 0 ? h.taraUp : h.taraDown;
  if (shift.factor === 'tithiYoga') {
    const pick = tithiOrYoga(factors);
    const name = pick.kind === 'yoga' ? `${pick.seg.name} ${lang === 'en' ? 'yoga' : 'யோகம்'}` : pick.seg.name;
    return (pick.score > 0 ? h.good : h.bad)(name);
  }
  if (shift.factor === 'weekday') {
    const value = factors.values.weekday || shift.direction;
    return (value > 0 ? h.good : h.bad)(P.weekdays[factors.detail.weekday.dayLord]);
  }
  if (factors.detail.karana.vishti) return h.vishti;
  return '';
}

/**
 * @param rasiIndex     0 = மேஷம் … 11 = மீனம்
 * @param moonRasiSpans [{ index, endMs }] from sunrise to next sunrise
 * @param day           { sunriseMs, sunsetMs, nextSunriseMs }
 * @param formatTime    (ms) => display string, e.g. "2:18 PM"
 * @param lang          'ta' (default) or 'en'
 * @param minutesOfDay  (ms) => minutes after local midnight (for "evening" etc.)
 * @param panchanga     optional { iso, weekday, nakshatra, tithi, yoga, karana, previous } — the
 *                      day's Panchangam spans (computeAstroPanchangam) and the same for the day
 *                      before (`previous`, plus its moonRasi, sunriseMs, nextSunriseMs). Without
 *                      it the reading is Chandra Gochara alone, in its first phrasing.
 */
function generateRasiPalan(rasiIndex, moonRasiSpans, day, formatTime, lang = 'ta', minutesOfDay = null, panchanga = null) {
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

  let prediction = houseText(house, lang, panchanga ? phrasingFor(panchanga.iso, rasiIndex) : 0);
  const baseHeadline = HEADLINES[house][english ? 1 : 0];
  let headline = baseHeadline;
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

  let score = entry.score;
  let summary = text.summary;
  let stars = null;
  if (panchanga) {
    const names = namesFor(english ? 'en' : 'ta');
    const P = english ? PANCHANGA_TEXT.en : PANCHANGA_TEXT.ta;
    const factors = dayFactors(rasiIndex, { ...panchanga, moonRasi: moonRasiSpans, sunriseMs: day.sunriseMs, nextSunriseMs: day.nextSunriseMs });
    const previous = panchanga.previous ? dayFactors(rasiIndex, panchanga.previous) : null;
    const shift = dominantShift(factors, previous);

    // Chandrashtamam outweighs every other factor.
    score = scoreOf(factors.total);
    if (house === 8) score = -2;
    else if (houses.includes(8)) score = Math.min(score, -1);
    // Keep the one-word summary in step with the score's direction.
    if (Math.sign(score) !== Math.sign(entry.score)) summary = (english ? TONE_EN : TONE)[score];

    stars = starNotes(factors, names, TARA_WORDS[english ? 'en' : 'ta'], formatTime);
    const tara = taraSentence(factors, stars, names, P);
    const candidates = ['tithiYoga', 'weekday', 'karana'];
    const modifierFactor = candidates.includes(shift.factor)
      ? shift.factor
      : candidates.reduce((a, b) => (Math.abs(WEIGHTS[b] * factors.values[b]) > Math.abs(WEIGHTS[a] * factors.values[a]) ? b : a));
    const modifier = factorSentence(modifierFactor, factors, lang, P, formatTime, day);
    prediction = shift.factor === 'tara' ? `${prediction} ${tara} ${modifier}` : `${prediction} ${modifier} ${tara}`;

    // A Moon change or Chandrashtamam already shapes the headline; otherwise name the day's main shift.
    if (headline === baseHeadline && !houses.includes(8)) {
      const suffix = shiftSuffix(shift, factors, english ? 'en' : 'ta', P);
      if (suffix) headline = `${headline}; ${suffix}`;
    }

    const contributions = {};
    for (const k of Object.keys(WEIGHTS)) contributions[k] = round3(WEIGHTS[k] * factors.values[k]);
    const { tithi, yoga, weekday, karana } = factors.detail;
    basis.factors = {
      weights: WEIGHTS,
      values: factors.values,
      contributions,
      total: factors.total,
      score,
      dominant: shift,
      previous: previous ? { values: previous.values, total: previous.total } : null,
      tara: { dayStar: names.nakshatras[factors.detail.dayStar.index], stars },
      tithi: { name: tithi.main.name, kind: tithiKind(tithi.main.index), value: tithi.value },
      yoga: { name: yoga.main.name, value: yoga.value },
      weekday: {
        weekday: P.weekdays[weekday.dayLord],
        lord: PLANETS[english ? 'en' : 'ta'][weekday.dayLord],
        rasiLord: PLANETS[english ? 'en' : 'ta'][RASI_LORDS[rasiIndex]],
        relation: weekday.relation,
      },
      karana: {
        name: karana.main.name,
        vishti: karana.vishti ? { name: karana.vishti.name, from: formatTime(karana.vishti.startMs), until: formatTime(karana.vishti.endMs) } : null,
        value: factors.values.karana,
      },
    };
  }

  return {
    prediction,
    headline,
    summary,
    house,
    score,
    tone: (english ? TONE_EN : TONE)[score],
    isChandrashtamam: houses.includes(8),
    chandrashtamam,
    ...(stars ? { stars } : {}),
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
