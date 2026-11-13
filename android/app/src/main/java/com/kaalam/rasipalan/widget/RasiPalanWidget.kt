package com.kaalam.rasipalan.widget

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider as FixedColor
import com.kaalam.rasipalan.MainActivity
import com.kaalam.rasipalan.data.DayTimeline
import com.kaalam.rasipalan.data.NowState
import com.kaalam.rasipalan.data.PeriodType
import com.kaalam.rasipalan.data.PredictionOrigin
import com.kaalam.rasipalan.data.RasiPalanState
import com.kaalam.rasipalan.data.Strings
import com.kaalam.rasipalan.data.formatMinute
import com.kaalam.rasipalan.data.rasiPalanStateFlow
import com.kaalam.rasipalan.data.readRasiPalanState
import com.kaalam.rasipalan.data.strings
import com.kaalam.rasipalan.ui.TimelineRenderer
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The home-screen widget, in three sizes (Glance picks the largest that fits):
 *
 *  - small  2×2: what is happening now, until when, and the next Nalla Neram.
 *    Turns red during Rahu Kalam.
 *  - medium 4×2: rasi and headline, with a now / next panel.
 *  - large  4×4: header with date, headline, reading, timeline bar, now and
 *    next cells, chandrashtamam status.
 *
 * Rendering contract: reads **only** from the Preferences DataStore. Network
 * refreshes happen elsewhere and write to the DataStore, which this
 * composition observes. "Now" is computed at each redraw; [WidgetTicker]
 * redraws at period boundaries (and every few minutes) while the phone is awake.
 */
class RasiPalanWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Read the cache *before* composition so the very first frame already
        // shows real content instead of flashing a loading state.
        val initialState = context.readRasiPalanState()

        provideContent {
            // While the Glance session is alive, any DataStore write (refresh
            // started, new reading, error) recomposes the widget automatically.
            val state by context.rasiPalanStateFlow.collectAsState(initial = initialState)

            GlanceTheme(colors = KaalamWidgetColors) {
                WidgetLayout(state)
            }
        }
    }

    companion object {
        val SMALL = DpSize(110.dp, 110.dp)
        val MEDIUM = DpSize(250.dp, 110.dp)
        val LARGE = DpSize(250.dp, 230.dp)
    }
}

// =============================================================================
//  Colours (day / night)
// =============================================================================

private object W {
    val amberBg = ColorProvider(day = Color(0xFFF3E3C3), night = Color(0xFF4A3A1C))
    val amberFg = ColorProvider(day = Color(0xFF8A5A12), night = Color(0xFFF2C35E))
    val greenBg = ColorProvider(day = Color(0xFFDCEFD6), night = Color(0xFF1E3B26))
    val greenFg = ColorProvider(day = Color(0xFF1B5E2E), night = Color(0xFF9FD9A8))
    val redBg = ColorProvider(day = Color(0xFFF8DAD2), night = Color(0xFF4A1A16))
    val redFg = ColorProvider(day = Color(0xFF8E2416), night = Color(0xFFFFB4A6))
    val alarmBg = ColorProvider(day = Color(0xFFA8321F), night = Color(0xFF6E1C18))
    val onAlarm = FixedColor(Color(0xFFFFF4EE))
    val neutralBg = ColorProvider(day = Color(0xFFEDDDBE), night = Color(0xFF3B2F26))
    val neutralFg = ColorProvider(day = Color(0xFF6A5442), night = Color(0xFFE6D6BE))
    val gold = ColorProvider(day = Color(0xFF9A7414), night = Color(0xFFE2C062))
}

private data class Tone(val background: androidx.glance.unit.ColorProvider, val foreground: androidx.glance.unit.ColorProvider)

private fun toneOf(type: PeriodType?): Tone = when (type) {
    PeriodType.RAHU_KALAM, PeriodType.YAMAGANDAM -> Tone(W.redBg, W.redFg)
    PeriodType.KULIGAI -> Tone(W.amberBg, W.amberFg)
    PeriodType.NALLA_NERAM, PeriodType.ABHIJIT -> Tone(W.greenBg, W.greenFg)
    null -> Tone(W.neutralBg, W.neutralFg)
}

// =============================================================================
//  Shared state for one render
// =============================================================================

private class View(val state: RasiPalanState) {
    val s: Strings = strings(state.language)
    val minute: Int = DayTimeline.minuteOf(LocalTime.now(RasiPalanState.INDIA_ZONE))
    /** Today's timeline, or null (older cache, stale day, nothing cached). */
    val timeline: DayTimeline? = state.timeline?.takeIf { state.hasData && !state.isStale }
    val now: NowState? = timeline?.nowAt(minute)
    val rasiName: String = state.rasi.displayName(state.language)

    val nowName: String
        get() = when (now?.phase) {
            NowState.Phase.PERIOD -> s.periodName(now.current!!.type)
            NowState.Phase.NORMAL -> s.normalTime
            NowState.Phase.BEFORE_SUNRISE -> s.beforeSunrise
            NowState.Phase.AFTER_SUNSET -> s.afterSunset
            null -> ""
        }

    val untilText: String? get() = now?.untilMinute?.let { s.until(formatMinute(it)) }
    val minutesLeft: Int? get() = now?.untilMinute?.let { it - minute }

    /** "நல்ல நேரம் 11:30", or "அஸ்தமனம் 5:40 PM" when no good time is left. */
    val nextText: String?
        get() {
            val t = timeline ?: return null
            now?.nextGood?.let { return "${s.periodName(it.type)} ${formatMinute(it.start).removeSuffix(" AM").removeSuffix(" PM")}" }
            return if (minute < t.sunset) s.sunsetAt(formatMinute(t.sunset)) else null
        }

    val isRahuNow: Boolean get() = now?.current?.type == PeriodType.RAHU_KALAM

    /** "வியாழன் · 12.11.2026 · ஐப்பசி 26" */
    fun dateLine(numeric: Boolean): String? {
        val date = runCatching { LocalDate.parse(state.readingDate) }.getOrNull() ?: return null
        val day = if (numeric) date.format(NUMERIC_DATE) else null
        return listOfNotNull(s.weekday(date.dayOfWeek), day, state.tamilDay.ifBlank { null }).joinToString(" · ")
    }
}

private val NUMERIC_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")
private val CLOCK_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)

private fun formatClock(epochMillis: Long): String =
    Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).format(CLOCK_FORMAT)

private val openApp get() = actionStartActivity<MainActivity>()

// =============================================================================
//  Layouts
// =============================================================================

@Composable
fun WidgetLayout(state: RasiPalanState) {
    val view = View(state)
    val size = LocalSize.current
    when {
        !state.hasData -> EmptyLayout(view)
        size.width >= RasiPalanWidget.LARGE.width && size.height >= RasiPalanWidget.LARGE.height -> LargeLayout(view)
        size.width >= RasiPalanWidget.MEDIUM.width -> MediumLayout(view)
        else -> SmallLayout(view)
    }
}

@Composable
private fun EmptyLayout(v: View) {
    Column(
        modifier = GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp)
            .background(GlanceTheme.colors.background).padding(14.dp)
            .clickable(actionRunCallback<RefreshAction>()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(v.rasiName, maxLines = 1, style = TextStyle(color = W.gold, fontSize = 16.sp, fontWeight = FontWeight.Bold))
        Spacer(GlanceModifier.height(6.dp))
        Text(
            text = when {
                v.state.isRefreshing -> v.s.widgetLoading
                v.state.lastError != null -> "${v.state.lastError}\n${v.s.widgetTapToRetry}"
                else -> v.s.widgetTapToLoad
            },
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp, textAlign = TextAlign.Center),
        )
    }
}

/** 2×2: now, until, next. Red while Rahu Kalam is on. */
@Composable
private fun SmallLayout(v: View) {
    val alarm = v.isRahuNow
    val fg = if (alarm) W.onAlarm else GlanceTheme.colors.onBackground
    val soft = if (alarm) W.onAlarm else GlanceTheme.colors.onSurfaceVariant
    Column(
        modifier = GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp)
            .background(if (alarm) W.alarmBg else GlanceTheme.colors.background)
            .padding(horizontal = 14.dp, vertical = 12.dp)
            .clickable(openApp),
    ) {
        Text(v.rasiName, maxLines = 1, style = TextStyle(color = if (alarm) W.onAlarm else W.gold, fontSize = 14.sp, fontWeight = FontWeight.Bold))
        Spacer(GlanceModifier.defaultWeight())
        if (v.now != null) {
            Text(v.s.now, maxLines = 1, style = TextStyle(color = soft, fontSize = 11.sp))
            Text(v.nowName, maxLines = 1, style = TextStyle(color = fg, fontSize = 19.sp, fontWeight = FontWeight.Bold))
            val until = listOfNotNull(v.untilText, v.minutesLeft?.takeIf { alarm }?.let { v.s.duration(it) }).joinToString(" · ")
            if (until.isNotBlank()) Text(until, maxLines = 1, style = TextStyle(color = soft, fontSize = 11.sp))
        } else {
            Text(v.state.headline.ifBlank { v.state.prediction }, maxLines = 3, style = TextStyle(color = fg, fontSize = 13.sp, fontWeight = FontWeight.Medium))
        }
        Spacer(GlanceModifier.defaultWeight())
        Box(GlanceModifier.fillMaxWidth().height(1.dp).background(if (alarm) W.onAlarm else W.neutralBg)) {}
        Spacer(GlanceModifier.height(6.dp))
        val footer = v.nextText ?: "${v.s.rahuKalam} ${v.state.rahuKalam}"
        Text(footer, maxLines = 1, style = TextStyle(color = if (alarm) W.onAlarm else W.greenFg, fontSize = 11.sp))
    }
}

/** 4×2: rasi + headline on the left, now / next panel on the right. */
@Composable
private fun MediumLayout(v: View) {
    Row(
        modifier = GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp)
            .background(GlanceTheme.colors.background).padding(12.dp)
            .clickable(openApp),
    ) {
        Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight().padding(end = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(GlanceModifier.width(3.dp).height(18.dp).background(W.gold)) {}
                Spacer(GlanceModifier.width(8.dp))
                Text(v.rasiName, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onBackground, fontSize = 16.sp, fontWeight = FontWeight.Bold))
            }
            Spacer(GlanceModifier.height(6.dp))
            Text(
                v.state.headline.ifBlank { v.state.prediction },
                maxLines = 3,
                style = TextStyle(color = GlanceTheme.colors.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Bold),
            )
            Spacer(GlanceModifier.defaultWeight())
            v.dateLine(numeric = false)?.let { Text(it, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp)) }
        }
        val tone = toneOf(v.now?.current?.type)
        Column(
            modifier = GlanceModifier.width(124.dp).fillMaxHeight().cornerRadius(14.dp).background(tone.background).padding(10.dp),
        ) {
            if (v.now != null) {
                Text(v.s.now, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 11.sp))
                Text(v.nowName, maxLines = 2, style = TextStyle(color = tone.foreground, fontSize = 16.sp, fontWeight = FontWeight.Bold))
                v.untilText?.let { Text(it, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 11.sp)) }
                Spacer(GlanceModifier.defaultWeight())
                v.nextText?.let { Text("${v.s.next} $it", maxLines = 2, style = TextStyle(color = tone.foreground, fontSize = 11.sp)) }
            } else {
                // Older cache without a timeline: the two classic timings.
                Text(v.s.nallaNeram, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 11.sp, fontWeight = FontWeight.Bold))
                Text(v.state.nallaNeram, maxLines = 2, style = TextStyle(color = tone.foreground, fontSize = 11.sp))
                Spacer(GlanceModifier.defaultWeight())
                Text(v.s.rahuKalam, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 11.sp, fontWeight = FontWeight.Bold))
                Text(v.state.rahuKalam, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 11.sp))
            }
        }
    }
}

/** 4×4: header, headline, reading, timeline bar, now / next cells, chandrashtamam. */
@Composable
private fun LargeLayout(v: View) {
    val context = LocalContext.current
    val size = LocalSize.current
    Column(
        modifier = GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp)
            .background(GlanceTheme.colors.background)
            .clickable(openApp),
    ) {
        Column(modifier = GlanceModifier.fillMaxWidth().background(GlanceTheme.colors.primary).padding(horizontal = 16.dp, vertical = 10.dp)) {
            Text(v.rasiName, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onPrimary, fontSize = 21.sp, fontWeight = FontWeight.Bold))
            v.dateLine(numeric = true)?.let { Text(it, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onPrimary, fontSize = 11.sp)) }
        }
        Box(GlanceModifier.fillMaxWidth().height(3.dp).background(GlanceTheme.colors.secondary)) {}

        Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight().padding(horizontal = 16.dp, vertical = 10.dp)) {
            if (v.state.headline.isNotBlank()) {
                Text(v.state.headline, maxLines = 2, style = TextStyle(color = GlanceTheme.colors.onBackground, fontSize = 16.sp, fontWeight = FontWeight.Bold))
                Spacer(GlanceModifier.height(4.dp))
            }
            // Fill the height: 3 lines at the minimum size, more as the widget grows.
            val bodyLines = (3 + ((size.height.value - 230f) / 19f).toInt()).coerceIn(3, 12)
            Text(v.state.prediction, maxLines = bodyLines, style = TextStyle(color = GlanceTheme.colors.onBackground, fontSize = 13.sp))
            v.note()?.let { (note, color) -> Text(note, maxLines = 1, style = TextStyle(color = color, fontSize = 10.sp)) }
            Spacer(GlanceModifier.defaultWeight())

            val timeline = v.timeline
            if (timeline != null) {
                val night = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
                val density = context.resources.displayMetrics.density
                val widthPx = ((size.width.value - 32) * density).toInt()
                val heightPx = (10 * density).toInt()
                val bitmap = TimelineRenderer.bitmap(
                    widthPx, heightPx, timeline, v.minute,
                    track = if (night) android.graphics.Color.parseColor("#3B2F26") else android.graphics.Color.parseColor("#EDDDBE"),
                    marker = if (night) android.graphics.Color.parseColor("#FFF8EE") else android.graphics.Color.parseColor("#2E1F17"),
                )
                Image(ImageProvider(bitmap), contentDescription = null, contentScale = ContentScale.FillBounds,
                    modifier = GlanceModifier.fillMaxWidth().height(10.dp))
                Spacer(GlanceModifier.height(8.dp))
                Row(modifier = GlanceModifier.fillMaxWidth()) {
                    val nowTone = toneOf(v.now?.current?.type)
                    Cell(v.s.now, v.nowName, listOfNotNull(v.untilText, v.minutesLeft?.let { v.s.duration(it) }).joinToString(" · "), nowTone, GlanceModifier.defaultWeight())
                    Spacer(GlanceModifier.width(8.dp))
                    val next = v.now?.nextGood
                    if (next != null) {
                        val range = "${formatMinute(next.start).removeSuffix(" AM").removeSuffix(" PM")} – ${formatMinute(next.end).removeSuffix(" AM").removeSuffix(" PM")}"
                        Cell(v.s.next, v.s.periodName(next.type), range, toneOf(next.type), GlanceModifier.defaultWeight())
                    } else {
                        Cell(v.s.sunsetShort, formatMinute(timeline.sunset), "", toneOf(null), GlanceModifier.defaultWeight())
                    }
                }
            } else {
                // Older cache or a previous day: the classic two timings.
                Row(modifier = GlanceModifier.fillMaxWidth()) {
                    Cell(v.s.nallaNeram, v.state.nallaNeram, "", Tone(W.greenBg, W.greenFg), GlanceModifier.defaultWeight())
                    Spacer(GlanceModifier.width(8.dp))
                    Cell(v.s.rahuKalam, v.state.rahuKalam, "", Tone(W.redBg, W.redFg), GlanceModifier.defaultWeight())
                }
            }
        }

        Row(modifier = GlanceModifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 10.dp)) {
            Text(v.state.chandrashtamamText, maxLines = 1, modifier = GlanceModifier.defaultWeight(),
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp))
            val status = when {
                v.state.isRefreshing -> v.s.updating
                v.state.lastUpdatedMillis > 0 -> formatClock(v.state.lastUpdatedMillis)
                else -> ""
            }
            Text(status, maxLines = 1, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp))
        }
    }
}

@Composable
private fun Cell(label: String, value: String, detail: String, tone: Tone, modifier: GlanceModifier) {
    Column(modifier = modifier.cornerRadius(14.dp).background(tone.background).padding(horizontal = 10.dp, vertical = 8.dp)) {
        Text(label, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 11.sp))
        Text(value, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 16.sp, fontWeight = FontWeight.Bold))
        if (detail.isNotBlank()) Text(detail, maxLines = 1, style = TextStyle(color = tone.foreground, fontSize = 11.sp))
    }
}

/** Stale / placeholder / generated-reading note under the large widget's reading. */
@Composable
private fun View.note(): Pair<String, androidx.glance.unit.ColorProvider>? = when {
    state.isStale -> s.staleNote to GlanceTheme.colors.error
    state.origin == PredictionOrigin.FALLBACK -> s.fallbackNote to GlanceTheme.colors.error
    state.origin == PredictionOrigin.GENERATED -> s.generatedLabel to GlanceTheme.colors.onSurfaceVariant
    else -> null
}
