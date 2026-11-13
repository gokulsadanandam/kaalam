package com.kaalam.rasipalan.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

/**
 * Tap handlers. Glance runs `onAction` in a background coroutine, so suspend
 * work (DataStore + network) is safe here. These are the only paths that
 * force a network call regardless of cache freshness — they're explicit
 * user intent.
 */

/** ⟳ button or empty-state tap: refetch the current rasi now. */
class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        WidgetUpdater.refreshAndRedraw(context, force = true)
    }
}
