package com.kaalam.rasipalan.ui

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.Strings
import com.kaalam.rasipalan.data.strings
import com.kaalam.rasipalan.widget.WidgetPinning

/** Fixed almanac palette shared by the app screens (mirrors the widget's light theme). */
object Kaalam {
    val MAROON = Color.parseColor("#7A1F2B")
    val IVORY = Color.parseColor("#FFF8EE")
    val GOLD = Color.parseColor("#C59B2A")
    val PARCHMENT = Color.parseColor("#F6EBD3")
    val CARD = Color.parseColor("#FBF4E6")
    val INK = Color.parseColor("#2E1F17")
    val INK_SOFT = Color.parseColor("#6A5442")
    val GREEN_BG = Color.parseColor("#DCEFD6")
    val GREEN_FG = Color.parseColor("#113A1B")
    val RED_BG = Color.parseColor("#F8DAD2")
    val RED_FG = Color.parseColor("#65170D")
    val NEUTRAL_BG = Color.parseColor("#EDDDBE")
    val ERROR = Color.parseColor("#A8321F")
}

fun Activity.dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

fun Activity.text(
    value: CharSequence,
    sizeSp: Float = 15f,
    color: Int = Kaalam.INK,
    bold: Boolean = false,
): TextView = TextView(this).apply {
    text = value
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(color)
    if (bold) setTypeface(typeface, Typeface.BOLD)
    setLineSpacing(0f, 1.15f)
}

fun Activity.rounded(color: Int, radiusDp: Int = 12) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radiusDp).toFloat()
}

/** Vertical card with padding and a rounded background. */
fun Activity.card(background: Int = Kaalam.CARD): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    this.background = rounded(background)
    setPadding(dp(16), dp(14), dp(16), dp(14))
}

fun matchWidth(topMarginPx: Int = 0) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT,
).apply { topMargin = topMarginPx }

/**
 * Container for the "Add widget to home screen" button. Call
 * [refreshAddWidgetButton] from onResume: the button hides once a widget is
 * placed, and launchers that cannot pin from an app get instructions instead.
 */
fun Activity.addWidgetContainer(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
}

fun Activity.refreshAddWidgetButton(box: LinearLayout, s: Strings) {
    box.removeAllViews()
    if (WidgetPinning.isPlaced(this)) {
        box.visibility = View.GONE
        return
    }
    box.visibility = View.VISIBLE
    if (WidgetPinning.canRequestPin(this)) {
        box.addView(
            pillButton(s.addWidget, filled = true) { WidgetPinning.requestPin(this) },
            matchWidth(),
        )
    } else {
        box.addView(text(s.addWidgetManual, 13f, Kaalam.INK_SOFT), matchWidth())
    }
}

/** Rounded button: filled maroon, or outlined on parchment. */
fun Activity.pillButton(label: String, filled: Boolean, onClick: () -> Unit): Button = Button(this).apply {
    text = label
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    setTextColor(if (filled) Kaalam.IVORY else Kaalam.MAROON)
    background = GradientDrawable().apply {
        setColor(if (filled) Kaalam.MAROON else Kaalam.CARD)
        setStroke(dp(2), Kaalam.MAROON)
        cornerRadius = dp(24).toFloat()
    }
    stateListAnimator = null
    setPadding(dp(16), dp(8), dp(16), dp(8))
    setOnClickListener { onClick() }
}

/** "மொழி  [தமிழ்] [English]": the selected language is filled. */
fun Activity.languageToggle(current: AppLanguage, onSelect: (AppLanguage) -> Unit): LinearLayout =
    LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(text(strings(current).language, 14f, Kaalam.INK_SOFT, bold = true),
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { marginEnd = dp(12) })
        for ((language, label) in listOf(AppLanguage.TAMIL to "தமிழ்", AppLanguage.ENGLISH to "English")) {
            addView(
                pillButton(label, filled = language == current) { if (language != current) onSelect(language) },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(6) },
            )
        }
    }

// -----------------------------------------------------------------------------
// Redesign helpers
// -----------------------------------------------------------------------------

/** Extra colours used by the redesign. */
object Accent {
    val MAROON_DARK = Color.parseColor("#5A1520")
    val AMBER_BG = Color.parseColor("#F3E3C3")
    val AMBER_FG = Color.parseColor("#8A5A12")
    val AMBER_DOT = Color.parseColor("#C98A1B")
    val GREEN_DOT = Color.parseColor("#2E8B57")
    val RED_DOT = Color.parseColor("#C9483B")
    val GREY_DOT = Color.parseColor("#A8998A")
    val DIVIDER = Color.parseColor("#E6D8BF")
    val WHITE = Color.parseColor("#FFFDF8")
}

/** Full-width layout params with horizontal margins (cards on the parchment). */
fun Activity.cardParams(topDp: Int = 12): LinearLayout.LayoutParams = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT,
).apply { setMargins(dp(16), dp(topDp), dp(16), 0) }

/** Rounded pill label, e.g. the tone chip "நலம்". */
fun Activity.chip(label: String, background: Int, foreground: Int): TextView =
    text(label, 13f, foreground, bold = true).apply {
        this.background = rounded(background, 14)
        setPadding(dp(12), dp(4), dp(12), dp(4))
    }

/** Bold every occurrence of [words] inside [full]. */
fun boldWords(full: String, vararg words: String): CharSequence {
    val out = android.text.SpannableString(full)
    for (word in words) {
        if (word.isBlank()) continue
        var index = full.indexOf(word)
        while (index >= 0) {
            out.setSpan(android.text.style.StyleSpan(Typeface.BOLD), index, index + word.length, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            index = full.indexOf(word, index + word.length)
        }
    }
    return out
}

/** One option of a [segmented] control: label, optional second line, enabled. */
data class Segment(val label: String, val sub: String? = null, val enabled: Boolean = true)

/**
 * Segmented control. [onDark] styles it for the maroon header (ivory text,
 * the selected option filled ivory); otherwise for a card (beige track,
 * selected option white). [selected] may be -1 for none.
 */
fun Activity.segmented(options: List<Segment>, selected: Int, onDark: Boolean, onSelect: (Int) -> Unit): LinearLayout =
    LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        background = rounded(if (onDark) Accent.MAROON_DARK else Kaalam.NEUTRAL_BG, 14)
        setPadding(dp(4), dp(4), dp(4), dp(4))
        options.forEachIndexed { index, option ->
            val isSelected = index == selected
            val fg = when {
                isSelected -> Kaalam.MAROON
                onDark -> Kaalam.IVORY
                else -> Kaalam.INK_SOFT
            }
            addView(
                LinearLayout(this@segmented).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                    setPadding(dp(6), dp(8), dp(6), dp(8))
                    if (isSelected) background = rounded(if (onDark) Kaalam.PARCHMENT else Accent.WHITE, 11)
                    addView(text(option.label, 15f, fg, bold = isSelected).apply { gravity = Gravity.CENTER })
                    option.sub?.let { addView(text(it, 11f, fg).apply { gravity = Gravity.CENTER }) }
                    alpha = if (option.enabled) 1f else 0.55f
                    if (option.enabled) setOnClickListener { if (!isSelected) onSelect(index) }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f),
            )
        }
    }

/** Small coloured dot (status / period markers). */
fun Activity.dot(color: Int, sizeDp: Int = 8): View = View(this).apply {
    background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }
    layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
}
