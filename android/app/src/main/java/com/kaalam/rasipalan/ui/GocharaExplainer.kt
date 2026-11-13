package com.kaalam.rasipalan.ui

import android.app.Activity
import android.app.Dialog
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.Rasi
import com.kaalam.rasipalan.data.network.RasiPalanResponse
import com.kaalam.rasipalan.data.southChartCell
import com.kaalam.rasipalan.data.strings

/**
 * "How is this worked out?" for the Moon-transit (Chandra Gochara) reading:
 *
 *  1. a South Indian rasi chart with every sign numbered as a house counted
 *     from the reader's rasi (★ = house 1) and the Moon (☾) in its sign;
 *  2. the Moon's sign(s) today, with times, and which one decided the reading;
 *  3. the 12-house rule table with today's house highlighted;
 *  4. a short note on the method and its limits.
 */
fun Activity.showGocharaExplainer(r: RasiPalanResponse, rasi: Rasi, language: AppLanguage) {
    val basis = r.generated?.basis ?: return
    val s = strings(language)
    val tamil = language == AppLanguage.TAMIL
    val mine = rasi.ordinal
    val ruling = basis.moon.getOrNull(basis.ruling)
    val houseOf = { index: Int -> ((index - mine + 12) % 12) + 1 }
    val nameOf = { index: Int -> Rasi.entries[index].let { if (tamil) it.tamilName else it.transliteration } }
    val scoreColors = { score: Int ->
        when {
            score > 0 -> Kaalam.GREEN_BG to Kaalam.GREEN_FG
            score == -1 -> Accent.AMBER_BG to Accent.AMBER_FG
            else -> Kaalam.RED_BG to Kaalam.RED_FG
        }
    }

    val dialog = Dialog(this)
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
    val content = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(18), dp(18), dp(12))
        setBackgroundColor(Kaalam.PARCHMENT)
    }

    content.addView(text(s.howTitle, 20f, Kaalam.MAROON, bold = true))
    content.addView(text(s.howYourRasi(nameOf(mine)), 14f, Kaalam.INK_SOFT), matchWidth(dp(4)))

    // 1. The chart.
    val chartWidth = resources.displayMetrics.widthPixels - dp(18 * 2 + 32)
    val cell = chartWidth / 4
    content.addView(GridLayout(this).apply {
        columnCount = 4
        rowCount = 4
        for (index in 0 until 12) {
            val (row, column) = southChartCell(index)
            val house = houseOf(index)
            val moonHere = basis.moon.any { it.rasiIndex == index }
            val rulingHere = ruling?.rasiIndex == index
            addView(LinearLayout(this@showGocharaExplainer).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    setColor(
                        when {
                            rulingHere -> scoreColors(r.gochara.firstOrNull { it.house == house }?.score ?: 0).first
                            moonHere -> Kaalam.NEUTRAL_BG
                            else -> Accent.WHITE
                        },
                    )
                    setStroke(dp(if (index == mine) 2 else 1), if (index == mine) Kaalam.GOLD else Accent.DIVIDER)
                }
                addView(text(if (index == mine) "★ ${nameOf(index)}" else nameOf(index), 10f, Kaalam.INK_SOFT).apply {
                    gravity = Gravity.CENTER
                    maxLines = 1
                })
                addView(text("$house", 18f, if (rulingHere) Kaalam.MAROON else Kaalam.INK, bold = rulingHere).apply { gravity = Gravity.CENTER })
                if (moonHere) addView(text("☾", 14f, Kaalam.MAROON, bold = true).apply { gravity = Gravity.CENTER })
            }, GridLayout.LayoutParams(GridLayout.spec(row), GridLayout.spec(column)).apply {
                width = cell
                height = cell
            })
        }
        // Centre: the result.
        addView(LinearLayout(this@showGocharaExplainer).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply { setColor(Kaalam.CARD); setStroke(dp(1), Accent.DIVIDER) }
            setPadding(dp(6), dp(6), dp(6), dp(6))
            if (ruling != null) {
                addView(text("☾ → ${s.howHouse(ruling.house)}", 15f, Kaalam.MAROON, bold = true).apply { gravity = Gravity.CENTER })
                r.gochara.firstOrNull { it.house == ruling.house }?.let { row ->
                    val (bg, fg) = scoreColors(row.score)
                    addView(chip(row.summary, bg, fg), LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply { topMargin = dp(6) })
                }
            }
        }, GridLayout.LayoutParams(GridLayout.spec(1, 2), GridLayout.spec(1, 2)).apply {
            width = cell * 2
            height = cell * 2
        })
    }, LinearLayout.LayoutParams(chartWidth, chartWidth).apply { topMargin = dp(12); gravity = Gravity.CENTER_HORIZONTAL })
    content.addView(text(s.howChartCaption, 12f, Kaalam.INK_SOFT).apply { gravity = Gravity.CENTER }, matchWidth(dp(4)))

    // 2. The Moon today.
    basis.moon.forEachIndexed { i, span ->
        content.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(if (i == basis.ruling) Kaalam.CARD else Kaalam.PARCHMENT, 10)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            addView(text(s.howMoonIn(span.rasi.ifBlank { nameOf(span.rasiIndex) }, span.house, span.until), 15f, Kaalam.INK, bold = i == basis.ruling))
            if (i == basis.ruling && basis.moon.size > 1) addView(text(s.howDecides, 13f, Kaalam.MAROON, bold = true))
        }, matchWidth(dp(if (i == 0) 14 else 4)))
    }
    if (basis.moon.size > 1) content.addView(text(s.howMostOfDay, 13f, Kaalam.INK_SOFT), matchWidth(dp(6)))

    // 3. The rule table.
    content.addView(text(s.howTableTitle, 16f, Kaalam.MAROON, bold = true), matchWidth(dp(16)))
    r.gochara.forEach { row ->
        val today = row.house == ruling?.house
        val (bg, fg) = scoreColors(row.score)
        content.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(6), dp(10), dp(6))
            if (today) background = rounded(Kaalam.CARD, 10).apply { setStroke(dp(2), Kaalam.GOLD) }
            addView(text((if (today) "☾ " else "") + s.howHouse(row.house), 14f, Kaalam.INK, bold = today),
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(chip(row.summary, bg, fg))
        }, matchWidth(dp(2)))
    }

    // 4. The method.
    content.addView(text(s.howNote, 13f, Kaalam.INK_SOFT), matchWidth(dp(14)))
    content.addView(pillButton(s.close, filled = true) { dialog.dismiss() }, matchWidth(dp(14)))

    dialog.setContentView(ScrollView(this).apply { addView(content) })
    dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    dialog.show()
}
