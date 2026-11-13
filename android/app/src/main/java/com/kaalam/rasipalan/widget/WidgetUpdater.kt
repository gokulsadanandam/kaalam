package com.kaalam.rasipalan.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.kaalam.rasipalan.data.RasiPalanRepository
import com.kaalam.rasipalan.data.readRasiPalanState
import com.kaalam.rasipalan.reminders.LockScreenSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Glue between "data changed" and "widget redrawn".
 */
object WidgetUpdater {

    /**
     * Process-wide scope for widget work that must outlive a single caller
     * (e.g. the picker activity finishing while a refresh is in flight).
     * SupervisorJob: one failed refresh never cancels its siblings.
     */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Redraw every placed instance of the widget from the local cache.
     *
     * Functionally this is `RasiPalanWidget().updateAll(context)`, but it
     * resolves widget IDs straight from [AppWidgetManager] instead of Glance's
     * internal receiver registry. That registry is only populated when
     * `GlanceAppWidgetReceiver.onUpdate` runs its default implementation —
     * which our receiver overrides — so `updateAll` could otherwise silently
     * find zero widgets on a fresh install.
     */
    suspend fun redrawAll(context: Context) {
        val ids = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, RasiPalanWidgetReceiver::class.java))
        redraw(context, ids)
        val state = context.readRasiPalanState()
        LockScreenSummary.update(context, state)
        WidgetTicker.scheduleNext(context, state)
    }

    /** Redraw specific instances (used by the receiver for the IDs it was given). */
    suspend fun redraw(context: Context, appWidgetIds: IntArray) {
        if (appWidgetIds.isEmpty()) return
        val glanceManager = GlanceAppWidgetManager(context)
        val widget = RasiPalanWidget()
        for (appWidgetId in appWidgetIds) {
            widget.update(context, glanceManager.getGlanceIdBy(appWidgetId))
        }
    }

    /**
     * Network refresh + redraw. The redraw happens even if the refresh fails,
     * so the widget reflects the cleared "updating…" flag and any error text.
     */
    suspend fun refreshAndRedraw(context: Context, force: Boolean): RasiPalanRepository.RefreshResult {
        val result = RasiPalanRepository(context).refresh(force)
        redrawAll(context)
        return result
    }
}
