package com.kaalam.rasipalan.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kaalam.rasipalan.data.DayTimeline
import com.kaalam.rasipalan.data.RasiPalanState
import kotlinx.coroutines.launch
import java.time.ZonedDateTime

/**
 * Keeps the widget's "now / next" current without waking the phone.
 *
 * After every redraw, a *non-wakeup* alarm is set for the next period
 * boundary, or 5 minutes later, whichever is sooner. Non-wakeup alarms are
 * held while the screen is off and delivered as soon as the phone wakes, so
 * the widget is right whenever someone looks at it, at no battery cost while
 * asleep. Nothing is scheduled after sunset; the 00:10 daily refresh starts
 * the next day.
 */
object WidgetTicker {

    private const val MAX_INTERVAL_MS = 5 * 60_000L

    fun scheduleNext(context: Context, state: RasiPalanState) {
        val app = context.applicationContext
        val alarms = app.getSystemService(AlarmManager::class.java) ?: return
        val pending = pendingIntent(app)
        val timeline = state.timeline
        // Ticks keep the home-screen widget and the lock-screen summary current; neither shown -> no ticks.
        val needed = WidgetPinning.isPlaced(app) || (state.lockScreenSummary && state.hasData)
        if (timeline == null || state.isStale || !needed) {
            alarms.cancel(pending)
            return
        }
        val nextAt = nextTickMillis(timeline, ZonedDateTime.now(RasiPalanState.INDIA_ZONE)) ?: run {
            alarms.cancel(pending)
            return
        }
        alarms.setWindow(AlarmManager.RTC, nextAt, 30_000L, pending)
    }

    /** Epoch millis of the next redraw, or null when today has no more changes. */
    internal fun nextTickMillis(timeline: DayTimeline, now: ZonedDateTime): Long? {
        val minute = now.hour * 60 + now.minute
        val boundary = timeline.nextBoundaryAfter(minute) ?: return null
        val boundaryMs = now.toLocalDate().atStartOfDay(now.zone).plusMinutes(boundary.toLong()).toInstant().toEpochMilli()
        val nowMs = now.toInstant().toEpochMilli()
        // During the day the countdown also needs refreshing between boundaries.
        val inDay = minute >= timeline.sunrise && minute < timeline.sunset
        return if (inDay) minOf(boundaryMs, nowMs + MAX_INTERVAL_MS) else boundaryMs
    }

    fun cancel(context: Context) {
        context.applicationContext.getSystemService(AlarmManager::class.java)?.cancel(pendingIntent(context.applicationContext))
    }

    private fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context, 0, Intent(context, WidgetTickReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

/** Redraws the widget from the cache (no network); the redraw schedules the next tick. */
class WidgetTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        WidgetUpdater.scope.launch {
            try {
                WidgetUpdater.redrawAll(context.applicationContext)
            } finally {
                pending.finish()
            }
        }
    }
}
