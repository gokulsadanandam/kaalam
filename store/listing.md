# Google Play store listing: Kaalam

Everything to paste into Play Console. Graphics are in [graphics/](graphics/).
Package: `com.kaalam.rasipalan`.

## Main store listing (English, en-IN)

**App name** (30 / 30)

```
Kaalam: Rasi Palan, Panchangam
```

**Short description** (80 / 80)

```
Daily Tamil Rasi Palan, Panchangam, Rahu Kalam & Nalla Neram on your home screen
```

**Full description** (about 1,700 / 4,000)

```
Kaalam (காலம்) brings the Tamil daily calendar to your phone and home screen, in Tamil or English.

DAILY RASI PALAN
• A reading for each of the 12 rasis, every day
• Worked out from the Moon's transit (Chandra Gochara) and the day's Panchangam: Tara Bala for each birth star, tithi, yoga, weekday lord and karana
• Chandrashtamam alerts with exact start and end times
• See how each reading is worked out, step by step
• Newspaper and daily-calendar readings shown alongside, with credit

PANCHANGAM
• Tithi, nakshatram, yogam and karanam with their end times
• Tamil date, sunrise and sunset, chandrashtamam stars
• Calculated astronomically with the Lahiri ayanamsa

GOOD AND BAD TIMES
• Rahu Kalam, Yamagandam, Kuligai and Nalla Neram
• Gowri Panchangam for day and night
• "Now / next" at a glance

WIDGET, LOCK SCREEN AND REMINDERS
• Home-screen widget with your rasi and the current period
• Optional lock-screen summary
• Optional reminders 5 minutes before Rahu Kalam, Nalla Neram and more

DAILY CALENDAR SHEET
• A modern take on the Tamil tear-off calendar, with the nine grahas at sunrise

Don't know your rasi? Find it from your birth date and time.

No sign-in, no ads, no tracking.

Readings are for general guidance and cultural interest only.
```

**Graphics**

| Asset | File | Play requirement |
| --- | --- | --- |
| App icon | `graphics/icon-512.png` | 512 × 512 PNG, up to 1 MB |
| Feature graphic | `graphics/feature-graphic.png` | 1024 × 500 PNG or JPEG |
| Phone screenshots | `graphics/screenshots/*.png` (upload in file-name order) | 2–8 images, 9:16 |

Leave the video and tablet screenshots empty.

Sources are in `graphics/src/`: `glyph.svg` (the mark, same as the app's
`ic_kaalam.xml`), `icon.html` and `feature-graphic.html`, rendered with headless
Chrome. Screenshots come from the debug build on an Android 16 emulator
(1080 × 1920, 420 dpi) against the production API.

## Store settings

- **App category:** Lifestyle. Tags: Astrology, Calendar.
- **Contact email:** gokulst1995@gmail.com
- **Website:** https://kaalam.gokulsadanandam.workers.dev/
- **Privacy policy:** https://kaalam.gokulsadanandam.workers.dev/privacy

(The two URLs are live once the `site/` folder is hosted; see the README.)

## App content answers

| Section | Answer |
| --- | --- |
| Privacy policy | `https://kaalam.gokulsadanandam.workers.dev/privacy` |
| App access (sign-in details) | All functionality is available without special access |
| Ads | No, my app does not contain ads |
| Content rating | Category **All other app types**; answer **No** to every question (violence, sexuality, language, controlled substances, crude humour, gambling, user interaction / user-generated content, sharing location, digital purchases). Expected: Everyone / PEGI 3 |
| Target audience | **18 and over** (or 13+). Don't select under-13 groups. Appeals to children: **No** |
| Data safety | See below |
| Government apps | No |
| Financial features | My app doesn't provide any financial features |
| Health | My app does not have any health features |
| Trader status | **Not a trader** while the app is free with no ads or purchases. Switch to trader before monetising (your name, address, phone and email become public in the EU) |

### Data safety

- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes**
- Do you provide a way for users to request that their data is deleted? **No**
  (nothing is stored; the policy says so)
- Data types: **Personal info → Other info** (birth date and time, "Find my rasi")
  - Collected: **Yes**. Shared: **No**.
  - Processed ephemerally: **Yes**.
  - Required or optional: **Optional** (users can choose).
  - Purpose: **App functionality**.
- Every other data type: not collected. The rasi, language and date sent to fetch
  a reading aren't linked to a user and aren't personal data.

## Release notes (first release)

```
<en-IN>
First release: daily Rasi Palan, Panchangam, Rahu Kalam and Nalla Neram, with a home-screen widget and reminders.
</en-IN>
```

## If you monetise later

Every section above can be edited after release; changes to App content go
through review again. Before shipping a monetised version:

- **Ads (e.g. AdMob):** set Ads to **Yes**; in Data safety add Device or other IDs
  (advertising ID), App interactions, Diagnostics and approximate location as
  collected and **shared** for Advertising; add `AD_ID` to the manifest; update
  the privacy policy; check Target audience (ads to under-13s need Families-certified
  ad SDKs); get user consent where required.
- **In-app purchases or subscriptions:** Play Billing; Data safety adds Purchase
  history; set up a Payments profile; content rating question on digital purchases
  becomes **Yes**.
- **Trader status:** change to **trader** (EU DSA) once you earn from the app.
- **Privacy policy:** update `site/privacy.html` (section 10 promises this) and
  push; the site redeploys itself.
