# Kaalam — Daily Tamil Rasi Palan & Panchangam Widget

An Android home-screen widget (Jetpack Glance + Material 3) that shows today's
Rasi Palan, **நல்ல நேரம்** and **ராகு காலம்**. Its data comes from a small
Node.js API that scrapes predictions and calculates Panchangam timings.

```
kaalam/
├── backend/                 Node.js ES modules (Express + axios + cheerio + astronomy-engine)
│   ├── index.js             scraper, Panchangam maths, all routes
│   ├── lib/                 panchangam, rasiPalanGenerator, compare (diffScore), store (Supabase cache)
│   ├── api/index.js         Vercel serverless entry (re-exports the app)
│   ├── vercel.json
│   ├── supabase/            Supabase project: functions/kaalam (Deno entry), migrations/, config.toml
│   └── test/                offline tests (npm test)
└── android/                 Kotlin, Glance 1.1, DataStore, Ktor 3, targetSdk 36
    └── app/src/
        ├── main/java/com/kaalam/rasipalan/
        │   ├── data/        Rasi, RasiPalanState, RasiDataStore, Repository, PredictionChooser, network/
        │   ├── widget/      RasiPalanWidget (UI), Receiver, Actions, Updater, Theme
        │   └── MainActivity.kt  rasi picker + widget configure screen
        └── test/            JVM unit tests (./gradlew testDebugUnitTest)
```

## Data pipeline

```
 ┌──────────────── Android ────────────────┐            ┌──────────── Backend ────────────┐
 │                                         │            │                                 │
 │  APPWIDGET_UPDATE (every 4 h, no wake)  │            │  GET /api/rasipalan?rasi=mesham │
 │  or user tap (⟳ / next rasi / picker)   │            │    normaliseRasi()              │
 │            │                            │   HTTPS    │    getDailyScrape()  ◄─ cache   │
 │            ▼                            │  ───────►  │      axios → cheerio parsers    │
 │  RasiPalanRepository.refresh()          │            │    computePanchangam() (sunrise)│
 │    skip if cache fresh (<3 h, same day) │  ◄───────  │    buildPayload() + fallbacks   │
 │    Ktor GET → validate → DataStore.edit │    JSON    │                                 │
 │            │                            │            └─────────────────────────────────┘
 │            ▼                            │
 │  WidgetUpdater.redrawAll()              │
 │            │                            │
 │            ▼                            │
 │  RasiPalanWidget.provideGlance()        │
 │    reads DataStore ONLY → WidgetLayout  │
 └─────────────────────────────────────────┘
```

**Why it uses almost no battery**

- The widget UI never touches the network. Redraws, resizes and theme changes
  only read the local Preferences DataStore.
- Periodic refreshes rely on `updatePeriodMillis` (4 h). Android never wakes a
  sleeping device for these, and the app sets no alarms, wakelocks or
  foreground services.
- A periodic tick skips the network entirely when the cache already holds a
  non-fallback reading for the selected rasi, from today (IST), that is less
  than 3 hours old.
- Only explicit taps force a network fetch.

## API contract

`GET /api/rasipalan?rasi=<key>[&date=YYYY-MM-DD][&lang=ta|en][&lat=<deg>&lon=<deg>[&tz=<IANA>]]`

`rasi` accepts English spellings (`Mesham`, `rishabham`), Western signs
(`aries`) or Tamil (`மேஷம்`). An invalid value returns HTTP 400 with the
list of supported keys.

- `lat` + `lon` (both, |lat| ≤ 66.5) and `tz` (IANA name such as
  `America/New_York`, DST-aware; default `Asia/Kolkata`) choose the place and
  clock. Without usable coordinates the Chennai reference location
  (13.0827, 80.2707, Asia/Kolkata) is used as a pair, never mixed with a
  given value, and reported in `location`:
  `{ "name": "Chennai", "lat": 13.0827, "lon": 80.2707, "timezone": "Asia/Kolkata", "isFallback": true, "reason": "missing_coordinates" }`.
  `reason` is `missing_coordinates`, `unresolved_place` (a free-text
  `location=` such as "India"; places are not geocoded),
  `invalid_coordinates`, `incomplete_coordinates` or, with valid
  coordinates, `invalid_timezone` (IST used). The top-level `isFallback`
  still means "no newspaper text".
- `date` (calendar day at the place, 1900–2100; default today there). Other dates get the
  computed Panchangam and generated reading; newspaper text only if that day
  was saved in the Supabase store (`isToday: false`, `isFallback: true`
  otherwise). Past days are never re-scraped.
- `lang=en` returns everything computed in English: the generated reading,
  Panchangam names ("Anusham until 11:38 AM, then Kettai"), `rasiName`,
  `weekday`, fallback text, and Nalla Neram's time-of-day words. Newspaper
  `prediction` text is always Tamil. Default `ta`.

```json
{
  "rasi": "rishabam",
  "rasiTamil": "ரிஷபம்",
  "rasiEnglish": "Taurus",
  "date": "2026-11-11",
  "weekdayTamil": "புதன்",
  "prediction": "வேலையில் புதிய பொறுப்புகள் கிடைக்கும். கவனம் தேவை.",
  "nallaNeram": "காலை 9.15 - 10.15, மாலை 4.45 - 5.45",
  "rahuKalam": "11:53 AM – 1:20 PM",
  "yamagandam": "7:33 – 9:00 AM",
  "kuligai": "10:26 – 11:53 AM",
  "sunrise": "6:06 AM",
  "sunset": "5:40 PM",
  "isFallback": false,
  "source": "example.com",
  "generatedAt": "2026-11-10T21:05:28.502Z"
}
```

Every field above is always present. If scraping fails, `prediction` holds localised
Tamil fallback text and `isFallback` is `true`, so the widget shows a small
"temporary data" note. The client never receives an HTTP error just because
a site changed its layout.

The response also carries computed data (older clients ignore these keys):

```json
{
  "panchangam": {
    "tamilDate": "பராபவ ஆண்டு ஐப்பசி 25",
    "tamilYear": "பராபவ", "tamilMonth": "ஐப்பசி", "tamilDay": 25,
    "paksha": "வளர்பிறை",
    "tithi": "துவிதியை 3:53 PM வரை, பின்பு திருதியை",
    "nakshatra": "அனுஷம் 11:38 AM வரை, பின்பு கேட்டை",
    "yogam": "அதிகண்டம் நாளை 3:40 AM வரை, பின்பு சுகர்மம்",
    "karanam": "கௌலவம் 3:53 PM வரை, பின்பு தைதுலம் நாளை 4:59 AM வரை, பின்பு கரசை",
    "chandraRasi": "விருச்சிகம்",
    "chandrashtamam": "மேஷம்",
    "chandrashtamamStars": "அசுவினி, பரணி",
    "method": "drik-lahiri"
  },
  "generated": {
    "prediction": "இன்று சந்திராஷ்டமம். புதிய முயற்சிகளையும் …",
    "summary": "சந்திராஷ்டமம்",
    "house": 8, "score": -2, "tone": "எச்சரிக்கை",
    "isChandrashtamam": true,
    "method": "chandra-gochara"
  },
  "diffScore": 0.07,
  "diff": {
    "score": 0.07, "level": "agree", "confidence": "high",
    "generatedTone": -1, "scrapedTone": -0.86,
    "scrapedCues": { "positive": 0, "negative": 6 },
    "chandrashtamam": { "generated": true, "scraped": true }
  }
}
```

| Field | Where it comes from |
|---|---|
| `prediction` | Scraped. Three HTML strategies (inline `<strong>`, heading + siblings — including a bare `<p>மீனம்</p>` used as a heading — and `"<rasi> ராசி:"` paragraphs) plus RSS. Tamil names are matched on word edges, so `கன்னியாகுமரி` does not match `கன்னி`. Zero-width characters some CMSes insert inside Tamil words are deleted. |
| `nallaNeram`, `nallaNeramSource` | Best source first: `newspaper` — the scraped line, for places in Tamil Nadu, and only from papers in `NALLA_NERAM_HOSTS` (default `dailythanthi.com`, which prints the same table as the Maha Calendar; hindutamil.in follows a different tradition and is ignored for Nalla Neram — the scraper keeps reading sources until a trusted line is found); `weekday-table` — the fixed weekday table printed by Tamil daily calendars (IST; checked against a month of Daily Thanthi and the Maha Calendar sheets): Sun 7.45–8.45 & 3.15–4.15, Mon 6.15–7.15 & 4.45–5.45, Tue 7.45–8.45 & 4.45–5.45, Wed 9.15–10.15 & 4.45–5.45, Thu 10.45–11.45 & 12.15–1.15, Fri 9.15–10.15 & 4.45–5.45, Sat 7.45–8.45 & 4.45–5.45; `gowri` — outside IST, the good daytime Gowri slots minus Rahu Kalam, Yamagandam and Kuligai. |
| `gowri` | Gowri Panchangam ([lib/nallaNeram.js](backend/lib/nallaNeram.js)): sunrise→sunset and sunset→next sunrise each split into 8 equal slots, named by weekday (drikpanchang's tables): `[{ key, name, good, part: "day"\|"night", start, end, time }]` (16 entries). Amirdha, Dhanam, Uthi, Laabam and Sugam are good. Saturday night is published with Soram twice (and no Rogam); this is reproduced as published. |
| `rahuKalam`, `yamagandam`, `kuligai` | Always calculated from real sunrise and sunset for the place (default Chennai). They don't depend on the scraper at all. Newspapers print fixed 6 AM-sunrise tables, so theirs can differ by a few minutes. |
| `panchangam` | Calculated ([lib/panchangam.js](backend/lib/panchangam.js)): Sun and Moon apparent positions from `astronomy-engine`, true Lahiri ayanamsa (IAU 2006 precession + nutation; 23°15′00.658″ at 1956-03-21), values at sunrise with change times until the next sunrise. Sunrise/sunset by rigorous search (upper limb, standard refraction; [lib/time.js](backend/lib/time.js)). Matches drikpanchang.com to the minute. Printed calendars using the Vakya system (e.g. Daily Thanthi, Maha Calendar) can differ by up to about an hour for nakshatram. The Tamil month follows the sunset rule, so Thai 1 / Chithirai 1 land on Pongal / Tamil New Year. |
| `generated` | Original text ([lib/rasiPalanGenerator.js](backend/lib/rasiPalanGenerator.js)), based on Chandra Gochara: the house the Moon occupies counted from the rasi. Houses 1, 3, 6, 7, 10, 11 are favourable; 8 is சந்திராஷ்டமம். If the Moon changes rasi in the day, the reading follows the Moon that holds most of the Panchangam day (sunrise to next sunrise — a change before about 6 PM means the new sign rules), and mentions the earlier part ("2:19 PM வரை நிலைமை சாதகமாக இருக்கும்"). The day's Panchangam refines it ([lib/rasiFactors.js](backend/lib/rasiFactors.js)), each factor averaged over the part of the day it holds: **40%** Gochara, **30%** Tara Bala (the day's star counted from each of the rasi's stars, weighted by padas), **15%** tithi (Nanda … Purna; Prathamai, Ashtami, Rikta, Amavasai adverse) and yoga (Vishkambha, Atiganda, Soolam, Gandam, Vyaghatham, Vajram, Vyatheepatham, Parigam, Vaidhruthi adverse), **10%** the weekday lord's natural friendship with the rasi lord, **5%** karana (Vishti/Bhadrai and the fixed karanas adverse). `score` is the composite (+2 from +0.4, -2 from -0.25; never 0); Chandrashtamam forces -2 (or at most -1 when it holds an hour or more of the day). `summary` is the house's word unless the composite points the other way, in which case it is the tone word. The text opens with what is new today — one Panchangam sentence: a Vishti (Bhadrai) window when it holds 15% of the day or more, else Prathamai when it holds a quarter of the day, else the factor that shifted most since the previous day (`basis.factors.dominant`) — because the Moon's house stays the same for 2–3 days. Then comes the house reading: an opening sentence in one of four phrasings plus two life areas (work, money, family, health) that rotate so consecutive days never cover the same two, and last the Tara Bala sentence. Chandrashtamam days keep the house reading first. The headline likewise starts with the day's factor, worded by its level today ("தசமி சாதகம்; பண வரவு உண்டு"), when no Moon change or Chandrashtamam is in it. `stars` gives each of the rasi's stars its padas, its Tara for the day (`note`: "Janma Tara — mixed; Sampat Tara (favourable) from 11:29 PM"), `advice` for that Tara, and its own `score` / `tone` (the composite with that star's Tara Bala); the app shows them as a star-by-star card. No third-party text, so no copyright issue. Transits of the other planets are not used, so it will not match newspaper or calendar astrologers day by day; e.g. the Maha Calendar's one-word palan does not follow any Moon-house rule (on 12 Nov 2026 Mesham, in chandrashtamam, is "அன்பு"). When there is no newspaper text, today's `prediction` is this reading (with `isFallback: true`) rather than a fixed placeholder. |
| `diffScore`, `diff` | [lib/compare.js](backend/lib/compare.js). `null` when there is no scraped prediction. `score` is 0 (same message) to 1 (opposite messages): half the gap between the generated tone (`score / 2`) and the scraped tone (Tamil favourable / cautionary word stems), plus 0.3 if the two disagree about சந்திராஷ்டமம். `level`: `agree` < 0.3 ≤ `partial` < 0.55 ≤ `disagree`. `confidence` is `low` when the scraped text has fewer than 2 tone words. |

**Choosing which prediction to show:** the widget and the reading screen do this in
[PredictionChooser.kt](android/app/src/main/java/com/kaalam/rasipalan/data/PredictionChooser.kt):

| Situation | Shown | Headline |
|---|---|---|
| No newspaper text yet (`isFallback`, e.g. before ~6 AM IST) | `generated.prediction` | `generated.headline` |
| Newspaper text and the two readings agree (`diff.level` = `agree`) | `generated.prediction` (in the app's language) | `generated.headline` |
| Newspaper text and the readings do not agree (`partial` or `disagree`, any confidence), app in Tamil | scraped `prediction` | its first sentence |
| App in English (newspaper text is Tamil only) | `generated.prediction` in English, whatever the newspaper says | `generated.headline` |
| Older backend with no `generated` field | scraped `prediction`, or the fallback placeholder | — |

While no newspaper text is available the widget keeps re-checking on its
periodic updates, so a disagreeing newspaper reading replaces the computed one
once it is published.

`GET /api/panchangam[?date=YYYY-MM-DD&lat=<deg>&lon=<deg>&tz=<IANA>]` returns the
computed Panchangam plus Rahu Kalam, Yamagandam, Kuligai, Abhijit, Nalla
Neram, Gowri and `location` for any
date (default today), and a `rasiPalan` array with the generated reading for
all 12 rasis. It also includes the scraped text and `diffScore` when that day
is in the memory cache or the Supabase store; it never triggers a scrape itself.
`calendar` carries the daily-calendar extras ([lib/calendar.js](backend/lib/calendar.js)):
`{ dayOfYear: 316, daysLeft: 49, soolam: { direction: "தெற்கு", remedy: "தைலம்" }, lagna: { name: "துலாம்", until: "6:29 AM", text: "துலாம் லக்னம் 6:29 AM வரை" }, ayanam: "தட்சிணாயனம்", ruthu: "சரத் ருது", lunarMonth: "கார்த்திகை", planets: [{ key: "saturn", name: "சனி", rasiIndex: 11, degree: 14.4, retrograde: true }, …] }`
— soolam/parigaram from the weekday table; the sidereal ascendant at sunrise with the time it changes sign;
ayanam and ruthu from the Sun's rasi; the Amanta lunar month (named by the Sun's rasi at the last new moon; adhika months
are not marked); and the nine grahas at sunrise (Lahiri, mean Rahu/Ketu) — on 12 Nov 2026 these match the Maha
Calendar sheet's chart.

`POST /api/cron/scrape` (header `x-cron-secret: <CRON_SECRET>`) scrapes today
and saves the result to the Supabase store. It returns 404 unless
`CRON_SECRET` is set.

Fields used by the app's "now / next" design (all computed):

| Field | Example |
|---|---|
| `timeline` | `{ sunrise: 366, sunset: 1060, periods: [{ type: "rahuKalam", start: 800, end: 887, source: "computed" }, …] }` — minutes after local midnight. `type` is `rahuKalam`, `yamagandam`, `kuligai` or `nallaNeram` (`source` = `newspaper`, `weekday-table` or `gowri`, as for `nallaNeramSource`) |
| `generated.headline` | "மனதில் உற்சாகம்; மதியத்தில் சற்று கவனம்" |
| `generated.chandrashtamam` | `{ state: "until", time: "2:19 PM", text: "2:19 PM வரை உங்களுக்கு சந்திராஷ்டமம்" }` (`none` / `allDay` / `until` / `from`) |
| `moonChange` | `{ time: "2:19 PM", toRasi: "தனுசு", text: "சந்திரன் தனுசு ராசிக்கு மாறுகிறார்" }` or null |
| `panchangam.spans` | `{ nakshatra: [{ name: "கேட்டை", until: "2:19 PM" }, { name: "மூலம்", until: null }], … }` |

`GET /api/birth-rasi?date=YYYY-MM-DD&time=HH:MM[&tz=<IANA>|&tzOffset=<min>][&lang=en]`
returns the janma rasi, nakshatra and pada for a birth time (IST by default),
and `nearRasiEdge: true` when the Moon was within 1° of a rasi boundary.

### Third-party readings: daily calendar words and newspaper archive

`/api/rasipalan` carries a `sources` block, read from the archive tables
`rasipalan_archive_day` / `rasipalan_archive` (and today's live scrape), plus
what the computed reading is based on:

```json
"sources": {
  "sheet":  { "word": "எதிர்ப்பு", "english": "Opposition", "confidence": 0.95 },
  "papers": [{ "source": "dailythanthi", "credit": "Daily Thanthi (dailythanthi.com)",
               "url": "https://www.dailythanthi.com/astrology/today-rasi-palan/…",
               "excerpt": "இன்று மறைந்திருந்த சில உண்மைகள் உங்களுக்குத் தெளிவாகப் புரியக்கூடும்." }]
},
"generated": { …, "basis": { "moon": [ { "rasi": "விருச்சிகம்", "rasiIndex": 7, "house": 1, "until": "2:19 PM" },
                                      { "rasi": "தனுசு", "rasiIndex": 8, "house": 2, "until": null } ],
                             "ruling": 1,
                             "factors": { "weights": { "gochara": 0.4, "tara": 0.3, "tithiYoga": 0.15, "weekday": 0.1, "karana": 0.05 },
                                          "values": { "gochara": -0.2, "tara": 0.25, … }, "contributions": { … },
                                          "total": 0.05, "score": 1,
                                          "dominant": { "factor": "weekday", "change": 0.1, "direction": 1 },
                                          "previous": { "values": { … }, "total": … },
                                          "tara": { "dayStar": "மூலம்", "stars": [ … ] },
                                          "tithi": { … }, "yoga": { … }, "weekday": { … }, "karana": { … } } },
               "stars": [ { "nakshatra": "விசாகம்", "padas": [4], "taraName": "சம்பத்து", "rating": "good",
                            "note": "சம்பத் தாரை — சாதகம்", "changes": [] }, … ] },
"gochara": [ { "house": 1, "summary": "நலம்", "score": 1 }, …12 rows ]
```

- **The day's one word** is the daily calendar's (`sources.sheet.word`, with
  `english` from [lib/mahaWordsEn.js](backend/lib/mahaWordsEn.js)); the
  computed `generated.summary` is the fallback (no sheet word, or no English
  for it). Sheet words are used only from sheets read completely (`status = ok`).
- Newspapers: Daily Thanthi before Hindu Tamil. `prediction`, `source`,
  `sourceUrl` and `isFallback` follow the first newspaper. Newspaper text is a
  **credited first-sentence excerpt with a link** (public app); the full text
  stays server-side (it is still used for `diffScore`).
  `THIRD_PARTY_FULL_TEXT=1` restores full text for a personal build.
- `generated.basis` and `gochara` explain the computed reading: the Moon's
  sign(s) during the day with each one's house from the rasi, which one decided
  (`ruling`, the sign holding most of sunrise → next sunrise), and the
  Chandra Gochara rule table. `generated.basis.factors` breaks down the
  composite score (each factor's value from -1 to +1, its weighted
  contribution, the previous day's values and the dominant shift), and
  `generated.stars` gives the Tara Bala for each of the rasi's stars.
- `/api/panchangam` adds `sheet: { words: { mesham: …, … }, english: { … } }`
  and `sheetWord` / `scraped` (excerpt object) per rasi.
- The morning cron archives every configured paper each day, and keeps
  scraping until each paper's day is complete.

**Backfill scripts** (run locally, on demand; they write to Supabase over the
session pooler using `SUPABASE_DB_PASSWORD` from `backend/.env`; files and
images go to the git-ignored `backend/.cache/`, which is kept):

| Script | What it does |
|---|---|
| `node scripts/backfill-thanthi.js [--dry-run] [--from] [--to] [--force] [--search]` | Daily Thanthi's archive API (`/api/v1/collections/astrology`, allowed by robots.txt), 1 request/s. Archive reaches back to May 2024. Days with all 12 rasis are `ok`, others `review` (often the paper itself left a rasi out). |
| `node scripts/maha-download.js [--from 2005-01-01] [--to 2027-12-31] [--gap 1500] [--reverse]` | Daily calendar sheet images (`/<year>/<D><MM><YYYY>.jpg`, day not zero-padded), one every 1.5 s, resumable. 404s go to `.cache/maha/missing.json`. |
| `node scripts/maha-ocr.js --pilot [--count 32]` | Trial: reads sample sheets with Tesseract and Replicate, writes `.cache/maha-pilot.json` and contact sheets for checking by eye. No DB writes. |
| `node scripts/maha-ocr.js [--budget …] [--concurrency 8] [--from] [--to] [--oldest] [--retry-review] [--reread-ok-before <ISO>]` | Newest day first. Gemini 2.5 Flash on Replicate (`REPLICATE_API_TOKEN` in `.env`) reads the whole sheet (the rasi box moves between layouts) and returns rasi → word pairs (`max_output_tokens` must be large: with 400, Replicate cut replies after ~16 tokens). Small old scans are enlarged first (no extra cost). Tesseract (Tamil, tessdata_best in `.cache/tessdata`) cross-checks: agreeing words get confidence 0.95, others 0.85. A day where Replicate fails outright is left for the next run. `--reread-ok-before` re-reads days saved before a time and replaces them only with a clean read. `--concurrency` > 1 needs ≥ $5 Replicate credit and `REPLICATE_GAP_MS=0`; on the first "less than $5" throttle it drops to 6 a minute by itself. Stops when the summed `cost_usd` reaches `--budget`. |
| `node scripts/maha-vocabulary.js --fix [--dry-run]` | Spelling cleanup: rare words that differ from a common word only by a pulli or a doubled consonant ("ஆதாயம" → "ஆதாயம்", "எதிர்பு" → "எதிர்ப்பு"). Vowel signs and letters are never changed (நாசம் ≠ நேசம், குறைவு ≠ நிறைவு). |
| `node scripts/maha-vocabulary.js --translate` | English for every word without one (Gemini, text only), merged into `lib/mahaWordsEn.js`; hand edits are kept. Redeploy the function afterwards. |

Result (2005–2027, 8,400 days): 8,387 read completely, 10 left for review,
3 missing (31 Dec 2006 is not on the site; 7 Feb and 20 Sep 2007 are broken
images there). Words were checked by eye on samples: about 90% exact on
recent sheets, a little lower on the small 2005–2010 scans. About $0.0003 per
sheet; Replicate allows 6 predictions a minute while the account holds under $5.

## Running the backend

```bash
cd backend
npm install
npm test                                   # 49 offline tests
RASIPALAN_SOURCES="https://www.hindutamil.in/api/v1/collections/astrology.rss,https://www.dailythanthi.com/api/v1/collections/astrology.rss" npm start
curl "http://localhost:3000/api/rasipalan?rasi=mesham"
```

`RASIPALAN_SOURCES` is a comma-separated list of HTML pages or RSS feeds,
tried in order. **Only use sources whose terms allow automated access.** Each
source is fetched at most once every 3 hours (15 minutes after a failure),
and a CDN `Cache-Control` header is set on every response. If no sources are
configured, the API still works and serves the fallback text plus calculated
timings.

The two feeds above were checked in November 2026: each publishes one daily
item with all 12 rasis (Hindu Tamil Thisai at about 5:45 AM IST, Daily
Thanthi at about 6:40 AM IST). The content is the publishers' copyrighted
text — fine for personal use, but license it before publishing the app.

For RSS/Atom sources, only items dated today (IST) are used, and weekly,
monthly, yearly and peyarchi articles in the same feed are skipped. Before
the day's article is out (or if a site skips a day) the API serves the
fallback text rather than yesterday's reading.

## Hosting the backend

The same code runs on Node (local, Vercel) and Deno (Supabase Edge
Functions). Supabase is the recommended host: a Postgres table keeps one
scrape per day for every instance, and `pg_cron` fetches it each morning.

### Supabase (recommended)

```bash
cd backend
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --remote                         # table daily_scrape + pg_cron job (CLI 3.x defaults to a local DB)
npx supabase secrets set \
  RASIPALAN_SOURCES="https://www.hindutamil.in/api/v1/collections/astrology.rss,https://www.dailythanthi.com/api/v1/collections/astrology.rss" \
  CRON_SECRET="<long random string>"
npx supabase functions deploy kaalam                  # verify_jwt = false is set in config.toml
```

On Windows PowerShell use `npx.cmd` instead of `npx` if script execution is
disabled. The function bundles `../../../index.js` and `lib/` from outside
`supabase/functions`; the CLI uploads them automatically (no Docker needed).

Then, once, in the dashboard SQL editor or with `npx supabase db query --remote` (the cron job reads these from Vault):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/kaalam', 'kaalam_function_url');
select vault.create_secret('<same CRON_SECRET>', 'kaalam_cron_secret');
```

The API is then at `https://<project-ref>.supabase.co/functions/v1/kaalam`
(e.g. `…/kaalam/api/rasipalan?rasi=mesham`). `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are provided to the function automatically. If
your project only has the newer `sb_secret_…` keys, set one as the
`KAALAM_SUPABASE_KEY` secret instead.

`daily_scrape` has row-level security on and no policies, so the scraped text
is never readable through the public API keys. The cron job runs every 30
minutes from 5:30 to 10:00 AM IST and stops scraping once all 12 rasis are
stored. Check it with `select * from cron.job_run_details order by start_time desc limit 5;`.

To try the function locally without Docker: `npm run serve:deno` (needs
[Deno](https://deno.com)), then `curl "http://localhost:8000/kaalam/api/rasipalan?rasi=mesham"`.

### Vercel (optional, not currently deployed)

`cd backend && npx vercel`, then set `RASIPALAN_SOURCES` in the project's
environment variables. Optionally also set `SUPABASE_URL` and
`KAALAM_SUPABASE_KEY` to share the Supabase daily cache. The free Hobby plan
is for non-commercial use only.

## Building the Android app

1. Open `android/` in Android Studio with JDK 17. The project uses AGP 8.13
   with Gradle 8.13 (wrapper included) and targets API 36, as Google Play
   requires for new apps and updates from 31 August 2026. From the command
   line: `./gradlew testDebugUnitTest assembleDebug`. Signed release builds come
   from the Release workflow (see [Automated builds and deployment](#automated-builds-and-deployment)).
2. Set the API URL in `android/gradle.properties` (currently the deployed Supabase function):
   - Supabase: `kaalam.apiBaseUrl=https://<project-ref>.supabase.co/functions/v1/kaalam`
   - Vercel: `kaalam.apiBaseUrl=https://your-project.vercel.app`
   - Emulator + local backend: `kaalam.apiBaseUrl=http://10.0.2.2:3000`

   A physical phone needs one of the HTTPS URLs: plain HTTP is only allowed
   for the emulator's `10.0.2.2` and `localhost`.
3. Run the app. On first launch pick your rasi (search by rasi or nakshatra,
   or find it from your birth date and time); after that the app opens
   straight to today's reading for your rasi.

**Using the app**

| Where | What |
|---|---|
| Rasi name **▾** (header) | Back to the picker; the new rasi becomes "my rasi" for the widget |
| **நேற்று / இன்று / நாளை** | Yesterday / today / tomorrow; tap the date under the rasi name for a calendar |
| Widget icon (header) | Asks the launcher to place the widget (hidden once one is placed) |
| 📅 Calendar icon (header), or **தினசரி காலண்டர் காண்க** below the Panchangam | Daily calendar sheet, a modern take on the Tamil tear-off calendar (Maha / Daily Thanthi layout): a spiral-bound pad with the big coloured date (12 ■ 11 ■ 2026); the ayanam / ruthu / Tamil month / lunar month line; boxes for the Tamil year, month and day, the month-weekday, and the lunar month with paksha and day count (316 / 049); tithi / nakshatram / yogam / karanam with end times; a timings table with morning and evening rows (Nalla Neram, Gowri Nalla Neram, Rahu, Kuligai, Yamagandam start/end); soolam and parigaram, lagnam at sunrise, chandrashtamam with its stars; sunrise and sunset; the nine grahas at sunrise in a South Indian chart (the Moon's rasi tinted, yours outlined); the one-word rasi palan for all 12 rasis (yours starred; tap one for its full reading that day) and your rasi's headline in a yellow strip; then the full Gowri Panchangam. ‹ › or swipe sideways to tear the page off (neighbouring days are prefetched); tap the date for a date picker |
| "இப்போது" card | What is on now (Rahu Kalam, Kuligai, normal time…), until when, minutes left, a sunrise→sunset bar, and the next Nalla Neram |
| **கோசாரக் கணிப்பு / செய்தித்தாள்** | Switch between the generated reading and the newspaper's (available after ~6 AM). The chip beside "Today's reading" is the day's one word: the daily calendar's word (in English when English is chosen), or the computed summary when there is none. The headline describes the text shown |
| **ⓘ இந்தக் கணிப்பு எப்படி செய்யப்படுகிறது? / How is this worked out?** (under the Moon-transit reading) | A rasi chart with every sign numbered as a house from your rasi (★ = 1) and the Moon (☾) in its sign; the Moon's sign(s) today with times and which one decided the reading; the 12-house Chandra Gochara table with today's house highlighted; and a note on the method and its limits |
| 🔒 **Today's summary on the lock screen** (bottom) | A silent, ongoing notification readable on the lock screen: rasi · day's word, "now / next" (e.g. Rahu Kalam until 2:46 PM · Next: Nalla Neram 4:45 PM), headline and chandrashtamam. On by default (asks for notification permission once); updated with the widget's ticks (every 5 minutes in the day, delivered when the phone wakes) and the 00:10 daily refresh, even with no widget placed. Phones cannot show app widgets on the lock screen, so this is the lock-screen view. The phone's lock-screen notification setting must allow it |
| 🔔 on a timing | Daily reminder 5 minutes before that period (asks for notification permission once) |
| Pull down | Refresh |
| **தமிழ் / English** (bottom) | App and widget language. The newspaper's text stays Tamil |
| First visit to the picker, today screen and calendar sheet | A short guided tour ([ui/tour/](android/app/src/main/java/com/kaalam/rasipalan/ui/tour/)): the screen dims (~75%), each key control is spotlit in turn, and a card beside it (above or below, whichever fits) explains it with "2 / 5" progress and தவிர் / முந்தைய / அடுத்து (Skip / Back / Next / Done). Taps outside the card are blocked, Back steps back, the step survives rotation, and TalkBack reads only the card. Steps whose control is not on screen (e.g. the add-widget button once a widget is placed, the bells after the day's periods are over) are left out. Finishing or skipping stores the tour's version per screen in DataStore (`TourScreen` in [data/TourPrefs.kt](android/app/src/main/java/com/kaalam/rasipalan/data/TourPrefs.kt)); raise a screen's version to show its tour again after a major change. Texts are in [data/TourStrings.kt](android/app/src/main/java/com/kaalam/rasipalan/data/TourStrings.kt) |
| **ⓘ செயலி அறிமுகத்தை மீண்டும் காண்க / Take the app tour again** (bottom of the today screen) | Replays the today-screen tour now; the picker and calendar tours show again on their next visit |

**Widget sizes** (resize to switch): 2×2 shows now / until / next Nalla Neram
and turns red during Rahu Kalam; 4×2 adds the headline; 4×4 adds the
reading, the timeline bar, now / next cells and chandrashtamam. Tapping
anywhere opens the app; the saved rasi never changes from the widget.

The widget header always shows the date the reading is for. Besides the
system's 4-hourly widget update, a WorkManager job (`DailyRefresh`) refreshes
at 00:10 IST (new day) and 07:00 IST (after the newspapers publish), so the
widget follows the calendar day. "Now" is redrawn by a non-wakeup alarm
(`WidgetTicker`) at each period boundary and every 5 minutes in daytime —
delivered only while the phone is awake, so it costs nothing while asleep.

Permissions: `INTERNET`; `POST_NOTIFICATIONS` (asked when you first tap a
bell), `SCHEDULE_EXACT_ALARM` (on-time reminders; falls back to inexact
alarms when not granted) and `RECEIVE_BOOT_COMPLETED` (restore reminders
after a restart).

## Automated builds and deployment

GitHub Actions, set up like Tuitly's:

| Workflow | Runs on | Does |
|---|---|---|
| [CI](.github/workflows/ci.yml) | every push to `main` and every pull request | Backend tests; Android unit tests and a debug APK (downloadable under the run's **Artifacts**); a release bundle and APK signed with a throwaway key, so release signing and R8 are known to work |
| [Deploy backend](.github/workflows/deploy-backend.yml) | pushes to `main` that change `backend/`, or by hand | Backend tests, then `supabase db push` (new migrations only), then deploys the `kaalam` Edge Function and checks `/health` answers |
| [Release](.github/workflows/release.yml) | a version tag (`git tag v1.0.0; git push origin v1.0.0`), or by hand | Tests, then a signed `.aab` and `.apk` (artifact `kaalam-<version>-<run number>`); uploads the bundle to the Play internal track when the Play key is set |

The run number becomes the `versionCode` and the tag the `versionName`
([app/build.gradle.kts](android/app/build.gradle.kts) reads them, and the
signing key, from environment variables; local builds stay unsigned 1 / 1.0.0).

**One-time setup** (in your own PowerShell window, from the repo folder). The
scripts need the GitHub CLI (`winget install GitHub.cli`) signed in with the
account that owns this repo (`gh auth login`, or `gh auth switch`); they always
target `gokulsadanandam/kaalam` and stop if the active account can't manage it.

| Script | Secrets it sets | Needed by |
|---|---|---|
| `scripts\set-deploy-secrets.ps1` | `SUPABASE_ACCESS_TOKEN` (create one at supabase.com/dashboard/account/tokens), `SUPABASE_DB_PASSWORD` (from `backend\.env`) | Deploy backend |
| `scripts\create-upload-key.ps1` | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` (key saved in Documents\kaalam-keys — back it up) | Release |
| `scripts\set-signing-secrets.ps1` | the same three, from an existing key | Release |
| `scripts\setup-play-upload.ps1` | `PLAY_SERVICE_ACCOUNT_JSON` (optional; needs `gcloud`, and the app created in Play Console with a first bundle uploaded by hand) | Release → Play |

Run them with `powershell -ExecutionPolicy Bypass -File scripts\<name>.ps1`.
Edge Function secrets (`CRON_SECRET`, …) stay in Supabase; deploys don't touch them.

## Website, privacy policy and Play Store listing

- **[site/](site/)**: the home page, privacy policy and 404 page, served by a
  Cloudflare Worker with static assets (same setup as Tuitly; config in
  [wrangler.jsonc](wrangler.jsonc)). `/privacy` serves `privacy.html`. Once
  connected, every push to `main` redeploys it.
  **One-time setup:** Cloudflare dashboard → **Workers & Pages → Create →
  Import a repository** → `gokulsadanandam/kaalam`; project name `kaalam`;
  production branch `main`; build command empty; deploy command
  `npx wrangler deploy`; optionally set **Build watch paths** to `site/*` and
  `wrangler.jsonc`. The site is then at
  `https://kaalam.gokulsadanandam.workers.dev` (privacy policy at `/privacy`).
- **[store/listing.md](store/listing.md)**: Play Console text (name, short and
  full description), store settings, every App content answer (content rating,
  target audience, Data safety, ads, trader status) and what to change before
  monetising.
- **[store/graphics/](store/graphics/)**: `icon-512.png`, `feature-graphic.png`
  (1024 × 500) and eight 1080 × 1920 phone screenshots, with the HTML/SVG
  sources in `store/graphics/src/`. If the privacy practices change (for example
  ads), update `site/privacy.html` and the Data safety form together.

## Design notes

- **The receiver overrides `onUpdate` without calling `super`.** Glance's
  default `onUpdate` calls `goAsync()` itself, and a broadcast can only go
  async once. The receiver takes that async window and uses it to paint from
  cache, refresh within an 8.5 s budget, repaint, and then `finish()`.
- **`WidgetUpdater.redrawAll` is used instead of `updateAll`.** `updateAll`
  finds widget IDs through Glance's internal registry, and that registry is
  only filled in by the default `onUpdate` (which we skip). Taking the IDs
  straight from `AppWidgetManager` behaves the same and is always correct.
- **`isRefreshing` is stored as a start timestamp.** If the process dies in
  the middle of a refresh, the "updating…" label clears itself after 60 s
  instead of sticking.
- **Rasi switching is race-safe.** A response is only written if the rasi
  it's for is still the one selected, so a slow fetch for the old rasi can't
  overwrite the new one.
