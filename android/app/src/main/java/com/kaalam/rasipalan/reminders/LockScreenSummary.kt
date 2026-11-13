package com.kaalam.rasipalan.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.kaalam.rasipalan.MainActivity
import com.kaalam.rasipalan.R
import com.kaalam.rasipalan.data.DayTimeline
import com.kaalam.rasipalan.data.NowState
import com.kaalam.rasipalan.data.RasiPalanState
import com.kaalam.rasipalan.data.Strings
import com.kaalam.rasipalan.data.formatMinute
import com.kaalam.rasipalan.data.strings
import java.time.LocalTime

/**
 * Today's summary on the lock screen, as one silent, ongoing notification:
 *
 *   விருச்சிகம் · எதிர்ப்பு
 *   இப்போது: ராகு காலம் 2:46 PM வரை · அடுத்து: நல்ல நேரம் 4:45 PM
 *
 * Phones cannot host app widgets on the lock screen, so this is how the
 * widget's "now / next" reaches it. Low importance: no sound, no vibration, no
 * heads-up; public visibility so it is readable while locked. It is redrawn
 * with the widget (every refresh and every widget tick: period boundaries,
 * and every 5 minutes in the day, delivered when the phone wakes), and removed
 * when turned off, when notifications are not allowed, or when today's
 * reading is not cached.
 */
object LockScreenSummary {

    const val CHANNEL_ID = "daily_summary"
    private const val NOTIFICATION_ID = 7_000_001

    fun update(context: Context, state: RasiPalanState) {
        val app = context.applicationContext
        val manager = NotificationManagerCompat.from(app)
        if (!state.lockScreenSummary || !state.hasData || state.isStale || !Reminders.canNotify(app)) {
            manager.cancel(NOTIFICATION_ID)
            return
        }
        val s = strings(state.language)
        app.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, s.lockScreenChannel, NotificationManager.IMPORTANCE_LOW).apply {
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                setShowBadge(false)
            },
        )

        val title = listOf(state.rasi.displayName(state.language), state.dayWord).filter { it.isNotBlank() }.joinToString(" · ")
        val line = state.timeline?.let { nowLine(it, DayTimeline.minuteOf(LocalTime.now(RasiPalanState.INDIA_ZONE)), s) }.orEmpty()
        val details = listOf(line, state.headline, state.chandrashtamamText.takeIf { state.chandrashtamamState != "none" }.orEmpty())
            .filter { it.isNotBlank() }
            .joinToString("\n")

        val open = PendingIntent.getActivity(
            app, 1, Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_sun)
            .setContentTitle(title)
            .setContentText(line.ifBlank { state.headline })
            .setStyle(NotificationCompat.BigTextStyle().bigText(details))
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        try {
            manager.notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // Notification permission revoked between the check and the call.
        }
    }

    /** "இப்போது: ராகு காலம் 2:46 PM வரை · அடுத்து: நல்ல நேரம் 4:45 PM" */
    internal fun nowLine(timeline: DayTimeline, minute: Int, s: Strings): String {
        val now = timeline.nowAt(minute)
        val current = when (now.phase) {
            NowState.Phase.PERIOD -> s.periodName(now.current!!.type)
            NowState.Phase.NORMAL -> s.normalTime
            NowState.Phase.BEFORE_SUNRISE -> s.beforeSunrise
            NowState.Phase.AFTER_SUNSET -> s.afterSunset
        }
        val until = now.untilMinute?.takeIf { now.phase == NowState.Phase.PERIOD || now.phase == NowState.Phase.NORMAL }
        val nowPart = "${s.now}: $current" + (until?.let { " ${s.until(formatMinute(it))}" } ?: "")
        val nextPart = now.nextGood?.let { "${s.next}: ${s.periodName(it.type)} ${formatMinute(it.start)}" }
        return listOfNotNull(nowPart, nextPart).joinToString(" · ")
    }
}
