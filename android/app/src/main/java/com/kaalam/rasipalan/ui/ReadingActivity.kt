package com.kaalam.rasipalan.ui

import android.Manifest
import android.app.DatePickerDialog
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.kaalam.rasipalan.MainActivity
import com.kaalam.rasipalan.R
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.DayPeriod
import com.kaalam.rasipalan.data.DayTimeline
import com.kaalam.rasipalan.data.NowState
import com.kaalam.rasipalan.data.PeriodType
import com.kaalam.rasipalan.data.PredictionOrigin
import com.kaalam.rasipalan.data.Rasi
import com.kaalam.rasipalan.data.RasiPalanRepository
import com.kaalam.rasipalan.data.RasiPalanState
import com.kaalam.rasipalan.data.RowStatus
import com.kaalam.rasipalan.data.Strings
import com.kaalam.rasipalan.data.TourScreen
import com.kaalam.rasipalan.data.resetTours
import com.kaalam.rasipalan.data.tourStrings
import com.kaalam.rasipalan.ui.tour.AppTour
import com.kaalam.rasipalan.ui.tour.SpotShape
import com.kaalam.rasipalan.ui.tour.TourStep
import com.kaalam.rasipalan.data.choosePrediction
import com.kaalam.rasipalan.data.dayWord
import com.kaalam.rasipalan.data.firstSentence
import com.kaalam.rasipalan.data.formatMinute
import com.kaalam.rasipalan.data.network.RasiPalanResponse
import com.kaalam.rasipalan.data.network.SpanInfo
import com.kaalam.rasipalan.data.readRasiPalanState
import com.kaalam.rasipalan.data.reminderKind
import com.kaalam.rasipalan.data.strings
import com.kaalam.rasipalan.reminders.Reminders
import com.kaalam.rasipalan.widget.WidgetPinning
import com.kaalam.rasipalan.widget.WidgetUpdater
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The today screen (and any other date): what is happening now, chandrashtamam
 * for my rasi, the reading (Moon-transit or newspaper), the day's timings with
 * reminder bells, and the Panchangam. நேற்று / இன்று / நாளை switch days, the
 * date opens a calendar, the rasi name changes rasi, pull down to refresh.
 */
class ReadingActivity : ComponentActivity() {

    private lateinit var rasi: Rasi
    private lateinit var repository: RasiPalanRepository
    private var language = AppLanguage.DEFAULT
    private var date: LocalDate = today()

    private lateinit var title: TextView
    private lateinit var subtitle: TextView
    private lateinit var widgetButton: ImageView
    private lateinit var calendarButton: ImageView
    private lateinit var segmentsBox: LinearLayout
    /** The Moon-transit / newspaper switch in the reading card (a tour target); null when absent. */
    private var readingTabs: View? = null
    /** Tour step to resume at after a configuration change, or -1. */
    private var resumeTourAt = -1

    private val tour by lazy {
        AppTour(this, TourScreen.READING, { language }, ::tourSteps, onActiveChanged = { active -> refresher.isEnabled = !active })
    }
    private lateinit var refresher: SwipeRefreshLayout
    private lateinit var content: LinearLayout
    private var loadJob: Job? = null

    /** Last full response shown, and the parts that tick every 30 s on today's screen. */
    private var response: RasiPalanResponse? = null
    private var timeline: DayTimeline? = null
    private var reminderTypes: Set<PeriodType> = emptySet()
    private var nowCard: LinearLayout? = null
    private var timingsCard: LinearLayout? = null
    private var showNewspaper = false
    private var panchangamExpanded = false
    private var pendingReminder: PeriodType? = null

    private val s: Strings get() = strings(language)
    private val isToday: Boolean get() = date == today()

    private val ticker = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            renderLiveParts()
            ticker.postDelayed(this, TICK_MS)
        }
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (pendingLockScreen) {
            pendingLockScreen = false
            if (granted) {
                setLockScreen(true)
            } else {
                lockScreenOn = false
                Toast.makeText(this, s.notificationsDenied, Toast.LENGTH_LONG).show()
                response?.let { showResponse(it) }
            }
            return@registerForActivityResult
        }
        val type = pendingReminder ?: return@registerForActivityResult
        pendingReminder = null
        if (granted) setReminder(type, true) else Toast.makeText(this, s.notificationsDenied, Toast.LENGTH_LONG).show()
    }
    private var pendingLockScreen = false
    private var lockScreenOn = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        rasi = Rasi.fromApiKey(intent.getStringExtra(EXTRA_RASI))
        repository = RasiPalanRepository(applicationContext)
        intent.getStringExtra(EXTRA_DATE)?.let { extra -> runCatching { date = LocalDate.parse(extra) } }
        savedInstanceState?.getString(STATE_DATE)?.let { saved -> runCatching { date = LocalDate.parse(saved) } }
        resumeTourAt = savedInstanceState?.getInt(AppTour.STATE_STEP, -1) ?: -1

        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(4), 0, dp(24))
        }
        refresher = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(Kaalam.MAROON)
            setOnRefreshListener { load() }
            addView(ScrollView(this@ReadingActivity).apply { addView(content) })
        }
        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                fitsSystemWindows = true // edge-to-edge is mandatory from API 35/36
                setBackgroundColor(Kaalam.PARCHMENT)
                addView(buildHeader(), matchWidth())
                addView(View(this@ReadingActivity).apply { setBackgroundColor(Kaalam.GOLD) },
                    LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(3)))
                addView(refresher, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
            },
        )

        lifecycleScope.launch {
            language = repository.language()
            load()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(STATE_DATE, date.toString())
        tour.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        if (::widgetButton.isInitialized) widgetButton.visibility = if (canAddWidget()) View.VISIBLE else View.GONE
        ticker.postDelayed(tick, TICK_MS)
    }

    override fun onPause() {
        super.onPause()
        ticker.removeCallbacks(tick)
    }

    // ---------------------------------------------------------------------
    // Header: rasi ▾, add-widget, date, நேற்று / இன்று / நாளை
    // ---------------------------------------------------------------------

    private fun buildHeader(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(Kaalam.MAROON)
        setPadding(dp(18), dp(14), dp(14), dp(14))

        title = text("", 26f, Kaalam.IVORY, bold = true).apply {
            setOnClickListener {
                startActivity(MainActivity.chooseRasiIntent(this@ReadingActivity))
                finish()
            }
        }
        widgetButton = ImageView(this@ReadingActivity).apply {
            setImageResource(R.drawable.ic_widget_add)
            setColorFilter(Kaalam.IVORY)
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setStroke(dp(1), Kaalam.IVORY)
            }
            setPadding(dp(10), dp(10), dp(10), dp(10))
            setOnClickListener { WidgetPinning.requestPin(this@ReadingActivity) }
            visibility = if (canAddWidget()) View.VISIBLE else View.GONE
        }
        calendarButton = ImageView(this@ReadingActivity).apply {
            setImageResource(R.drawable.ic_calendar)
            setColorFilter(Kaalam.IVORY)
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setStroke(dp(1), Kaalam.IVORY)
            }
            setPadding(dp(10), dp(10), dp(10), dp(10))
            contentDescription = s.dailyCalendar
            setOnClickListener { openCalendar() }
        }
        addView(
            LinearLayout(this@ReadingActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(calendarButton, LinearLayout.LayoutParams(dp(44), dp(44)))
                addView(widgetButton, LinearLayout.LayoutParams(dp(44), dp(44)).apply { marginStart = dp(8) })
            },
            matchWidth(),
        )
        subtitle = text("", 13f, Kaalam.IVORY).apply {
            setOnClickListener { pickDate() }
            contentDescription = "date"
        }
        addView(subtitle, matchWidth(dp(2)))
        segmentsBox = LinearLayout(this@ReadingActivity).apply { orientation = LinearLayout.VERTICAL }
        addView(segmentsBox, matchWidth(dp(12)))
    }

    private fun canAddWidget() = WidgetPinning.canRequestPin(this) && !WidgetPinning.isPlaced(this)

    // ---------------------------------------------------------------------
    // First-visit tour (header first, then down the page)
    // ---------------------------------------------------------------------

    private fun tourSteps(): List<TourStep> {
        val t = tourStrings(language)
        return listOf(
            TourStep(t.readingRasi) { title },
            TourStep(t.readingDays) { segmentsBox },
            TourStep(t.readingCalendar, SpotShape.CIRCLE) { calendarButton },
            TourStep(t.readingWidget, SpotShape.CIRCLE) { widgetButton },
            TourStep(t.readingNow) { nowCard },
            TourStep(t.readingTabs) { readingTabs },
            TourStep(t.readingBells, SpotShape.CIRCLE) { firstBell() },
        )
    }

    /** The first reminder bell in the timings card (rebuilt every 30 s, so looked up each time). */
    private fun firstBell(): View? {
        val found = ArrayList<View>()
        timingsCard?.findViewsWithText(found, s.bellHint, View.FIND_VIEWS_WITH_CONTENT_DESCRIPTION)
        return found.firstOrNull { it is ImageView }
    }

    /** "Take the app tour again": every screen's tour shows again, starting with this one now. */
    private fun replayTour() {
        lifecycleScope.launch {
            applicationContext.resetTours()
            tour.start()
        }
    }

    private fun showHowCalculated(r: RasiPalanResponse) = showGocharaExplainer(r, rasi, language)

    private fun onLockScreenToggled(enable: Boolean) {
        if (enable && !Reminders.canNotify(this) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pendingLockScreen = true
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        setLockScreen(enable)
    }

    private fun setLockScreen(enable: Boolean) {
        lifecycleScope.launch {
            repository.setLockScreenSummary(enable)
            Toast.makeText(this@ReadingActivity, if (enable) s.lockScreenOn else s.lockScreenOff, Toast.LENGTH_SHORT).show()
            response?.let { showResponse(it) }
        }
    }

    private fun openCalendar() = startActivity(CalendarActivity.intent(this, rasi, date))

    private fun updateHeader(tamilDay: String? = null) {
        title.text = "${rasi.displayName(language)}  ▾"
        subtitle.text = listOfNotNull(s.fullDate(date), tamilDay).joinToString(" · ")
        val days = listOf(today().minusDays(1), today(), today().plusDays(1))
        segmentsBox.removeAllViews()
        segmentsBox.addView(
            segmented(listOf(Segment(s.yesterday), Segment(s.today), Segment(s.tomorrow)), days.indexOf(date), onDark = true) {
                showDate(days[it])
            },
            matchWidth(),
        )
    }

    private fun showDate(newDate: LocalDate) {
        if (newDate.year !in 1900..2100) return
        date = newDate
        showNewspaper = false
        tabTouched = false
        load()
    }

    private fun pickDate() {
        DatePickerDialog(
            this,
            { _, year, month, day -> showDate(LocalDate.of(year, month + 1, day)) },
            date.year, date.monthValue - 1, date.dayOfMonth,
        ).apply {
            datePicker.minDate = LocalDate.of(1900, 1, 1).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
            datePicker.maxDate = LocalDate.of(2100, 12, 31).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        }.show()
    }

    // ---------------------------------------------------------------------
    // Loading
    // ---------------------------------------------------------------------

    private fun load() {
        loadJob?.cancel() // a newer date or language wins
        updateHeader()
        loadJob = lifecycleScope.launch {
            val requestedDate = date
            val cached = applicationContext.readRasiPalanState()
            reminderTypes = cached.reminderTypes
            lockScreenOn = cached.lockScreenSummary && Reminders.canNotify(this@ReadingActivity)
            val usable = cached.takeIf { isToday && it.rasi == rasi && it.language == language && it.hasData && !it.isStale }
            val showingOtherDay = response?.date != requestedDate.toString()
            if (usable != null && showingOtherDay) showCached(usable) else if (showingOtherDay) showStatus(s.loading)
            refresher.isRefreshing = true

            try {
                val fresh = repository.fetchReading(rasi, requestedDate.takeUnless { it == today() })
                showResponse(fresh)
                if (fresh.isToday) WidgetUpdater.redrawAll(applicationContext)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val message = with(repository) { e.toUserMessage(language) }
                if (usable != null) Toast.makeText(this@ReadingActivity, message, Toast.LENGTH_LONG).show()
                else showStatus("⚠ $message\n\n${s.retryHint}")
            } finally {
                refresher.isRefreshing = false
            }
        }
    }

    private fun onLanguagePicked(chosen: AppLanguage) {
        language = chosen
        lifecycleScope.launch {
            repository.setLanguage(chosen)
            WidgetUpdater.scope.launch { WidgetUpdater.refreshAndRedraw(applicationContext, force = true) }
            response = null
            load()
        }
    }

    private fun onBellTapped(type: PeriodType) {
        val enable = type.reminderKind() !in reminderTypes.map { it.reminderKind() }
        if (enable && !Reminders.canNotify(this) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pendingReminder = type
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        setReminder(type, enable)
    }

    private fun setReminder(type: PeriodType, enabled: Boolean) {
        lifecycleScope.launch {
            repository.setReminder(type, enabled)
            reminderTypes = applicationContext.readRasiPalanState().reminderTypes
            val name = s.periodName(type)
            Toast.makeText(this@ReadingActivity, if (enabled) s.reminderOn(name) else s.reminderOff(name), Toast.LENGTH_SHORT).show()
            renderLiveParts()
        }
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------

    private fun showStatus(message: String) {
        response = null
        nowCard = null
        timingsCard = null
        content.removeAllViews()
        content.addView(text(message, 15f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER }, cardParams(48))
        addFooter(null)
    }

    /** Today's widget cache while the full response loads. */
    private fun showCached(state: RasiPalanState) {
        response = null
        timeline = state.timeline
        content.removeAllViews()
        nowCard = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }.also { content.addView(it, cardParams(16)) }
        if (state.chandrashtamamText.isNotBlank()) content.addView(chandrashtamamCard(state.chandrashtamamText, state.chandrashtamamState), cardParams())
        content.addView(
            card().apply {
                addView(LinearLayout(this@ReadingActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    addView(text(s.todayReading, 15f, Kaalam.MAROON, bold = true),
                        LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                    if (state.dayWord.isNotBlank()) addView(chip(state.dayWord, Accent.AMBER_BG, Kaalam.MAROON).apply { textSize = 15f })
                })
                if (state.headline.isNotBlank()) addView(text(state.headline, 21f, Kaalam.INK, bold = true), matchWidth(dp(10)))
                addView(text(state.prediction, 17f), matchWidth(dp(10)))
            },
            cardParams(),
        )
        timingsCard = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }.also { content.addView(it, cardParams()) }
        renderLiveParts()
        addFooter(null)
    }

    private fun showResponse(r: RasiPalanResponse) {
        response = r
        timeline = DayTimeline.from(r.timeline)
        val p = r.panchangam
        updateHeader(tamilDay = p?.takeIf { it.tamilMonth.isNotBlank() }?.let { "${it.tamilMonth} ${it.tamilDay}" })
        content.removeAllViews()
        readingTabs = null

        nowCard = if (r.isToday && timeline != null) {
            LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }.also { content.addView(it, cardParams(16)) }
        } else {
            null
        }
        r.generated?.chandrashtamam?.takeIf { it.text.isNotBlank() }?.let {
            content.addView(chandrashtamamCard(it.text, it.state), cardParams(if (nowCard == null) 16 else 12))
        }
        content.addView(readingCard(r), cardParams())
        timingsCard = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }.also { content.addView(it, cardParams()) }
        if (p != null) content.addView(panchangamCard(r), cardParams())
        content.addView(pillButton(s.openCalendar, filled = true) { openCalendar() }, cardParams(16))
        renderLiveParts()
        addFooter(r)
        // The full screen is up: run the first-visit tour (or resume it after rotation).
        tour.startIfNeeded(resumeTourAt)
        resumeTourAt = -1
    }

    /** The now card and the timings statuses depend on the clock: re-rendered every 30 s. */
    private fun renderLiveParts() {
        val t = timeline
        val minute = DayTimeline.minuteOf(LocalTime.now(RasiPalanState.INDIA_ZONE))
        nowCard?.let { box ->
            box.removeAllViews()
            if (t != null && isToday) {
                box.addView(nowContent(t, minute), matchWidth())
                box.visibility = View.VISIBLE
            } else {
                box.visibility = View.GONE
            }
        }
        timingsCard?.let { box ->
            box.removeAllViews()
            if (t != null) {
                box.addView(timingsContent(t, if (isToday) minute else null), matchWidth())
                box.visibility = View.VISIBLE
            } else {
                box.visibility = View.GONE
            }
        }
    }

    // --- Now card --------------------------------------------------------

    private fun nowContent(t: DayTimeline, minute: Int): LinearLayout = card().apply {
        val now = t.nowAt(minute)
        val (name, color) = when (now.phase) {
            NowState.Phase.PERIOD -> s.periodName(now.current!!.type) to periodColor(now.current.type)
            NowState.Phase.NORMAL -> s.normalTime to Kaalam.INK
            NowState.Phase.BEFORE_SUNRISE -> s.beforeSunrise to Kaalam.INK
            NowState.Phase.AFTER_SUNSET -> s.afterSunset to Kaalam.INK
        }
        val left = LinearLayout(this@ReadingActivity).apply {
            orientation = LinearLayout.VERTICAL
            addView(LinearLayout(this@ReadingActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(dot(color.takeIf { now.phase == NowState.Phase.PERIOD } ?: Accent.GREY_DOT))
                addView(text("  ${s.now} · ${formatMinute(minute)}", 13f, Kaalam.INK_SOFT))
            })
            addView(text(name, 28f, color, bold = true), matchWidth(dp(2)))
            now.untilMinute?.let { addView(text(s.until(formatMinute(it)), 14f, Kaalam.INK_SOFT)) }
        }
        addView(LinearLayout(this@ReadingActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(left, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            now.untilMinute?.let { until -> addView(remainingBadge(until - minute)) }
        })

        addView(TimelineView(this@ReadingActivity).apply { timeline = t; nowMinute = minute },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(22)).apply { topMargin = dp(14) })
        addView(LinearLayout(this@ReadingActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(text("${formatMinute(t.sunrise).removeSuffix(" AM")} ${s.sunriseShort}", 12f, Kaalam.INK_SOFT),
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(text("${s.sunsetShort} ${formatMinute(t.sunset).removeSuffix(" PM")}", 12f, Kaalam.INK_SOFT))
        }, matchWidth(dp(4)))

        val next = now.nextGood
        val pill = LinearLayout(this@ReadingActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            if (next != null) {
                background = rounded(Kaalam.GREEN_BG, 12)
                addView(dot(Accent.GREEN_DOT))
                addView(text("  ${s.next}: ", 14f, Kaalam.GREEN_FG).apply {
                    append(boldWords(s.periodName(next.type), s.periodName(next.type)))
                    append(" ${formatMinute(next.start)}")
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(text(s.duration(next.start - minute), 13f, Kaalam.GREEN_FG, bold = true))
            } else if (minute < t.sunset) {
                background = rounded(Kaalam.NEUTRAL_BG, 12)
                addView(text(s.sunsetAt(formatMinute(t.sunset)), 14f, Kaalam.INK))
            }
        }
        if (pill.childCount > 0) addView(pill, matchWidth(dp(14)))
    }

    private fun remainingBadge(minutes: Int): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        background = rounded(Accent.AMBER_BG, 12)
        setPadding(dp(14), dp(6), dp(14), dp(6))
        val (number, unit) = if (minutes < 60) "$minutes" to s.minutesWord
        else String.format(Locale.ROOT, "%d:%02d", minutes / 60, minutes % 60) to s.hoursWord
        addView(text(number, 24f, Accent.AMBER_FG, bold = true).apply { gravity = Gravity.CENTER })
        addView(text(unit, 12f, Accent.AMBER_FG).apply { gravity = Gravity.CENTER })
    }

    private fun periodColor(type: PeriodType): Int = when (type) {
        PeriodType.RAHU_KALAM, PeriodType.YAMAGANDAM -> Kaalam.ERROR
        PeriodType.KULIGAI -> Accent.AMBER_FG
        PeriodType.NALLA_NERAM, PeriodType.ABHIJIT -> Kaalam.GREEN_FG
    }

    private fun dotColor(type: PeriodType): Int = when (type) {
        PeriodType.RAHU_KALAM, PeriodType.YAMAGANDAM -> Accent.RED_DOT
        PeriodType.KULIGAI -> Accent.AMBER_DOT
        PeriodType.NALLA_NERAM, PeriodType.ABHIJIT -> Accent.GREEN_DOT
    }

    // --- Chandrashtamam ----------------------------------------------------

    private fun chandrashtamamCard(message: String, state: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        val clear = state == "none"
        background = rounded(if (clear) Accent.WHITE else Kaalam.RED_BG, 14)
        setPadding(dp(16), dp(14), dp(16), dp(14))
        addView(text(if (clear) "✓" else "⚠", 18f, if (clear) Kaalam.GREEN_FG else Kaalam.ERROR, bold = true))
        addView(
            text("", 15f, if (clear) Kaalam.GREEN_FG else Kaalam.RED_FG).apply {
                text = boldWords(message, "சந்திராஷ்டமம்", "இல்லை", "Chandrashtamam", "No ")
            },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12) },
        )
    }

    // --- Reading -------------------------------------------------------------

    private fun readingCard(r: RasiPalanResponse): LinearLayout = card().apply {
        val generated = r.generated?.takeIf { it.prediction.isNotBlank() }
        val chosen = choosePrediction(r, language)
        val newspaperAvailable = !r.isFallback && r.prediction.isNotBlank()
        if (!newspaperAvailable) showNewspaper = false
        // Start on whatever the chooser picked; afterwards respect the user's tab.
        val showingNewspaper = newspaperAvailable && (showNewspaper || generated == null || chosen.origin == PredictionOrigin.SCRAPED && !tabTouched)

        // One summary word for the day: the daily calendar's word, else the computed summary,
        // else (newspaper text with neither) the newspaper's tone.
        val word = dayWord(r, language)
        val chipInfo: Triple<String, Int, Int>? = when {
            word?.fromCalendar == true -> Triple(word.word, Accent.AMBER_BG, Kaalam.MAROON)
            word != null -> when {
                (word.score ?: 0) > 0 -> Triple(word.word, Kaalam.GREEN_BG, Kaalam.GREEN_FG)
                word.score == -1 -> Triple(word.word, Accent.AMBER_BG, Accent.AMBER_FG)
                else -> Triple(word.word, Kaalam.RED_BG, Kaalam.RED_FG)
            }
            showingNewspaper -> r.diff?.scrapedTone?.let { tone ->
                when {
                    tone >= 0.2 -> Triple(s.toneGood, Kaalam.GREEN_BG, Kaalam.GREEN_FG)
                    tone <= -0.2 -> Triple(s.toneCaution, Kaalam.RED_BG, Kaalam.RED_FG)
                    else -> null
                }
            }
            else -> null
        }
        val headline = if (showingNewspaper) firstSentence(r.prediction) else generated?.headline.orEmpty()

        addView(LinearLayout(this@ReadingActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text(if (r.isToday) s.todayReading else s.reading, 15f, Kaalam.MAROON, bold = true),
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            chipInfo?.let { (label, bg, fg) -> addView(chip(label, bg, fg).apply { textSize = 15f }) }
        })
        headline.takeIf { it.isNotBlank() }?.let { addView(text(it, 22f, Kaalam.INK, bold = true), matchWidth(dp(12))) }

        val body = when {
            showingNewspaper -> r.prediction.trim().removePrefix(headline).trimStart('.', ' ', '…')
            generated != null -> generated.prediction
            else -> chosen.text
        }
        if (body.isNotBlank()) addView(text(body, 17f), matchWidth(dp(10)))
        if (!showingNewspaper && generated?.basis != null && r.gochara.isNotEmpty()) {
            addView(text(s.howLink, 14f, Kaalam.MAROON, bold = true).apply {
                setPadding(0, dp(8), 0, dp(8))
                setOnClickListener { showHowCalculated(r) }
            }, matchWidth(dp(4)))
        }
        if (showingNewspaper) {
            val paper = r.sources?.papers?.firstOrNull()
            val credit = paper?.credit?.ifBlank { null } ?: r.source
            if (credit.isNotBlank()) addView(text(s.credit(credit), 12f, Kaalam.INK_SOFT), matchWidth(dp(6)))
            (paper?.url ?: r.sourceUrl)?.let { url ->
                val site = runCatching { android.net.Uri.parse(url).host?.removePrefix("www.") }.getOrNull() ?: url
                addView(text(s.readFull(site), 13f, Kaalam.MAROON, bold = true).apply {
                    setPadding(0, dp(6), 0, dp(6))
                    setOnClickListener {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
                    }
                }, matchWidth(dp(2)))
            }
        }
        if (showingNewspaper) r.diff?.let {
            addView(text(s.agreement(it.level, String.format(Locale.ROOT, "%.2f", it.score)), 12f, Kaalam.INK_SOFT), matchWidth(dp(4)))
        }

        r.moonChange?.takeIf { it.time.isNotBlank() }?.let { change ->
            addView(LinearLayout(this@ReadingActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = rounded(Kaalam.NEUTRAL_BG, 12)
                setPadding(dp(14), dp(10), dp(14), dp(10))
                addView(text("☾", 16f, Kaalam.MAROON))
                addView(text("", 14f, Kaalam.INK).apply {
                    text = boldWords("${change.time} — ${change.text}", change.time)
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(10) })
            }, matchWidth(dp(14)))
        }

        if (generated != null) {
            val newspaperSub = when {
                newspaperAvailable -> null
                r.isToday -> s.newspaperAfter6
                else -> s.newspaperUnavailable
            }
            addView(
                segmented(
                    listOf(Segment(s.generatedTab), Segment(s.newspaperTab, newspaperSub, enabled = newspaperAvailable)),
                    if (showingNewspaper) 1 else 0,
                    onDark = false,
                ) { index ->
                    tabTouched = true
                    showNewspaper = index == 1
                    response?.let { showResponse(it) }
                }.also { readingTabs = it },
                matchWidth(dp(14)),
            )
        }
    }

    private var tabTouched = false

    // --- Timings ---------------------------------------------------------------

    private fun timingsContent(t: DayTimeline, minute: Int?): LinearLayout = card().apply {
        setPadding(dp(16), dp(14), dp(8), dp(8))
        addView(text(if (isToday) s.todaysTimings else s.timings, 17f, Kaalam.MAROON, bold = true))
        addView(text(s.bellHint, 12f, Kaalam.INK_SOFT))
        if (minute == null) {
            addView(TimelineView(this@ReadingActivity).apply { timeline = t },
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(18)).apply { topMargin = dp(10); marginEnd = dp(8) })
        }
        addView(sunRow(t.sunrise, s.sunrise), matchWidth(dp(8)))
        t.periods.forEach { period -> addView(periodRow(t, period, minute), matchWidth()) }
        addView(sunRow(t.sunset, s.sunset), matchWidth())
    }

    private fun sunRow(minute: Int, label: String): LinearLayout = timingRow(formatMinute(minute), Accent.GREY_DOT, label, null, Kaalam.INK, null, false, null)

    private fun periodRow(t: DayTimeline, period: DayPeriod, minute: Int?): LinearLayout {
        val status = minute?.let { t.statusOf(period, it) }
        val name = s.periodName(period.type)
        val sub = listOfNotNull(
            s.abhijit.takeIf { period.type == PeriodType.ABHIJIT },
            when (status) {
                RowStatus.DONE -> s.done
                RowStatus.NOW -> s.happeningNow
                RowStatus.UPCOMING -> s.inDuration(s.duration(period.start - minute!!))
                null -> null
            },
        ).joinToString(" · ").ifBlank { null }
        val enabled = period.type.reminderKind() in reminderTypes.map { it.reminderKind() }
        return timingRow(
            range(period), dotColor(period.type), name, sub, periodColor(period.type),
            highlight = status == RowStatus.NOW, struck = status == RowStatus.DONE,
            bell = if (status == RowStatus.DONE) null else (enabled to { onBellTapped(period.type) }),
        )
    }

    private fun range(p: DayPeriod): String {
        val a = formatMinute(p.start)
        val b = formatMinute(p.end)
        return if (a.takeLast(2) == b.takeLast(2)) "${a.dropLast(3)} – $b" else "$a – $b"
    }

    private fun timingRow(
        time: String, dotColor: Int, name: String, sub: String?, nameColor: Int,
        highlight: Boolean?, struck: Boolean, bell: Pair<Boolean, () -> Unit>?,
    ): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(10), dp(12), dp(4), dp(12))
        if (highlight == true) background = rounded(Accent.AMBER_BG, 12)
        addView(text(time, 14f, Kaalam.INK, bold = highlight == true), LinearLayout.LayoutParams(dp(112), LinearLayout.LayoutParams.WRAP_CONTENT))
        addView(dot(dotColor), LinearLayout.LayoutParams(dp(8), dp(8)).apply { marginStart = dp(8); marginEnd = dp(10) })
        addView(LinearLayout(this@ReadingActivity).apply {
            orientation = LinearLayout.VERTICAL
            addView(text(name, 17f, if (struck) Kaalam.INK_SOFT else nameColor, bold = !struck && nameColor != Kaalam.INK).apply {
                if (struck) paintFlags = paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            })
            sub?.let { addView(text(it, 12f, Kaalam.INK_SOFT)) }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        if (bell != null) {
            val (on, onTap) = bell
            addView(ImageView(this@ReadingActivity).apply {
                setImageResource(if (on) R.drawable.ic_bell else R.drawable.ic_bell_outline)
                setColorFilter(if (on) nameColor else Kaalam.INK_SOFT)
                setPadding(dp(10), dp(10), dp(10), dp(10))
                contentDescription = s.bellHint
                setOnClickListener { onTap() }
            }, LinearLayout.LayoutParams(dp(44), dp(44)))
        }
    }

    // --- Panchangam ----------------------------------------------------------

    private fun panchangamCard(r: RasiPalanResponse): LinearLayout = card().apply {
        val p = r.panchangam!!
        addView(LinearLayout(this@ReadingActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text(s.panchangam, 17f, Kaalam.MAROON, bold = true),
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            val year = if (language == AppLanguage.TAMIL) "${p.tamilYear} ஆண்டு" else "${p.tamilYear} year"
            addView(text(listOf(year, p.paksha.substringBefore(" (")).filter { it.isNotBlank() }.joinToString(" · "), 13f, Kaalam.INK_SOFT))
        })

        val spans = p.spans
        val rows = mutableListOf<Triple<String, String, String?>>()
        fun add(label: String, list: List<SpanInfo>?, fallback: String, extra: String? = null) {
            if (list.isNullOrEmpty()) {
                if (fallback.isNotBlank()) rows += Triple(label, fallback, extra)
                return
            }
            val first = list.first()
            val subs = list.zipWithNext { a, b -> a.until?.let { s.fromNext(it, b.name) } }.filterNotNull()
            rows += Triple(label, first.name, (subs + listOfNotNull(extra)).joinToString(" · ").ifBlank { null })
        }
        add(s.tithi, spans?.tithi, p.tithi)
        add(s.nakshatra, spans?.nakshatra, p.nakshatra)
        add(s.yogam, spans?.yogam, p.yogam)
        add(s.chandrashtamam, spans?.chandrashtamam, p.chandrashtamam, p.chandrashtamamStars.ifBlank { null })
        if (panchangamExpanded) {
            add(s.karanam, spans?.karanam, p.karanam)
            add(s.chandraRasi, spans?.chandraRasi, p.chandraRasi)
            rows += Triple(s.tamilDate, p.tamilDate, null)
        }
        rows.forEach { (label, value, sub) ->
            addView(LinearLayout(this@ReadingActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(text(label, 14f, Kaalam.INK_SOFT), LinearLayout.LayoutParams(dp(118), LinearLayout.LayoutParams.WRAP_CONTENT))
                addView(LinearLayout(this@ReadingActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(text(value, 16f, Kaalam.INK, bold = true))
                    sub?.let { addView(text(it, 12f, Kaalam.INK_SOFT)) }
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            }, matchWidth(dp(12)))
        }
        addView(pillButton(if (panchangamExpanded) s.lessPanchangam else s.fullPanchangam, filled = false) {
            panchangamExpanded = !panchangamExpanded
            response?.let { showResponse(it) }
        }, matchWidth(dp(16)))
    }

    // --- Footer --------------------------------------------------------------

    private fun addFooter(r: RasiPalanResponse?) {
        content.addView(languageToggle(language) { onLanguagePicked(it) }, cardParams(20))
        content.addView(text(tourStrings(language).replay, 14f, Kaalam.MAROON, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(10))
            setOnClickListener { replayTour() }
        }, cardParams(8))
        content.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(Kaalam.CARD, 12)
            setPadding(dp(14), dp(6), dp(8), dp(6))
            addView(text("🔒  ${s.lockScreenToggle}", 14f, Kaalam.INK),
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(android.widget.Switch(this@ReadingActivity).apply {
                isChecked = lockScreenOn
                setOnCheckedChangeListener { _, checked ->
                    lockScreenOn = checked
                    onLockScreenToggled(checked)
                }
            })
        }, cardParams(12))
        if (r != null) {
            content.addView(
                text(s.updatedPull(LocalTime.now(RasiPalanState.INDIA_ZONE).format(CLOCK)), 12f, Kaalam.INK_SOFT)
                    .apply { gravity = Gravity.CENTER },
                cardParams(14),
            )
        }
    }

    companion object {
        private const val EXTRA_RASI = "rasi"
        private const val EXTRA_DATE = "date"
        private const val STATE_DATE = "date"
        private const val TICK_MS = 30_000L
        private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)

        /** Today's calendar date in India (Panchangam days are IST days). */
        private fun today(): LocalDate = RasiPalanState.todayInIndia()

        fun intent(context: Context, rasi: Rasi, date: LocalDate? = null): Intent =
            Intent(context, ReadingActivity::class.java).putExtra(EXTRA_RASI, rasi.apiKey).apply {
                if (date != null) putExtra(EXTRA_DATE, date.toString())
            }
    }
}
