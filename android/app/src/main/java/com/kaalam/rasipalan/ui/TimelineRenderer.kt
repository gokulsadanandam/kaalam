package com.kaalam.rasipalan.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import com.kaalam.rasipalan.data.DayTimeline
import com.kaalam.rasipalan.data.PeriodType

/**
 * Sunrise → sunset bar: Rahu Kalam / Yamagandam red, Kuligai amber, Nalla
 * Neram green, with a marker at the current minute. One drawing routine for
 * the app ([TimelineView]) and the widget ([TimelineRenderer.bitmap]).
 */
object TimelineRenderer {

    val BAD = Color.parseColor("#C9483B")
    val KULIGAI = Color.parseColor("#D9A441")
    val GOOD = Color.parseColor("#2E8B57")

    fun colorOf(type: PeriodType): Int = when (type) {
        PeriodType.RAHU_KALAM, PeriodType.YAMAGANDAM -> BAD
        PeriodType.KULIGAI -> KULIGAI
        PeriodType.NALLA_NERAM, PeriodType.ABHIJIT -> GOOD
    }

    fun draw(canvas: Canvas, width: Float, height: Float, timeline: DayTimeline, nowMinute: Int?, track: Int, marker: Int) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val markerWidth = height * 0.35f
        val barTop = height * 0.2f
        val barBottom = height * 0.8f
        val radius = (barBottom - barTop) / 2
        val left = markerWidth
        val right = width - markerWidth
        val span = (timeline.sunset - timeline.sunrise).coerceAtLeast(1).toFloat()
        val x = { minute: Int -> left + (right - left) * ((minute - timeline.sunrise).coerceIn(0, span.toInt()) / span) }

        paint.color = track
        canvas.drawRoundRect(RectF(left, barTop, right, barBottom), radius, radius, paint)

        // Least important first, so overlaps show the period that matters most.
        timeline.periods.sortedByDescending { it.type.priority }.forEach { period ->
            if (period.end <= timeline.sunrise || period.start >= timeline.sunset) return@forEach
            paint.color = colorOf(period.type)
            canvas.drawRect(x(period.start), barTop, x(period.end), barBottom, paint)
        }

        if (nowMinute != null && nowMinute in timeline.sunrise..timeline.sunset) {
            paint.color = marker
            val cx = x(nowMinute)
            canvas.drawRoundRect(RectF(cx - markerWidth / 2, 0f, cx + markerWidth / 2, height), markerWidth / 2, markerWidth / 2, paint)
        }
    }

    /** Widget version: a bitmap of [widthPx] × [heightPx]. */
    fun bitmap(widthPx: Int, heightPx: Int, timeline: DayTimeline, nowMinute: Int?, track: Int, marker: Int): Bitmap =
        Bitmap.createBitmap(widthPx.coerceAtLeast(1), heightPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888).also {
            draw(Canvas(it), widthPx.toFloat(), heightPx.toFloat(), timeline, nowMinute, track, marker)
        }
}

/** App version of the timeline bar. */
class TimelineView(context: Context) : View(context) {
    var timeline: DayTimeline? = null
        set(value) { field = value; invalidate() }
    var nowMinute: Int? = null
        set(value) { field = value; invalidate() }

    override fun onDraw(canvas: Canvas) {
        val t = timeline ?: return
        TimelineRenderer.draw(canvas, width.toFloat(), height.toFloat(), t, nowMinute, Kaalam.NEUTRAL_BG, Kaalam.INK)
    }
}
