package com.kaalam.rasipalan.widget

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.kaalam.rasipalan.data.RasiPalanState
import com.kaalam.rasipalan.data.readRasiPalanState
import java.time.Duration
import java.time.LocalTime
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * Makes the widget follow the calendar day. The system's own widget update
 * runs only every 4 hours, so without this the widget could show yesterday's
 * reading until ~4 AM. Two runs a day (IST):
 *
 *   00:10  the new day's reading (generated until the newspapers publish)
 *   07:00  the newspaper reading (published ~5:45–6:40 AM)
 *
 * Each run schedules the next one. WorkManager survives reboots and app
 * updates, waits for a network connection, and may run a little late in Doze.
 */
object DailyRefresh {

    private const val WORK_NAME = "kaalam-daily-refresh"

    /** IST times of day to refresh at, ascending. */
    internal val SLOTS: List<LocalTime> = listOf(LocalTime.of(0, 10), LocalTime.of(7, 0))

    /** Schedule the next run unless one is already pending. Safe to call often. */
    fun ensureScheduled(context: Context) = enqueue(context, ExistingWorkPolicy.KEEP)

    /** No widgets left: stop refreshing in the background. */
    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    /** Time from [now] until the next slot (strictly in the future). */
    internal fun delayUntilNextSlot(now: ZonedDateTime): Duration {
        val next = SLOTS.map { now.with(it) }.firstOrNull { it.isAfter(now) }
            ?: now.plusDays(1).with(SLOTS.first())
        return Duration.between(now, next)
    }

    internal fun enqueue(context: Context, policy: ExistingWorkPolicy) {
        val delay = delayUntilNextSlot(ZonedDateTime.now(RasiPalanState.INDIA_ZONE))
        val request = OneTimeWorkRequestBuilder<DailyRefreshWorker>()
            .setInitialDelay(delay.toMillis(), TimeUnit.MILLISECONDS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, policy, request)
    }
}

class DailyRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        // force = false: no network if the cache is already today's, fresh and from the newspaper.
        val state = applicationContext.readRasiPalanState()
        if (WidgetPinning.isPlaced(applicationContext) || state.lockScreenSummary) {
            WidgetUpdater.refreshAndRedraw(applicationContext, force = false)
        }
        // Chain the next run after this one finishes (REPLACE would cancel this run).
        DailyRefresh.enqueue(applicationContext, ExistingWorkPolicy.APPEND_OR_REPLACE)
        return Result.success()
    }
}
