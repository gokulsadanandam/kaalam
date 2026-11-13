package com.kaalam.rasipalan.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

/** "Add widget to home screen" support for the app screens. */
object WidgetPinning {

    private fun provider(context: Context) = ComponentName(context, RasiPalanWidgetReceiver::class.java)

    /** True once at least one copy of the widget is on a home screen. */
    fun isPlaced(context: Context): Boolean =
        AppWidgetManager.getInstance(context).getAppWidgetIds(provider(context)).isNotEmpty()

    /** Whether the current launcher can add the widget from inside the app (Android 8+). */
    fun canRequestPin(context: Context): Boolean =
        AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported

    /**
     * Ask the launcher to place the widget; it shows its own confirmation.
     * The system then sends APPWIDGET_UPDATE, so the widget fills itself.
     */
    fun requestPin(context: Context): Boolean =
        AppWidgetManager.getInstance(context).requestPinAppWidget(provider(context), null, null)
}
