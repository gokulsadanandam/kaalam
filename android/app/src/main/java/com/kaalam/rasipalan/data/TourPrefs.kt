package com.kaalam.rasipalan.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import kotlinx.coroutines.flow.first

/**
 * The screens that have a first-visit tour, each with its own version.
 * Raise a screen's [version] when its tour changes enough to show again to
 * people who have already seen it (e.g. a major new feature on that screen).
 */
enum class TourScreen(val key: String, val version: Int) {
    PICKER("picker", 1),
    READING("reading", 1),
    CALENDAR("calendar", 1);

    /** Last tour version completed or skipped on this screen; absent = never. */
    internal val prefKey get() = intPreferencesKey("tour_version_$key")

    companion object {
        /** True when the version last seen is older than the current tour. */
        fun needsTour(seenVersion: Int?, currentVersion: Int): Boolean = (seenVersion ?: 0) < currentVersion
    }
}

/** Whether [screen]'s tour should start automatically. A DataStore read error counts as "already seen". */
suspend fun Context.shouldShowTour(screen: TourScreen): Boolean =
    runCatching { rasiDataStore.data.first()[screen.prefKey] }
        .fold({ TourScreen.needsTour(it, screen.version) }, { false })

/** Record that [screen]'s current tour was finished or skipped. */
suspend fun Context.markTourSeen(screen: TourScreen) {
    runCatching { rasiDataStore.edit { it[screen.prefKey] = screen.version } }
}

/** "Replay the app tour": every screen's tour shows again on its next visit. */
suspend fun Context.resetTours() {
    runCatching { rasiDataStore.edit { prefs -> TourScreen.entries.forEach { prefs.remove(it.prefKey) } } }
}
