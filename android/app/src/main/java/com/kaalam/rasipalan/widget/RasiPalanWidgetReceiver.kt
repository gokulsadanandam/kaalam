package com.kaalam.rasipalan.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.util.Log
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.kaalam.rasipalan.data.RasiPalanRepository
import com.kaalam.rasipalan.data.readRasiPalanState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Entry point for system-driven updates.
 *
 * The launcher/system sends `APPWIDGET_UPDATE` when a widget is placed and
 * then every `updatePeriodMillis` (4 h, see `rasi_palan_widget_info.xml`).
 * Those periodic broadcasts are *not* wake-ups: if the device is asleep, the
 * update is delivered when it next wakes, so the widget adds no wakelocks or
 * alarms of its own — the core of the zero-battery-drain design.
 *
 * Pipeline per broadcast:
 *   1. goAsync()            keep the receiver alive past onUpdate's return
 *   2. redraw(ids)          paint instantly from the DataStore cache
 *   3. refresh(force=false) network only if the cache is stale (≥3 h, new day,
 *                           fallback text, or different rasi)
 *   4. redrawAll()          paint the fresh data
 *   5. finish()             release the broadcast
 */
class RasiPalanWidgetReceiver : GlanceAppWidgetReceiver() {

    override val glanceAppWidget: GlanceAppWidget = RasiPalanWidget()

    /**
     * Intentionally does NOT call `super.onUpdate`: the default implementation
     * calls `goAsync()` itself, and a broadcast can only be made async once
     * (a second `goAsync()` returns null). We take ownership of the async
     * window and do both the render and the refresh inside it.
     */
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        DailyRefresh.ensureScheduled(appContext)

        WidgetUpdater.scope.launch {
            try {
                // Step 2: show whatever we have right away (works offline).
                WidgetUpdater.redraw(appContext, appWidgetIds)

                // Step 3: bounded network refresh. A broadcast receiver gets
                // roughly 10 s; leave headroom for the redraw afterwards.
                val result = withTimeoutOrNull(NETWORK_BUDGET_MS) {
                    RasiPalanRepository(appContext).refresh(force = false)
                }
                Log.d(TAG, "Periodic refresh result: ${result ?: "timed out"}")

                // Step 4: redraw all instances (not just the IDs in this
                // broadcast) so every copy of the widget stays consistent.
                WidgetUpdater.redrawAll(appContext)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Widget update pipeline failed", e)
            } finally {
                // Step 5: always release, or the system logs an ANR.
                pendingResult.finish()
            }
        }
    }

    /** Last widget removed: stop the daily refresh and ticker, unless the lock-screen summary still needs them. */
    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        val app = context.applicationContext
        val pending = goAsync()
        WidgetUpdater.scope.launch {
            try {
                if (!app.readRasiPalanState().lockScreenSummary) {
                    DailyRefresh.cancel(app)
                    WidgetTicker.cancel(app)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        const val TAG = "RasiPalanReceiver"
        const val NETWORK_BUDGET_MS = 8_500L
    }
}
