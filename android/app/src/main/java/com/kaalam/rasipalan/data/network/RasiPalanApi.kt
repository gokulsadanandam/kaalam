package com.kaalam.rasipalan.data.network

import com.kaalam.rasipalan.BuildConfig
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.Rasi
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.LocalDate

/**
 * Wire format of `GET /api/rasipalan?rasi=<key>`.
 *
 * Field names mirror `buildPayload()` in the backend's index.js exactly.
 * Optional extras have defaults so older/newer backends stay compatible, and
 * `ignoreUnknownKeys` lets the server add fields without breaking clients.
 */
@Serializable
data class RasiPalanResponse(
    val rasi: String,
    val rasiTamil: String,
    val date: String,
    /** False when a date other than today (IST) was requested. */
    val isToday: Boolean = true,
    /** "ta" or "en": the language of everything computed (newspaper text is always Tamil). */
    val lang: String = "ta",
    val weekdayTamil: String = "",
    /** Scraped newspaper text, or the server's generic fallback when [isFallback]. */
    val prediction: String,
    val nallaNeram: String,
    val rahuKalam: String,
    val yamagandam: String = "",
    val kuligai: String = "",
    val sunrise: String = "",
    val sunset: String = "",
    /** True when no newspaper text was available (not published yet, or scraping failed). */
    val isFallback: Boolean = false,
    val source: String = "",
    /** Original reading computed from the Moon's transit; null from older backends. */
    val generated: GeneratedPalan? = null,
    /** 0 = scraped and generated say the same thing, 1 = opposite; null when nothing to compare. */
    val diffScore: Double? = null,
    val diff: PredictionDiff? = null,
    /** Computed Panchangam (shown on the reading screen); null from older backends. */
    val panchangam: PanchangamInfo? = null,
    /** The Moon changing rasi during this day, or null. */
    val moonChange: MoonChange? = null,
    /** The day's periods in minutes after midnight (IST), for "now / next" and timeline bars. */
    val timeline: TimelineInfo? = null,
    /** Link to the newspaper article [prediction] is taken from, when it is newspaper text. */
    val sourceUrl: String? = null,
    /** Credited third-party readings: the calendar sheet's word, then papers (Daily Thanthi first). */
    val sources: ThirdPartySources? = null,
    /** The Chandra Gochara rule table behind [generated] (12 rows), for "how is this calculated". */
    val gochara: List<GocharaRow> = emptyList(),
)

@Serializable
data class ThirdPartySources(
    val sheet: SheetWord? = null,
    val papers: List<PaperExcerpt> = emptyList(),
)

/** One rasi's word in the day's daily calendar, e.g. "எதிர்ப்பு", with its English ("Opposition") when known. */
@Serializable
data class SheetWord(
    val word: String = "",
    val english: String? = null,
    val confidence: Double? = null,
)

/** A newspaper's reading as a credited excerpt with a link to the full article. */
@Serializable
data class PaperExcerpt(
    val source: String = "",
    val credit: String = "",
    val url: String? = null,
    val excerpt: String = "",
)

/** `timeline` object. */
@Serializable
data class TimelineInfo(
    val sunrise: Int = 0,
    val sunset: Int = 0,
    val periods: List<PeriodInfo> = emptyList(),
)

/** One period: type is rahuKalam, yamagandam, kuligai, nallaNeram (newspaper) or abhijit. */
@Serializable
data class PeriodInfo(
    val type: String,
    val start: Int,
    val end: Int,
    val source: String = "computed",
)

@Serializable
data class MoonChange(
    val time: String = "",
    val fromRasi: String = "",
    val toRasi: String = "",
    val text: String = "",
)

/** One value of a Panchangam element and when it ends (null = lasts past next sunrise). */
@Serializable
data class SpanInfo(val name: String = "", val until: String? = null)

@Serializable
data class PanchangamSpans(
    val tithi: List<SpanInfo> = emptyList(),
    val nakshatra: List<SpanInfo> = emptyList(),
    val yogam: List<SpanInfo> = emptyList(),
    val karanam: List<SpanInfo> = emptyList(),
    val chandraRasi: List<SpanInfo> = emptyList(),
    val chandrashtamam: List<SpanInfo> = emptyList(),
)

/** `panchangam` object: values at sunrise with change times, e.g. "அனுஷம் 11:38 AM வரை, பின்பு கேட்டை". */
@Serializable
data class PanchangamInfo(
    val tamilDate: String = "",
    val tamilYear: String = "",
    val tamilMonth: String = "",
    val tamilDay: Int = 0,
    val paksha: String = "",
    val tithi: String = "",
    val nakshatra: String = "",
    val yogam: String = "",
    val karanam: String = "",
    val chandraRasi: String = "",
    val chandrashtamam: String = "",
    val chandrashtamamStars: String = "",
    val spans: PanchangamSpans? = null,
)

/** When chandrashtamam applies to this rasi today: state is none, allDay, until or from. */
@Serializable
data class ChandrashtamamInfo(
    val state: String = "none",
    val time: String? = null,
    val text: String = "",
)

/** `generated` object: Chandra Gochara reading written by this project (no third-party text). */
@Serializable
data class GeneratedPalan(
    val prediction: String = "",
    /** One line, e.g. "மனதில் உற்சாகம்; மதியத்தில் சற்று கவனம்". */
    val headline: String = "",
    val summary: String = "",
    val house: Int = 0,
    /** -2 (caution) … +2 (very good). */
    val score: Int = 0,
    val tone: String = "",
    val isChandrashtamam: Boolean = false,
    val chandrashtamam: ChandrashtamamInfo? = null,
    /** How the reading was worked out; null from older backends. */
    val basis: GocharaBasis? = null,
    /** Star by star (the rasi's 2–3 nakshatras); empty from older backends. */
    val stars: List<StarReading> = emptyList(),
)

/** One of the rasi's nakshatras today: its Tara Bala, the day's score for its natives and advice. */
@Serializable
data class StarReading(
    val nakshatra: String = "",
    /** The padas of this nakshatra that belong to the rasi, 1–4. */
    val padas: List<Int> = emptyList(),
    /** Tara 1–9 that holds most of the day; null when unknown. */
    val tara: Int? = null,
    val taraName: String = "",
    /** good, mixed or caution. */
    val rating: String = "",
    /** e.g. "Sampat Tara — favourable; Vipat Tara (take care) from 8:04 PM". */
    val note: String = "",
    /** What this Tara means for the star's natives today. */
    val advice: String = "",
    /** -2 … +2 (never 0): the day's composite with this star's own Tara Bala. */
    val score: Int = 0,
    val tone: String = "",
)

/** The Moon's sign(s) during the day, each sign's house from the reader's rasi, and which one decided the reading. */
@Serializable
data class GocharaBasis(
    val moon: List<MoonSpan> = emptyList(),
    /** Index into [moon] of the sign that decided the reading (it holds most of sunrise → next sunrise). */
    val ruling: Int = 0,
)

@Serializable
data class MoonSpan(
    val rasi: String = "",
    /** 0 = Mesham. */
    val rasiIndex: Int = 0,
    /** 1–12, counted from the reader's rasi (the rasi itself is 1). */
    val house: Int = 0,
    /** Display time the Moon leaves this sign, or null when it stays past next sunrise. */
    val until: String? = null,
)

/** One row of the Chandra Gochara rule table: the Moon in this house -> summary and score (-2 … +2). */
@Serializable
data class GocharaRow(val house: Int = 0, val summary: String = "", val score: Int = 0)

/**
 * `GET /api/panchangam?date=…`: one day of the computed calendar, used by the
 * daily calendar sheet. The Panchangam fields sit at the top level.
 */
@Serializable
data class PanchangamDayResponse(
    val date: String,
    val weekday: String = "",
    val tamilDate: String = "",
    val tamilYear: String = "",
    val tamilMonth: String = "",
    val tamilDay: Int = 0,
    val paksha: String = "",
    val tithi: String = "",
    val nakshatra: String = "",
    val yogam: String = "",
    val karanam: String = "",
    val chandraRasi: String = "",
    val chandrashtamam: String = "",
    val chandrashtamamStars: String = "",
    val moonChange: MoonChange? = null,
    val sunrise: String = "",
    val sunset: String = "",
    val rahuKalam: String = "",
    val yamagandam: String = "",
    val kuligai: String = "",
    val nallaNeram: String? = null,
    val gowri: List<GowriSlot> = emptyList(),
    /** Rahu / Yama / Kuligai / Nalla Neram in minutes, for the sheet's timings table. */
    val timeline: TimelineInfo? = null,
    val calendar: CalendarExtras? = null,
    /** The day's calendar sheet words for all 12 rasis, when the sheet was read completely. */
    val sheet: SheetDay? = null,
    val rasiPalan: List<DayRasiPalan> = emptyList(),
)

@Serializable
data class SheetDay(
    /** rasi key -> word */
    val words: Map<String, String> = emptyMap(),
    /** rasi key -> English (null when not translated yet) */
    val english: Map<String, String?> = emptyMap(),
)

/** One of the 16 Gowri Panchangam slots; minutes after local midnight (night slots run past 1440). */
@Serializable
data class GowriSlot(
    val name: String = "",
    val good: Boolean = false,
    /** "day" or "night". */
    val part: String = "day",
    val start: Int = 0,
    val end: Int = 0,
)

@Serializable
data class CalendarExtras(
    val dayOfYear: Int = 0,
    val daysLeft: Int = 0,
    val soolam: Soolam? = null,
    val lagna: Lagna? = null,
    /** "தட்சிணாயனம்" / "Dakshinayanam" */
    val ayanam: String = "",
    /** "சரத் ருது" / "Sharad ruthu" */
    val ruthu: String = "",
    /** Amanta lunar month as Tamil calendars print it ("கார்த்திகை" வளர்பிறை). */
    val lunarMonth: String = "",
    /** The nine grahas at sunrise, sidereal. */
    val planets: List<PlanetInfo> = emptyList(),
)

/** One graha in the sunrise chart: rasiIndex 0 = Mesham. */
@Serializable
data class PlanetInfo(
    val key: String = "",
    val name: String = "",
    val rasiIndex: Int = 0,
    val degree: Double = 0.0,
    val retrograde: Boolean = false,
)

/** Direction to avoid travelling, and its remedy. */
@Serializable
data class Soolam(val direction: String = "", val remedy: String = "")

/** Rising sign at sunrise and when it ends. */
@Serializable
data class Lagna(val name: String = "", val until: String = "", val text: String = "")

@Serializable
data class DayRasiPalan(
    val rasi: String,
    val generated: GeneratedPalan? = null,
)

/** `GET /api/birth-rasi`: janma rasi, nakshatra and pada from birth date and time. */
@Serializable
data class BirthRasiResponse(
    val rasi: String,
    val rasiName: String = "",
    val nakshatra: String = "",
    val pada: Int = 0,
    /** The Moon was within ~1° of a rasi boundary: a slightly wrong birth time could change the answer. */
    val nearRasiEdge: Boolean = false,
)

/** `diff` object: how far the scraped text's tone is from the generated one. */
@Serializable
data class PredictionDiff(
    val score: Double = 0.0,
    /** "agree", "partial" or "disagree". */
    val level: String = "",
    /** "high", "medium" or "low" — low means the scraped text had few tone words. */
    val confidence: String = "",
    /** Tone of the newspaper text, -1 (cautionary) … +1 (favourable). */
    val scrapedTone: Double = 0.0,
)

/**
 * Thin, stateless API facade over a single shared Ktor client.
 *
 * One HttpClient per process: OkHttp keeps a connection pool and TLS session
 * cache, so the 4–12 hourly refreshes reuse sockets where possible. Timeouts
 * are deliberately short — they must fit inside the ~10 s a broadcast
 * receiver is allowed to run via `goAsync()`.
 */
object RasiPalanApi {

    /** Shared with tests so they decode exactly as the app does. */
    internal val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true // null for a defaulted field -> use the default
    }

    private val client: HttpClient by lazy {
        HttpClient(OkHttp) {
            expectSuccess = true // non-2xx -> ResponseException, handled by the repository

            install(ContentNegotiation) { json(json) }

            install(HttpTimeout) {
                connectTimeoutMillis = 4_000
                socketTimeoutMillis = 6_000
                requestTimeoutMillis = 8_000
            }

            defaultRequest {
                // Trailing slash makes relative paths resolve under the base URL.
                url(BuildConfig.RASI_API_BASE_URL.trimEnd('/') + "/")
                header(HttpHeaders.Accept, "application/json")
                header(HttpHeaders.UserAgent, "KaalamWidget/${BuildConfig.VERSION_NAME} (Android)")
            }

            engine {
                config { retryOnConnectionFailure(true) }
            }
        }
    }

    /** Fetch the reading for [rasi] in [language], for [date] (null = today in IST). Throws on failure. */
    suspend fun fetchRasiPalan(rasi: Rasi, language: AppLanguage, date: LocalDate? = null): RasiPalanResponse =
        client.get("api/rasipalan") {
            parameter("rasi", rasi.apiKey)
            parameter("lang", language.code)
            if (date != null) parameter("date", date.toString())
        }.body()

    /** The computed calendar for [date] (Panchangam, timings, Gowri, all 12 readings). Throws on failure. */
    suspend fun fetchPanchangam(date: LocalDate, language: AppLanguage): PanchangamDayResponse =
        client.get("api/panchangam") {
            parameter("date", date.toString())
            parameter("lang", language.code)
        }.body()

    /** Janma rasi for a birth at [date] [hour]:[minute] IST. Throws on failure. */
    suspend fun fetchBirthRasi(date: LocalDate, hour: Int, minute: Int, language: AppLanguage): BirthRasiResponse =
        client.get("api/birth-rasi") {
            parameter("date", date.toString())
            parameter("time", String.format(java.util.Locale.ROOT, "%02d:%02d", hour, minute))
            parameter("lang", language.code)
        }.body()
}
