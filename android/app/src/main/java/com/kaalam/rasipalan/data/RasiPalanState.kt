package com.kaalam.rasipalan.data

import java.time.LocalDate
import java.time.ZoneId

/**
 * Immutable snapshot of everything the widget draws.
 *
 * The widget UI renders *only* from this object, which is built from the
 * Preferences DataStore cache. Nothing in the UI layer touches the network,
 * so a recomposition or launcher redraw costs a local disk read at most.
 */
data class RasiPalanState(
    /** The rasi the user selected (what the header shows). */
    val rasi: Rasi,
    /** Display language chosen in the app; the cached reading is in this language. */
    val language: AppLanguage,
    /** Core daily prediction text in Tamil; blank when nothing is cached yet. */
    val prediction: String,
    /** "நல்ல நேரம்" — auspicious time window(s), e.g. "காலை 9.15 - 10.15". */
    val nallaNeram: String,
    /** "ராகு காலம்" — inauspicious window, e.g. "11:53 AM – 1:20 PM". */
    val rahuKalam: String,
    /** ISO date (IST) the reading belongs to, e.g. "2026-11-11". */
    val readingDate: String,
    /** Tamil weekday for the reading date, e.g. "புதன்". */
    val weekdayTamil: String,
    /** Wall-clock time of the last successful network refresh (epoch ms), 0 if never. */
    val lastUpdatedMillis: Long,
    /** True when the backend had no newspaper text (drives re-fetching, not the badge). */
    val isFallback: Boolean,
    /** Which reading [prediction] is: newspaper, generated, or the generic placeholder. */
    val origin: PredictionOrigin,
    /** True while a network refresh is in flight (drives the "updating…" label). */
    val isRefreshing: Boolean,
    /** Last refresh error, shown discreetly when there is no cached data at all. */
    val lastError: String?,
    /** One-line headline of the generated reading ("மனதில் உற்சாகம்; …"); blank in older caches. */
    val headline: String = "",
    /** "இன்று உங்களுக்கு சந்திராஷ்டமம் இல்லை" etc.; state is none, allDay, until or from. */
    val chandrashtamamText: String = "",
    val chandrashtamamState: String = "none",
    /** Tamil calendar day, e.g. "ஐப்பசி 26". */
    val tamilDay: String = "",
    /** The reading day's periods, for "now / next" and the timeline bar; null in older caches. */
    val timeline: DayTimeline? = null,
    /** Period types with daily reminders on. */
    val reminderTypes: Set<PeriodType> = emptySet(),
    /** The day's one-word reading: the daily calendar's word, else the computed summary; blank in older caches. */
    val dayWord: String = "",
    /** Show today's summary as a silent notification on the lock screen (a setting, not part of the cached reading). */
    val lockScreenSummary: Boolean = true,
) {
    val hasData: Boolean get() = prediction.isNotBlank()

    /** Reading is from a previous day (e.g. phone was offline overnight). */
    val isStale: Boolean
        get() = readingDate.isNotBlank() && readingDate != todayInIndia().toString()

    companion object {
        /** Panchangam days are defined in Indian Standard Time, not device time. */
        val INDIA_ZONE: ZoneId = ZoneId.of("Asia/Kolkata")

        fun todayInIndia(): LocalDate = LocalDate.now(INDIA_ZONE)

        /** State for a rasi with nothing cached yet (first launch / rasi or language just changed). */
        fun empty(
            rasi: Rasi,
            language: AppLanguage,
            isRefreshing: Boolean = false,
            lastError: String? = null,
            lockScreenSummary: Boolean = true,
        ) =
            RasiPalanState(
                rasi = rasi,
                language = language,
                prediction = "",
                nallaNeram = "—",
                rahuKalam = "—",
                readingDate = "",
                weekdayTamil = "",
                lastUpdatedMillis = 0L,
                isFallback = false,
                origin = PredictionOrigin.SCRAPED,
                isRefreshing = isRefreshing,
                lastError = lastError,
                lockScreenSummary = lockScreenSummary,
            )
    }
}
