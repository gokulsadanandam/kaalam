package com.kaalam.rasipalan

import android.app.Activity
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.Rasi
import com.kaalam.rasipalan.data.RasiPalanRepository
import com.kaalam.rasipalan.data.RasiPalanState
import com.kaalam.rasipalan.data.TourScreen
import com.kaalam.rasipalan.data.hasChosenRasi
import com.kaalam.rasipalan.data.matches
import com.kaalam.rasipalan.data.stars
import com.kaalam.rasipalan.data.strings
import com.kaalam.rasipalan.data.tourStrings
import com.kaalam.rasipalan.ui.Accent
import com.kaalam.rasipalan.ui.Kaalam
import com.kaalam.rasipalan.ui.ReadingActivity
import com.kaalam.rasipalan.ui.dp
import com.kaalam.rasipalan.ui.matchWidth
import com.kaalam.rasipalan.ui.rounded
import com.kaalam.rasipalan.ui.text
import com.kaalam.rasipalan.ui.tour.AppTour
import com.kaalam.rasipalan.ui.tour.TourStep
import com.kaalam.rasipalan.widget.DailyRefresh
import com.kaalam.rasipalan.widget.WidgetUpdater
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Entry point and rasi picker.
 *
 *  - Launcher: once "my rasi" is saved, goes straight to today's reading for
 *    it. On first launch (or from the rasi name on the today screen) shows the
 *    picker: a searchable grid with each rasi's nakshatra padas, a birth-details
 *    finder, and a "Continue" button that saves the rasi (the widget follows).
 *  - Widget configuration (`APPWIDGET_CONFIGURE`): the same picker, opened by
 *    the launcher's "reconfigure" option. The widget is declared
 *    `configuration_optional`, so on Android 12+ it is placed immediately.
 *
 * Built with plain framework views so the app ships no Compose UI runtime
 * beyond what Glance already needs.
 */
class MainActivity : ComponentActivity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private val isConfiguringWidget get() = appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
    private lateinit var repository: RasiPalanRepository
    private lateinit var root: LinearLayout
    private var language = AppLanguage.DEFAULT
    private var selected: Rasi? = null
    private var query = ""
    private lateinit var grid: LinearLayout
    private lateinit var continueButton: TextView
    private var languageChip: View? = null
    private var searchBox: View? = null
    private var birthLink: View? = null
    private var resumeTourAt = -1

    private val tour by lazy { AppTour(this, TourScreen.PICKER, { language }, ::tourSteps) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        resumeTourAt = savedInstanceState?.getInt(AppTour.STATE_STEP, -1) ?: -1
        repository = RasiPalanRepository(applicationContext)
        DailyRefresh.ensureScheduled(applicationContext)

        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        // Configuration contract: if the user backs out, report CANCELED.
        if (isConfiguringWidget) setResult(Activity.RESULT_CANCELED, resultIntent())

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            fitsSystemWindows = true // edge-to-edge is mandatory from API 35/36
            setBackgroundColor(Kaalam.PARCHMENT)
        }
        setContentView(root)

        val choosing = isConfiguringWidget || intent.getBooleanExtra(EXTRA_CHOOSE, false)
        lifecycleScope.launch {
            val chosen = applicationContext.hasChosenRasi()
            if (!choosing && chosen) {
                startActivity(ReadingActivity.intent(this@MainActivity, repository.selectedRasi()))
                finish()
                return@launch
            }
            language = repository.language()
            selected = if (chosen) repository.selectedRasi() else null
            buildPicker()
        }
    }

    // ---------------------------------------------------------------------
    // Picker
    // ---------------------------------------------------------------------

    private fun buildPicker() {
        val s = strings(language)
        root.removeAllViews()

        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(16))
        }
        // Language switch, top right.
        page.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            val other = if (language == AppLanguage.TAMIL) AppLanguage.ENGLISH else AppLanguage.TAMIL
            addView(text(if (other == AppLanguage.ENGLISH) "English" else "தமிழ்", 14f, Kaalam.MAROON, bold = true).apply {
                background = rounded(Accent.WHITE, 16)
                setPadding(dp(14), dp(6), dp(14), dp(6))
                setOnClickListener { onLanguagePicked(other) }
            }.also { languageChip = it })
        }, matchWidth())
        page.addView(text(s.pickerTitle, 32f, Kaalam.MAROON, bold = true), matchWidth(dp(8)))
        page.addView(text(s.pickerSubtitle, 16f, Kaalam.INK_SOFT), matchWidth(dp(8)))

        page.addView(EditText(this).apply {
            searchBox = this
            hint = "🔍  ${s.searchHint}"
            setText(query)
            setSingleLine()
            textSize = 16f
            setTextColor(Kaalam.INK)
            setHintTextColor(Kaalam.INK_SOFT)
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Accent.WHITE)
                setStroke(dp(1), Accent.DIVIDER)
                cornerRadius = dp(16).toFloat()
            }
            setPadding(dp(18), dp(14), dp(18), dp(14))
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) = Unit
                override fun afterTextChanged(editable: Editable?) {
                    query = editable?.toString().orEmpty()
                    fillGrid()
                }
            })
        }, matchWidth(dp(18)))

        grid = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        page.addView(grid, matchWidth(dp(8)))
        fillGrid()

        page.addView(text(s.dontKnowRasi, 15f, Kaalam.MAROON).apply {
            paintFlags = paintFlags or Paint.UNDERLINE_TEXT_FLAG
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(8))
            setOnClickListener { findFromBirthDetails() }
        }.also { birthLink = it }, matchWidth(dp(20)))

        root.addView(ScrollView(this).apply { addView(page) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        continueButton = text("", 19f, Kaalam.IVORY, bold = true).apply {
            gravity = Gravity.CENTER
            background = rounded(Kaalam.MAROON, 20)
            setPadding(dp(16), dp(18), dp(16), dp(18))
            setOnClickListener { selected?.let { onContinue(it) } }
        }
        root.addView(continueButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            .apply { setMargins(dp(20), dp(8), dp(20), dp(16)) })
        updateContinue()
        tour.startIfNeeded(resumeTourAt)
        resumeTourAt = -1
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        tour.saveState(outState)
    }

    /** First-visit tour of the picker. */
    private fun tourSteps(): List<TourStep> {
        val t = tourStrings(language)
        return listOf(
            TourStep(t.pickerLanguage) { languageChip },
            TourStep(t.pickerSearch) { searchBox },
            TourStep(t.pickerGrid) { grid.getChildAt(0) },
            TourStep(t.pickerBirth) { birthLink },
            TourStep(t.pickerContinue) { continueButton },
        )
    }

    private fun fillGrid() {
        val s = strings(language)
        grid.removeAllViews()
        val shown = Rasi.entries.filter { it.matches(query) }
        if (shown.isEmpty()) {
            grid.addView(text(s.noMatches, 15f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER }, matchWidth(dp(24)))
            return
        }
        shown.chunked(2).forEach { pair ->
            grid.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                pair.forEachIndexed { index, rasi ->
                    addView(rasiCard(rasi), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply {
                        if (index == 1) marginStart = dp(12)
                    })
                }
                if (pair.size == 1) addView(LinearLayout(this@MainActivity), LinearLayout.LayoutParams(0, 1, 1f).apply { marginStart = dp(12) })
            }, matchWidth(dp(12)))
        }
    }

    private fun rasiCard(rasi: Rasi): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        val isSelected = rasi == selected
        val fg = if (isSelected) Kaalam.IVORY else Kaalam.INK
        val soft = if (isSelected) Kaalam.IVORY else Kaalam.INK_SOFT
        background = android.graphics.drawable.GradientDrawable().apply {
            setColor(if (isSelected) Kaalam.MAROON else Accent.WHITE)
            if (!isSelected) setStroke(dp(1), Accent.DIVIDER)
            cornerRadius = dp(16).toFloat()
        }
        setPadding(dp(14), dp(14), dp(14), dp(16))
        val name = if (language == AppLanguage.TAMIL) rasi.tamilName else rasi.transliteration
        addView(LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text(name, 21f, fg, bold = true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(text(rasi.englishName, 13f, soft))
        })
        addView(text(rasi.stars.label(language), 13f, soft), matchWidth(dp(6)))
        setOnClickListener {
            selected = rasi
            fillGrid()
            updateContinue()
        }
    }

    private fun updateContinue() {
        val rasi = selected
        val s = strings(language)
        continueButton.text = rasi?.let { s.continueWith(if (language == AppLanguage.TAMIL) it.tamilName else it.transliteration) }
            ?: s.pickerTitle
        continueButton.alpha = if (rasi != null) 1f else 0.5f
        continueButton.isEnabled = rasi != null
    }

    private fun onLanguagePicked(chosen: AppLanguage) {
        language = chosen
        buildPicker()
        lifecycleScope.launch {
            repository.setLanguage(chosen)
            WidgetUpdater.scope.launch { WidgetUpdater.refreshAndRedraw(applicationContext, force = true) }
        }
    }

    private fun onContinue(rasi: Rasi) {
        lifecycleScope.launch {
            repository.selectRasi(rasi)
            // Instantly show the new rasi name with a loading body on all widgets.
            WidgetUpdater.redrawAll(applicationContext)

            if (isConfiguringWidget) {
                // Fetch in the process scope so it survives this activity finishing.
                WidgetUpdater.scope.launch {
                    WidgetUpdater.refreshAndRedraw(applicationContext, force = true)
                }
                setResult(Activity.RESULT_OK, resultIntent())
            } else {
                // The today screen fetches, updates the cache and redraws the widget.
                startActivity(ReadingActivity.intent(this@MainActivity, rasi))
            }
            finish()
        }
    }

    // ---------------------------------------------------------------------
    // "Don't know your rasi?" — birth date and time → janma rasi
    // ---------------------------------------------------------------------

    private fun findFromBirthDetails() {
        val s = strings(language)
        val today = RasiPalanState.todayInIndia()
        DatePickerDialog(this, { _, year, month, day ->
            val date = LocalDate.of(year, month + 1, day)
            TimePickerDialog(this, { _, hour, minute -> lookUp(date, hour, minute) }, 6, 0, false).apply {
                setTitle(s.birthTimeTitle)
            }.show()
        }, 1990, 0, 1).apply {
            setTitle(s.birthDateTitle)
            datePicker.minDate = LocalDate.of(1900, 1, 1).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
            datePicker.maxDate = today.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        }.show()
    }

    private fun lookUp(date: LocalDate, hour: Int, minute: Int) {
        val s = strings(language)
        lifecycleScope.launch {
            try {
                val result = repository.findBirthRasi(date, hour, minute)
                val rasi = Rasi.fromApiKey(result.rasi)
                val name = if (language == AppLanguage.TAMIL) rasi.tamilName else rasi.displayName(language)
                val message = s.birthResult(name, result.nakshatra, result.pada) +
                    if (result.nearRasiEdge) "\n\n${s.birthEdgeNote}" else ""
                AlertDialog.Builder(this@MainActivity)
                    .setMessage(message)
                    .setPositiveButton(s.useThisRasi) { _, _ ->
                        selected = rasi
                        query = ""
                        buildPicker()
                    }
                    .setNegativeButton(s.cancel, null)
                    .show()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, with(repository) { e.toUserMessage(language) }, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun resultIntent() = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

    companion object {
        private const val EXTRA_CHOOSE = "choose_rasi"

        /** Open the picker to change "my rasi" (instead of jumping to the reading). */
        fun chooseRasiIntent(context: Context): Intent =
            Intent(context, MainActivity::class.java).putExtra(EXTRA_CHOOSE, true)
    }
}
