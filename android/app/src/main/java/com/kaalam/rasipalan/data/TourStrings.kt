package com.kaalam.rasipalan.data

/** One coachmark: a short title and a 1–2 sentence explanation. */
class TourText(val title: String, val body: String)

/** Text for the first-visit tours, in both languages (kept apart from [Strings] for readability). */
class TourStrings(
    val skip: String,
    val back: String,
    val next: String,
    val finish: String,
    /** "2 of 6" */
    val progress: (step: Int, total: Int) -> String,
    /** Footer link on the today screen that replays the tours. */
    val replay: String,
    // Rasi picker
    val pickerLanguage: TourText,
    val pickerSearch: TourText,
    val pickerGrid: TourText,
    val pickerBirth: TourText,
    val pickerContinue: TourText,
    // Today's reading
    val readingRasi: TourText,
    val readingDays: TourText,
    val readingCalendar: TourText,
    val readingWidget: TourText,
    val readingNow: TourText,
    val readingTabs: TourText,
    val readingBells: TourText,
    // Daily calendar sheet
    val calendarPages: TourText,
    val calendarTimings: TourText,
    val calendarRasiPalan: TourText,
    val calendarMyRasi: TourText,
    val calendarGowri: TourText,
)

private val TAMIL_TOUR = TourStrings(
    skip = "தவிர்",
    back = "முந்தைய",
    next = "அடுத்து",
    finish = "முடிந்தது",
    progress = { step, total -> "$step / $total" },
    replay = "ⓘ  செயலி அறிமுகத்தை மீண்டும் காண்க",
    pickerLanguage = TourText(
        "தமிழ் அல்லது English",
        "செயலியையும் விட்ஜெட்டையும் எப்போது வேண்டுமானாலும் தமிழ் அல்லது ஆங்கிலத்துக்கு மாற்றலாம்.",
    ),
    pickerSearch = TourText(
        "தேடுங்கள்",
        "ராசி, நட்சத்திரம் அல்லது ஆங்கிலப் பெயரைத் தட்டச்சு செய்து விரைவாகக் கண்டறியுங்கள்.",
    ),
    pickerGrid = TourText(
        "உங்கள் ராசியைத் தேர்ந்தெடுங்கள்",
        "ஒவ்வொரு அட்டையிலும் அந்த ராசியின் நட்சத்திரங்களும் பாதங்களும் உள்ளன. உங்களுடையதைத் தட்டுங்கள்.",
    ),
    pickerBirth = TourText(
        "ராசி தெரியவில்லையா?",
        "பிறந்த தேதியும் நேரமும் கொடுத்தால், உங்கள் ராசியையும் நட்சத்திரத்தையும் காலம் கணித்துத் தரும்.",
    ),
    pickerContinue = TourText(
        "தொடரவும்",
        "ராசியைத் தேர்ந்தெடுத்ததும் இங்கே தட்டி இன்றைய பலனைப் பாருங்கள். பின்னர் எப்போது வேண்டுமானாலும் மாற்றலாம்.",
    ),
    readingRasi = TourText(
        "உங்கள் ராசி",
        "வேறு ராசிக்கு மாற, ராசியின் பெயரைத் தட்டுங்கள்.",
    ),
    readingDays = TourText(
        "நேற்று, இன்று, நாளை",
        "நாட்களுக்கு இடையே இங்கே மாறலாம். வேறு தேதிக்குச் செல்ல, மேலே உள்ள தேதியைத் தட்டுங்கள்.",
    ),
    readingCalendar = TourText(
        "தினசரி காலண்டர்",
        "அன்றைய முழு தமிழ் தினசரி காலண்டர் தாளை இங்கே திறக்கலாம்.",
    ),
    readingWidget = TourText(
        "முகப்புத் திரை விட்ஜெட்",
        "செயலியைத் திறக்காமலேயே இப்போதைய நேரத்தைக் காண, காலத்தை முகப்புத் திரையில் சேருங்கள்.",
    ),
    readingNow = TourText(
        "இப்போது",
        "இப்போது நடக்கும் நேரம் — ராகு காலம், நல்ல நேரம் போன்றவை — மீதமுள்ள நேரமும் அடுத்து வருவதும்.",
    ),
    readingTabs = TourText(
        "இரண்டு பலன்கள்",
        "கோசாரக் கணிப்புக்கும் செய்தித்தாள் பலனுக்கும் இடையே மாறலாம். கணக்கீட்டைக் காண “இந்தக் கணிப்பு எப்படி செய்யப்படுகிறது?” என்பதைத் தட்டுங்கள்.",
    ),
    readingBells = TourText(
        "நினைவூட்டல்கள்",
        "மணியைத் தட்டினால், அந்த நேரம் தொடங்கும் முன் தினமும் அறிவிப்பு வரும்.",
    ),
    calendarPages = TourText(
        "பக்கங்களைப் புரட்டுங்கள்",
        "‹ › தட்டியோ பக்கவாட்டில் தேய்த்தோ தாளைக் கிழிக்கலாம். வேறு நாளுக்குச் செல்ல தேதியைத் தட்டுங்கள்.",
    ),
    calendarTimings = TourText(
        "நேரங்கள்",
        "காலை, மாலைக்கான நல்ல நேரம், கௌரி நல்ல நேரம், ராகு காலம், குளிகை, எமகண்டம்.",
    ),
    calendarRasiPalan = TourText(
        "12 ராசிகளும்",
        "ஒவ்வொரு ராசிக்கும் அன்றைய ஒரு சொல் பலன். எந்த ராசியையும் தட்டி அதன் முழுப் பலனைப் பாருங்கள்.",
    ),
    calendarMyRasi = TourText(
        "இன்று உங்கள் ராசி",
        "இந்த நாளுக்கான உங்கள் ராசியின் சுருக்கம். முழுப் பலனுக்குத் தட்டுங்கள்.",
    ),
    calendarGowri = TourText(
        "கௌரி பஞ்சாங்கம்",
        "பகலும் இரவும் நல்ல, கெட்ட கௌரி நேரங்களாகப் பிரிக்கப்பட்டுள்ளன.",
    ),
)

private val ENGLISH_TOUR = TourStrings(
    skip = "Skip",
    back = "Back",
    next = "Next",
    finish = "Done",
    progress = { step, total -> "$step of $total" },
    replay = "ⓘ  Take the app tour again",
    pickerLanguage = TourText(
        "Tamil or English",
        "Switch the whole app, widget included, between Tamil and English at any time.",
    ),
    pickerSearch = TourText(
        "Search",
        "Type a rasi, a star or an English sign name to find it quickly.",
    ),
    pickerGrid = TourText(
        "Choose your rasi",
        "Each card lists the stars and padas in that rasi. Tap yours to select it.",
    ),
    pickerBirth = TourText(
        "Not sure of your rasi?",
        "Enter your birth date and time and Kaalam works out your rasi and star.",
    ),
    pickerContinue = TourText(
        "Continue",
        "Once your rasi is selected, tap here to see today's reading. You can change it later.",
    ),
    readingRasi = TourText(
        "Your rasi",
        "Tap the rasi name to switch to another rasi at any time.",
    ),
    readingDays = TourText(
        "Yesterday, today, tomorrow",
        "Jump between days here. Tap the date above to pick any other day.",
    ),
    readingCalendar = TourText(
        "Daily calendar",
        "Open the full Tamil tear-off calendar sheet for the day.",
    ),
    readingWidget = TourText(
        "Home-screen widget",
        "Add Kaalam to your home screen to see the current period without opening the app.",
    ),
    readingNow = TourText(
        "Right now",
        "The period you are in — Rahu Kalam, Nalla Neram and so on — with the time left and what comes next.",
    ),
    readingTabs = TourText(
        "Two readings",
        "Switch between the Moon-transit reading and the newspaper's. Tap “How is this worked out?” to see the calculation.",
    ),
    readingBells = TourText(
        "Reminders",
        "Tap a bell to get a notification before that period starts each day.",
    ),
    calendarPages = TourText(
        "Turn the pages",
        "Tap ‹ › or swipe sideways to tear off a page. Tap the date to jump to any day.",
    ),
    calendarTimings = TourText(
        "Timings",
        "Nalla Neram, Gowri Nalla Neram, Rahu Kalam, Kuligai and Yamagandam for the morning and evening.",
    ),
    calendarRasiPalan = TourText(
        "All 12 rasis",
        "The day's one-word reading for every rasi. Tap any rasi to open its full reading.",
    ),
    calendarMyRasi = TourText(
        "Your rasi today",
        "Your rasi's headline for this day. Tap it for the full reading.",
    ),
    calendarGowri = TourText(
        "Gowri Panchangam",
        "The day and night split into good and bad Gowri periods.",
    ),
)

fun tourStrings(language: AppLanguage): TourStrings = when (language) {
    AppLanguage.TAMIL -> TAMIL_TOUR
    AppLanguage.ENGLISH -> ENGLISH_TOUR
}
