package com.kaalam.rasipalan.reminders

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.kaalam.rasipalan.MainActivity
import com.kaalam.rasipalan.R
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.PeriodType
import com.kaalam.rasipalan.data.RasiPalanState
import com.kaalam.rasipalan.data.formatMinute
import com.kaalam.rasipalan.data.readRasiPalanState
import com.kaalam.rasipalan.data.reminderKind
import com.kaalam.rasipalan.data.strings
import com.kaalam.rasipalan.widget.DailyRefresh
import com.kaalam.rasipalan.widget.WidgetUpdater
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * Daily reminders 5 minutes before Rahu Kalam, Nalla Neram, etc.
 *
 * Alarms come from today's cached timeline, so they are rescheduled whenever
 * today's reading is fetched (app, widget, 00:10 daily refresh), when a bell
 * is toggled, and after a reboot. Exact alarms when the system allows them,
 * otherwise inexact ones that still fire in Doze (may be a few minutes late).
 */
object Reminders {

    const val CHANNEL_ID = "timing_reminders"
    private const val MAX_ALARMS = 12
    private const val LEAD_MS = 5 * 60_000L

    private const val EXTRA_TYPE = "type"
    private const val EXTRA_START = "start"
    private const val EXTRA_END = "end"
    private const val EXTRA_LANG = "lang"

    suspend fun reschedule(context: Context) {
        val app = context.applicationContext
        val alarms = app.getSystemService(AlarmManager::class.java) ?: return
        for (slot in 0 until MAX_ALARMS) alarms.cancel(pendingIntent(app, slot, Intent(app, ReminderReceiver::class.java)))

        val state = app.readRasiPalanState()
        val timeline = state.timeline ?: return
        if (state.reminderTypes.isEmpty() || state.isStale || state.readingDate.isBlank()) return
        val day = runCatching { LocalDate.parse(state.readingDate) }.getOrNull() ?: return
        val midnight = day.atStartOfDay(RasiPalanState.INDIA_ZONE).toInstant().toEpochMilli()
        val now = System.currentTimeMillis()
        val wanted = state.reminderTypes.map { it.reminderKind() }.toSet()

        timeline.periods
            .filter { it.type.reminderKind() in wanted }
            .map { it to midnight + it.start * 60_000L }
            .filter { (_, startMs) -> startMs > now }
            .sortedBy { it.second }
            .take(MAX_ALARMS)
            .forEachIndexed { slot, (period, startMs) ->
                val intent = Intent(app, ReminderReceiver::class.java)
                    .putExtra(EXTRA_TYPE, period.type.key)
                    .putExtra(EXTRA_START, period.start)
                    .putExtra(EXTRA_END, period.end)
                    .putExtra(EXTRA_LANG, state.language.code)
                val at = maxOf(startMs - LEAD_MS, now + 1_000)
                val pending = pendingIntent(app, slot, intent)
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
                    alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
                } else {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
                }
            }
    }

    private fun pendingIntent(context: Context, slot: Int, intent: Intent): PendingIntent =
        PendingIntent.getBroadcast(context, slot, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun ensureChannel(context: Context, language: AppLanguage) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, strings(language).reminderChannel, NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    internal fun notify(context: Context, intent: Intent) {
        if (!canNotify(context)) return
        val type = PeriodType.fromKey(intent.getStringExtra(EXTRA_TYPE).orEmpty()) ?: return
        val language = AppLanguage.fromCode(intent.getStringExtra(EXTRA_LANG))
        val s = strings(language)
        val start = intent.getIntExtra(EXTRA_START, 0)
        val end = intent.getIntExtra(EXTRA_END, 0)
        ensureChannel(context, language)

        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_bell)
            .setContentTitle(s.reminderTitle(s.periodName(type)))
            .setContentText("${formatMinute(start)} – ${formatMinute(end)}")
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(type.ordinal * 10_000 + start, notification)
        } catch (_: SecurityException) {
            // Permission revoked between the check and the call.
        }
    }
}

/** Fires 5 minutes before a period starts. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Reminders.notify(context, intent)
    }
}

/** Alarms do not survive a reboot or app update: restore reminders, the daily refresh and the widget ticker. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val pending = goAsync()
        val app = context.applicationContext
        WidgetUpdater.scope.launch {
            try {
                DailyRefresh.ensureScheduled(app)
                Reminders.reschedule(app)
                WidgetUpdater.redrawAll(app) // also schedules the next widget tick
            } finally {
                pending.finish()
            }
        }
    }
}
