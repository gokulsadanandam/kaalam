package com.kaalam.rasipalan.ui

import android.app.DatePickerDialog
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.util.TypedValue
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.Rasi
import com.kaalam.rasipalan.data.RasiPalanRepository
import com.kaalam.rasipalan.data.RasiPalanState
import com.kaalam.rasipalan.data.Strings
import com.kaalam.rasipalan.data.formatRange
import com.kaalam.rasipalan.data.gowriForSheet
import com.kaalam.rasipalan.data.morningEvening
import com.kaalam.rasipalan.data.network.PanchangamDayResponse
import com.kaalam.rasipalan.data.network.RasiPalanApi
import com.kaalam.rasipalan.data.rangeDots
import com.kaalam.rasipalan.data.clockDots
import com.kaalam.rasipalan.data.southChartCell
import com.kaalam.rasipalan.data.strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.abs

/**
 * A daily calendar sheet in the style of the Tamil tear-off calendars (the
 * Maha / Daily Thanthi sheets), redrawn for a phone: a spiral-bound pad, the
 * big coloured date, the ayanam / ruthu / month line, the Tamil date,
 * weekday and lunar-month boxes, the timings table (Nalla Neram, Gowri Nalla
 * Neram, Rahu, Kuligai, Yamagandam in morning and evening rows), soolam,
 * lagnam and chandrashtamam, the planets in a South Indian chart, and the
 * one-word rasi palan. ‹ › or a sideways swipe tears the page off; the date
 * opens a date picker; a rasi opens its full reading for that day.
 */
class CalendarActivity : ComponentActivity() {

    private lateinit var rasi: Rasi
    private lateinit var repository: RasiPalanRepository
    private var language = AppLanguage.DEFAULT
    private var date: LocalDate = RasiPalanState.todayInIndia()
    private val cache = mutableMapOf<String, PanchangamDayResponse>()

    private lateinit var headerTitle: TextView
    private lateinit var headerDate: TextView
    private lateinit var refresher: SwipeRefreshLayout
    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private var pad: View? = null
    private var loadJob: Job? = null
    private var animating = false

    private val s: Strings get() = strings(language)
    private val tamil: Boolean get() = language == AppLanguage.TAMIL

    private val swipe by lazy {
        GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                val start = e1 ?: return false
                val dx = e2.x - start.x
                val dy = e2.y - start.y
                if (abs(dx) < dp(90) || abs(dx) < 2 * abs(dy) || abs(velocityX) < 600) return false
                turnPage(if (dx < 0) 1 else -1)
                return true
            }
        })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        rasi = Rasi.fromApiKey(intent.getStringExtra(EXTRA_RASI))
        repository = RasiPalanRepository(applicationContext)
        (savedInstanceState?.getString(EXTRA_DATE) ?: intent.getStringExtra(EXTRA_DATE))
            ?.let { runCatching { date = LocalDate.parse(it) } }

        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(8), 0, dp(28))
            clipChildren = false
        }
        scroll = ScrollView(this).apply { addView(content) }
        refresher = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(Kaalam.MAROON)
            setOnRefreshListener { cache.remove(key(date)); load(0) }
            addView(scroll)
        }
        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                fitsSystemWindows = true
                setBackgroundColor(Desk.BACKGROUND)
                addView(buildHeader(), matchWidth())
                addView(refresher, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
            },
        )

        lifecycleScope.launch {
            language = repository.language()
            load(0)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(EXTRA_DATE, date.toString())
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        swipe.onTouchEvent(ev)
        return super.dispatchTouchEvent(ev)
    }

    // --- Header: ‹  title / date  › ------------------------------------------

    private fun buildHeader(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundColor(Kaalam.MAROON)
        setPadding(dp(6), dp(10), dp(6), dp(10))
        fun arrow(label: String, delta: Int, description: () -> String) = text(label, 30f, Kaalam.IVORY, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(dp(14), 0, dp(14), dp(4))
            contentDescription = description()
            setOnClickListener { turnPage(delta) }
        }
        addView(arrow("‹", -1) { s.previousDay })
        addView(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            headerTitle = text("", 13f, Kaalam.IVORY).apply { gravity = Gravity.CENTER }
            headerDate = text("", 19f, Kaalam.IVORY, bold = true).apply { gravity = Gravity.CENTER }
            addView(headerTitle, matchWidth())
            addView(headerDate, matchWidth())
            setOnClickListener { pickDate() }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        addView(arrow("›", 1) { s.nextDay })
    }

    private fun updateHeader() {
        headerTitle.text = s.dailyCalendar + if (date == RasiPalanState.todayInIndia()) " · ${s.today}" else ""
        headerDate.text = "${s.fullDate(date)}  ▾"
    }

    /** Tear the current page off (next day) or drop the previous one in, then load. */
    private fun turnPage(delta: Int) {
        val target = date.plusDays(delta.toLong())
        if (animating || target.year !in 1900..2100) return
        date = target
        val current = pad
        if (current == null) {
            load(delta)
            return
        }
        animating = true
        current.pivotX = if (delta > 0) 0f else current.width.toFloat()
        current.pivotY = 0f
        current.animate()
            .translationX(if (delta > 0) -current.width * 1.1f else current.width * 1.1f)
            .translationY(dp(40).toFloat())
            .rotation(if (delta > 0) -14f else 14f)
            .alpha(0f)
            .setDuration(260)
            .withEndAction {
                animating = false
                load(delta)
            }
            .start()
    }

    private fun pickDate() {
        DatePickerDialog(
            this,
            { _, year, month, day ->
                date = LocalDate.of(year, month + 1, day)
                load(0)
            },
            date.year, date.monthValue - 1, date.dayOfMonth,
        ).apply {
            datePicker.minDate = LocalDate.of(1900, 1, 1).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
            datePicker.maxDate = LocalDate.of(2100, 12, 31).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        }.show()
    }

    // --- Loading ---------------------------------------------------------------

    private fun key(day: LocalDate) = "$day|${language.code}"

    private fun load(direction: Int) {
        loadJob?.cancel()
        updateHeader()
        val requested = date
        cache[key(requested)]?.let { show(it, direction); return }
        loadJob = lifecycleScope.launch {
            showStatus(s.loading)
            refresher.isRefreshing = true
            try {
                val day = RasiPalanApi.fetchPanchangam(requested, language)
                cache[key(requested)] = day
                if (requested == date) show(day, direction)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val message = with(repository) { e.toUserMessage(language) }
                showStatus("⚠ $message\n\n${s.retryHint}")
            } finally {
                refresher.isRefreshing = false
            }
        }
    }

    /** Fetch the neighbouring days quietly, so turning a page is instant. */
    private fun prefetchAround(day: LocalDate) {
        lifecycleScope.launch {
            for (other in listOf(day.plusDays(1), day.minusDays(1))) {
                if (other.year !in 1900..2100 || cache.containsKey(key(other))) continue
                runCatching { RasiPalanApi.fetchPanchangam(other, language) }
                    .onSuccess { cache[key(other)] = it }
            }
        }
    }

    private fun showStatus(message: String) {
        pad = null
        content.removeAllViews()
        content.addView(text(message, 15f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER }, cardParams(48))
    }

    private fun show(d: PanchangamDayResponse, direction: Int) {
        content.removeAllViews()
        val newPad = buildPad(d)
        content.addView(newPad, cardParams(6))
        if (d.gowri.isNotEmpty()) content.addView(gowriTable(d), cardParams(18))
        content.addView(text(s.calendarNote, 12f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER }, cardParams(16))
        pad = newPad
        scroll.scrollTo(0, 0)
        if (direction != 0) {
            // The next page is revealed underneath; the previous one drops back on.
            newPad.alpha = 0f
            newPad.translationY = if (direction > 0) dp(10).toFloat() else -dp(60).toFloat()
            newPad.animate().alpha(1f).translationY(0f).setDuration(220).start()
        }
        prefetchAround(LocalDate.parse(d.date))
    }

    // --- The pad: binding, sheet, pages underneath ---------------------------------

    private fun buildPad(d: PanchangamDayResponse): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(BindingView(this@CalendarActivity), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(30)))
        addView(sheet(d), matchWidth())
        // Edges of the pages below, like a real pad.
        for ((inset, color) in listOf(dp(5) to Desk.PAGE_EDGE_1, dp(11) to Desk.PAGE_EDGE_2)) {
            addView(View(this@CalendarActivity).apply {
                background = GradientDrawable().apply {
                    setColor(color)
                    cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, dp(10).toFloat(), dp(10).toFloat(), dp(10).toFloat(), dp(10).toFloat())
                }
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(5)).apply {
                marginStart = inset
                marginEnd = inset
            })
        }
    }

    private fun sheet(d: PanchangamDayResponse): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable().apply {
            setColor(Desk.PAPER)
            cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, dp(10).toFloat(), dp(10).toFloat(), dp(10).toFloat(), dp(10).toFloat())
        }
        elevation = dp(3).toFloat()
        setPadding(dp(12), dp(6), dp(12), dp(14))

        addView(bigDate(), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(108)))
        introLine(d)?.let { addView(text(it, 13f, Kaalam.INK), matchWidth(dp(2))) }
        addView(dateBoxes(d), matchWidth(dp(10)))
        panchangamText(d)?.let { addView(boxed(text(it, 13f, Kaalam.INK)), matchWidth(dp(8))) }
        addView(timingsTable(d), matchWidth(dp(8)))
        addView(factsRow(d), matchWidth(dp(8)))
        if (d.calendar?.planets?.isNotEmpty() == true) addView(chart(d), matchWidth(dp(12)))
        addView(rasiPalan(d), matchWidth(dp(12)))
        myRasiStrip(d)?.let { addView(it, matchWidth(dp(12))) }
    }

    /** "12 ■ 11 ■ 2026" in tall serif numerals, coloured like the printed sheets. */
    private fun bigDate(): TextView = TextView(this).apply {
        val out = SpannableStringBuilder()
        fun part(value: String, color: Int) {
            val start = out.length
            out.append(value)
            out.setSpan(ForegroundColorSpan(color), start, out.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        fun separator() {
            val start = out.length
            out.append(" ■ ")
            out.setSpan(ForegroundColorSpan(Desk.CYAN), start, out.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            out.setSpan(RelativeSizeSpan(0.32f), start, out.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        part("%02d".format(date.dayOfMonth), Desk.RED)
        separator()
        part("%02d".format(date.monthValue), Desk.INDIGO)
        separator()
        part("${date.year}", Desk.GREEN)
        text = out
        typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
        textScaleX = 0.86f
        gravity = Gravity.CENTER
        maxLines = 1
        includeFontPadding = false
        setAutoSizeTextTypeUniformWithConfiguration(28, 150, 2, TypedValue.COMPLEX_UNIT_SP)
    }

    /** "தட்சிணாயனம். சரத் ருது. ஐப்பசி மாதம். கார்த்திகை வளர்பிறை." */
    private fun introLine(d: PanchangamDayResponse): String? {
        val c = d.calendar ?: return null
        val paksha = d.paksha.substringBefore(" (")
        return listOfNotNull(
            c.ayanam.ifBlank { null },
            c.ruthu.ifBlank { null },
            d.tamilMonth.ifBlank { null }?.let { "$it ${s.monthWord}" },
            c.lunarMonth.ifBlank { null }?.let { "$it $paksha".trim() },
        ).joinToString(". ", postfix = ".").takeIf { it.length > 1 }
    }

    /** Tamil date | month-weekday | lunar month and day count, as three boxes. */
    private fun dateBoxes(d: PanchangamDayResponse): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        val sunday = date.dayOfWeek == java.time.DayOfWeek.SUNDAY

        addView(boxed(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(LinearLayout(this@CalendarActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(text(if (tamil) "ஸ்ரீ ${d.tamilYear}" else d.tamilYear, 12f, Desk.GREEN, bold = true).apply { maxLines = 1 })
                addView(text(d.tamilMonth, 15f, Desk.MAGENTA, bold = true).apply { maxLines = 1 })
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(text(if (d.tamilDay > 0) "${d.tamilDay}" else "", 34f, Desk.RED, bold = true).apply {
                typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
                includeFontPadding = false
            })
        }), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1.15f))

        addView(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.VERTICAL
            background = border(Desk.PAPER)
            val month = date.month.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).uppercase(Locale.ENGLISH)
            val weekday = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).uppercase(Locale.ENGLISH)
            addView(text("$month - $weekday", 15f, Desk.INDIGO, bold = true).apply {
                gravity = Gravity.CENTER
                setBackgroundColor(Desk.YELLOW)
                setPadding(0, dp(4), 0, dp(4))
            }, matchWidth())
            addView(text(s.weekday(date.dayOfWeek), 20f, if (sunday) Desk.RED else Desk.INDIGO, bold = true).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(4), 0, dp(6))
                maxLines = 1
            }, matchWidth())
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1.1f).apply { marginStart = dp(6) })

        addView(boxed(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            d.calendar?.lunarMonth?.takeIf { it.isNotBlank() }?.let { addView(text(it, 13f, Desk.MAGENTA, bold = true)) }
            addView(text(d.paksha.substringBefore(" ("), 12f, Kaalam.INK))
            d.calendar?.takeIf { it.dayOfYear > 0 }?.let {
                addView(text("%d / %03d".format(it.dayOfYear, it.daysLeft), 14f, Kaalam.INK, bold = true))
            }
        }), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 0.95f).apply { marginStart = dp(6) })
    }

    /** Tithi, nakshatram, yogam, karanam and the Moon's change of sign, as one paragraph. */
    private fun panchangamText(d: PanchangamDayResponse): String? = listOfNotNull(
        d.tithi.ifBlank { null }?.let { "${s.tithi}: $it" },
        d.nakshatra.ifBlank { null }?.let { "${s.nakshatra}: $it" },
        d.yogam.ifBlank { null }?.let { "${s.yogam}: $it" },
        d.karanam.ifBlank { null }?.let { "${s.karanam}: $it" },
        d.moonChange?.takeIf { it.time.isNotBlank() }?.let { "${it.time} — ${it.text}" },
    ).joinToString(". ", postfix = ".").takeIf { it.length > 1 }

    // --- Timings table ----------------------------------------------------------------

    private fun timingsTable(d: PanchangamDayResponse): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = border(Desk.PAPER)
        val periods = d.timeline?.periods.orEmpty()
        fun range(type: String) = periods.firstOrNull { it.type == type }?.let { it.start to it.end }
        val (nallaMorning, nallaEvening) = morningEvening(periods.filter { it.type == "nallaNeram" }.map { it.start to it.end })
        val (gowriMorning, gowriEvening) = gowriForSheet(d.gowri)
        val rahu = range("rahuKalam")
        val kuligai = range("kuligai")
        val yama = range("yamagandam")
        val weights = floatArrayOf(1.45f, 1.35f, 0.8f, 0.8f, 0.95f)

        fun row(cells: List<View>) = LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            cells.forEachIndexed { i, cell ->
                addView(cell, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, weights[i]))
            }
        }
        fun header(label: String) = text(label, 11f, Kaalam.IVORY, bold = true).apply {
            gravity = Gravity.CENTER
            maxLines = 1
            setPadding(dp(2), dp(5), dp(2), dp(5))
            setBackgroundColor(Kaalam.MAROON)
        }
        fun cell(label: String?, value: String, bg: Int, fg: Int) = LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply { setColor(bg); setStroke(dp(1), Desk.RULE) }
            setPadding(dp(3), dp(6), dp(3), dp(6))
            label?.let { addView(text(it, 10f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER }) }
            addView(text(value.ifBlank { "—" }, 13f, fg, bold = true).apply { gravity = Gravity.CENTER })
        }
        fun ranges(list: List<Pair<Int, Int>>) = list.joinToString("\n") { rangeDots(it) }

        addView(row(listOf(
            header(s.nallaNeram), header(s.gowriShort), header(s.rahuKalam.substringBefore(' ')),
            header(s.kuligai), header(s.yamagandam),
        )), matchWidth())
        addView(row(listOf(
            cell(s.morningShort, ranges(nallaMorning), Desk.GREEN_TINT, Kaalam.GREEN_FG),
            cell(s.morningShort, gowriMorning?.let { rangeDots(it) }.orEmpty(), Desk.GREEN_TINT, Kaalam.GREEN_FG),
            cell(null, rahu?.let { clockDots(it.first) }.orEmpty(), Desk.RED_TINT, Kaalam.RED_FG),
            cell(null, kuligai?.let { clockDots(it.first) }.orEmpty(), Desk.AMBER_TINT, Accent.AMBER_FG),
            cell(null, yama?.let { clockDots(it.first) }.orEmpty(), Desk.RED_TINT, Kaalam.RED_FG),
        )), matchWidth())
        addView(row(listOf(
            cell(s.eveningShort, ranges(nallaEvening), Desk.GREEN_TINT, Kaalam.GREEN_FG),
            cell(s.eveningShort, gowriEvening?.let { rangeDots(it) }.orEmpty(), Desk.GREEN_TINT, Kaalam.GREEN_FG),
            cell(null, rahu?.let { clockDots(it.second) }.orEmpty(), Desk.RED_TINT, Kaalam.RED_FG),
            cell(null, kuligai?.let { clockDots(it.second) }.orEmpty(), Desk.AMBER_TINT, Accent.AMBER_FG),
            cell(null, yama?.let { clockDots(it.second) }.orEmpty(), Desk.RED_TINT, Kaalam.RED_FG),
        )), matchWidth())
    }

    /** Soolam / parigaram, lagnam, chandrashtamam; then sunrise and sunset. */
    private fun factsRow(d: PanchangamDayResponse): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        fun fact(title: String, line1: String, line2: String, titleColor: Int) = boxed(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            addView(text(title, 11f, titleColor, bold = true).apply { gravity = Gravity.CENTER })
            if (line1.isNotBlank()) addView(text(line1, 13f, Kaalam.INK, bold = true).apply { gravity = Gravity.CENTER })
            if (line2.isNotBlank()) addView(text(line2, 12f, Kaalam.INK).apply { gravity = Gravity.CENTER })
        })
        val c = d.calendar
        addView(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            val cells = listOfNotNull(
                c?.soolam?.let { fact("${s.soolam} · ${s.parigaram}", it.direction, it.remedy, Desk.RED) },
                c?.lagna?.let { fact(s.lagnam, it.name, s.until(it.until), Desk.INDIGO) },
                d.chandrashtamam.takeIf { it.isNotBlank() }?.let {
                    fact(s.chandrashtamam, it, d.chandrashtamamStars, Desk.MAGENTA)
                },
            )
            cells.forEachIndexed { i, v ->
                addView(v, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply { if (i > 0) marginStart = dp(6) })
            }
        }, matchWidth())
        addView(boxed(text("${s.sunrise} ${d.sunrise}   ·   ${s.sunset} ${d.sunset}", 13f, Kaalam.INK, bold = true).apply {
            gravity = Gravity.CENTER
        }), matchWidth(dp(6)))
    }

    // --- Planets in a South Indian chart ----------------------------------------------

    private fun chart(d: PanchangamDayResponse): GridLayout = GridLayout(this).apply {
        columnCount = 4
        rowCount = 4
        val size = (resources.displayMetrics.widthPixels - dp(16 * 2 + 12 * 2)) / 4
        val planets = d.calendar!!.planets
        val moonRasi = planets.firstOrNull { it.key == "moon" }?.rasiIndex
        for (index in 0 until 12) {
            val (row, column) = southChartCell(index)
            val here = planets.filter { it.rasiIndex == index }
            val mine = Rasi.entries[index] == rasi
            addView(LinearLayout(this@CalendarActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    setColor(if (index == moonRasi) Desk.GREEN_TINT else Desk.PAPER)
                    setStroke(dp(if (mine) 2 else 1), if (mine) Kaalam.GOLD else Desk.RULE)
                }
                setPadding(dp(2), dp(2), dp(2), dp(2))
                val name = Rasi.entries[index].let { if (tamil) it.tamilName else it.transliteration }
                addView(text(if (mine) "★ $name" else name, 9f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER; maxLines = 1 })
                if (here.isNotEmpty()) {
                    addView(text(
                        here.joinToString(" ") { p ->
                            p.name + if (p.retrograde && p.key != "rahu" && p.key != "ketu") s.retroMark else ""
                        },
                        12f, Desk.INDIGO, bold = true,
                    ).apply { gravity = Gravity.CENTER })
                }
            }, GridLayout.LayoutParams(GridLayout.spec(row), GridLayout.spec(column)).apply {
                width = size
                height = size
            })
        }
        addView(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply { setColor(Desk.YELLOW_SOFT); setStroke(dp(1), Desk.RULE) }
            addView(text(s.planetChart, 16f, Kaalam.MAROON, bold = true).apply { gravity = Gravity.CENTER })
            addView(text("${s.atSunrise} · ${d.sunrise}", 11f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER })
            d.calendar?.lagna?.let { addView(text("${s.lagnam}: ${it.name}", 12f, Kaalam.INK).apply { gravity = Gravity.CENTER }) }
        }, GridLayout.LayoutParams(GridLayout.spec(1, 2), GridLayout.spec(1, 2)).apply {
            width = size * 2
            height = size * 2
        })
    }

    // --- Rasi palan column, and my rasi's line --------------------------------------------

    private fun rasiPalan(d: PanchangamDayResponse): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = border(Desk.PAPER)
        addView(text(s.rasiPalanTitle, 18f, Kaalam.IVORY, bold = true).apply {
            gravity = Gravity.CENTER
            setBackgroundColor(Desk.RED)
            setPadding(0, dp(5), 0, dp(5))
        }, matchWidth())
        val entries = d.rasiPalan.mapNotNull { item -> item.generated?.let { Rasi.fromApiKey(item.rasi) to it } }
        // The daily calendar's own words when its sheet was read (in English when chosen and known); otherwise the Moon-transit summary.
        val sheetWords = if (tamil) d.sheet?.words.orEmpty() else d.sheet?.english.orEmpty().filterValues { !it.isNullOrBlank() }.mapValues { it.value!! }
        // Two columns read top-down like the printed list: Mesham..Kanni, Thulam..Meenam.
        val half = (entries.size + 1) / 2
        for (i in 0 until half) {
            addView(LinearLayout(this@CalendarActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                listOfNotNull(entries.getOrNull(i), entries.getOrNull(i + half)).forEachIndexed { column, (r, g) ->
                    val sheetWord = sheetWords[r.apiKey]
                    val color = when {
                        sheetWord != null -> Desk.INDIGO
                        g.score > 0 -> Kaalam.GREEN_FG
                        g.score == -1 -> Accent.AMBER_FG
                        else -> Kaalam.RED_FG
                    }
                    val mine = r == rasi
                    val name = if (tamil) r.tamilName else r.transliteration
                    addView(text("", 14f, Kaalam.INK).apply {
                        text = SpannableStringBuilder().apply {
                            append(if (mine) "★ $name" else name, ForegroundColorSpan(Desk.RED), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            append(" - ")
                            append(sheetWord ?: g.summary, ForegroundColorSpan(color), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        }
                        if (mine) {
                            setTypeface(typeface, Typeface.BOLD)
                            background = GradientDrawable().apply { setColor(Kaalam.IVORY); setStroke(dp(2), Kaalam.GOLD); cornerRadius = dp(6).toFloat() }
                        }
                        maxLines = 1
                        setPadding(dp(8), dp(7), dp(4), dp(7))
                        setOnClickListener { startActivity(ReadingActivity.intent(this@CalendarActivity, r, date)) }
                    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        if (column == 1) marginStart = dp(4)
                    })
                }
            }, matchWidth())
        }
        addView(text(s.tapRasiHint, 11f, Kaalam.INK_SOFT).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(2), 0, dp(6))
        }, matchWidth())
    }

    /** The yellow strip at the foot of the sheet: my rasi's headline for the day. */
    private fun myRasiStrip(d: PanchangamDayResponse): TextView? {
        val g = d.rasiPalan.firstOrNull { it.rasi == rasi.apiKey }?.generated ?: return null
        if (g.headline.isBlank()) return null
        val name = if (tamil) rasi.tamilName else rasi.transliteration
        return text("★ $name: ${g.headline}", 14f, Desk.RED, bold = true).apply {
            gravity = Gravity.CENTER
            setBackgroundColor(Desk.YELLOW)
            setPadding(dp(8), dp(8), dp(8), dp(8))
            setOnClickListener { startActivity(ReadingActivity.intent(this@CalendarActivity, rasi, date)) }
        }
    }

    // --- Gowri Panchangam (below the pad) ------------------------------------------------

    private fun gowriTable(d: PanchangamDayResponse): LinearLayout = card().apply {
        addView(text(s.gowriPanchangam, 17f, Kaalam.MAROON, bold = true))
        addView(LinearLayout(this@CalendarActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            listOf("day" to s.dayPart, "night" to s.nightPart).forEachIndexed { i, (part, label) ->
                addView(LinearLayout(this@CalendarActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(text(label, 13f, Kaalam.INK_SOFT, bold = true))
                    d.gowri.filter { it.part == part }.forEach { slot ->
                        addView(LinearLayout(this@CalendarActivity).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER_VERTICAL
                            background = rounded(if (slot.good) Kaalam.GREEN_BG else Kaalam.NEUTRAL_BG, 8)
                            setPadding(dp(8), dp(5), dp(8), dp(5))
                            addView(text(slot.name, 13f, if (slot.good) Kaalam.GREEN_FG else Kaalam.INK_SOFT, bold = slot.good),
                                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                            addView(text(formatRange(slot.start, slot.end), 11f, if (slot.good) Kaalam.GREEN_FG else Kaalam.INK_SOFT))
                        }, matchWidth(dp(4)))
                    }
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (i == 1) marginStart = dp(8)
                })
            }
        }, matchWidth(dp(8)))
    }

    // --- Helpers --------------------------------------------------------------------------

    private fun border(fill: Int) = GradientDrawable().apply {
        setColor(fill)
        setStroke(dp(1), Desk.RULE)
    }

    private fun boxed(view: View): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        background = border(Desk.PAPER)
        setPadding(dp(8), dp(6), dp(8), dp(6))
        addView(view, matchWidth())
    }

    /** Sheet colours: the printed calendar's red, indigo, green and yellow, softened. */
    private object Desk {
        val BACKGROUND = Color.parseColor("#EFE3CA")
        val PAPER = Color.parseColor("#FFFDF7")
        val PAGE_EDGE_1 = Color.parseColor("#F3ECDD")
        val PAGE_EDGE_2 = Color.parseColor("#E6DCC6")
        val RULE = Color.parseColor("#D9C9A8")
        val RED = Color.parseColor("#C0392B")
        val INDIGO = Color.parseColor("#3B1F78")
        val GREEN = Color.parseColor("#1E8449")
        val MAGENTA = Color.parseColor("#8E2C7A")
        val CYAN = Color.parseColor("#1BA1D6")
        val YELLOW = Color.parseColor("#FFE45C")
        val YELLOW_SOFT = Color.parseColor("#FFF6C7")
        val GREEN_TINT = Color.parseColor("#E7F4E4")
        val RED_TINT = Color.parseColor("#FBE7E2")
        val AMBER_TINT = Color.parseColor("#FBF0DA")
    }

    /** The spiral binding across the top of the pad. */
    private class BindingView(context: Context) : View(context) {
        private val band = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Kaalam.MAROON }
        private val hole = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#3A1015") }
        private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#B8B2A7")
            style = Paint.Style.STROKE
        }
        private val rect = RectF()

        override fun onDraw(canvas: Canvas) {
            val w = width.toFloat()
            val h = height.toFloat()
            val r = h * 0.18f
            rect.set(0f, h * 0.35f, w, h)
            canvas.drawRoundRect(rect, h * 0.3f, h * 0.3f, band)
            canvas.drawRect(0f, h * 0.7f, w, h, band)
            ring.strokeWidth = h * 0.09f
            val count = maxOf(6, (w / (h * 1.1f)).toInt())
            val gap = w / count
            for (i in 0 until count) {
                val cx = gap * (i + 0.5f)
                val cy = h * 0.68f
                canvas.drawCircle(cx, cy, r, hole)
                rect.set(cx - r * 0.9f, h * 0.06f, cx + r * 0.9f, cy + r * 0.2f)
                canvas.drawArc(rect, 180f, 180f, false, ring)
                canvas.drawLine(cx - r * 0.9f, rect.centerY(), cx - r * 0.9f, cy, ring)
            }
        }
    }

    companion object {
        private const val EXTRA_RASI = "rasi"
        private const val EXTRA_DATE = "date"

        fun intent(context: Context, rasi: Rasi, date: LocalDate): Intent =
            Intent(context, CalendarActivity::class.java)
                .putExtra(EXTRA_RASI, rasi.apiKey)
                .putExtra(EXTRA_DATE, date.toString())
    }
}
