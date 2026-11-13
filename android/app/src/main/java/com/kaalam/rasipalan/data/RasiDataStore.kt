package com.kaalam.rasipalan.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.kaalam.rasipalan.data.network.RasiPalanApi
import com.kaalam.rasipalan.data.network.TimelineInfo
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException

/**
 * Process-wide singleton DataStore backed by
 * `files/datastore/rasi_palan_cache.preferences_pb`.
 *
 * `preferencesDataStore` guarantees a single instance per file per process,
 * which DataStore requires (two instances on one file would corrupt it). The
 * widget, the action callbacks, the receiver and the picker activity all
 * share this one instance through the `Context` extension.
 *
 * If the file is ever corrupted we simply start from an empty cache — the
 * next refresh repopulates it, which is the right trade-off for cached data.
 */
val Context.rasiDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "rasi_palan_cache",
    corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
)

/** Every key persisted for the widget, in one place. */
object RasiPrefsKeys {
    /** What the user picked ("my rasi"). Survives across days and refreshes; absent until first chosen. */
    val SELECTED_RASI = stringPreferencesKey("selected_rasi")

    /** [AppLanguage.code] chosen in the app; absent means Tamil. */
    val LANGUAGE = stringPreferencesKey("language")

    /** Which rasi and language the cached reading below belongs to. */
    val CACHED_RASI = stringPreferencesKey("cached_rasi")
    val CACHED_LANGUAGE = stringPreferencesKey("cached_language")
    val PREDICTION = stringPreferencesKey("prediction")
    val NALLA_NERAM = stringPreferencesKey("nalla_neram")
    val RAHU_KALAM = stringPreferencesKey("rahu_kalam")
    val READING_DATE = stringPreferencesKey("reading_date")
    val WEEKDAY_TAMIL = stringPreferencesKey("weekday_tamil")
    val IS_FALLBACK = booleanPreferencesKey("is_fallback")
    /** [PredictionOrigin.key] of the cached text; absent in caches written by v1.0. */
    val PREDICTION_ORIGIN = stringPreferencesKey("prediction_origin")
    /** Redesign fields (absent in older caches; the widget then shows the simpler layout). */
    val HEADLINE = stringPreferencesKey("headline")
    val CHANDRASHTAMAM_TEXT = stringPreferencesKey("chandrashtamam_text")
    val CHANDRASHTAMAM_STATE = stringPreferencesKey("chandrashtamam_state")
    val TAMIL_DAY = stringPreferencesKey("tamil_day")
    /** [com.kaalam.rasipalan.data.network.TimelineInfo] as JSON. */
    val TIMELINE_JSON = stringPreferencesKey("timeline_json")

    /** [PeriodType.key]s with daily reminders on. */
    val REMINDER_TYPES = stringSetPreferencesKey("reminder_types")
    /** Lock-screen summary notification on/off; absent means on. */
    val LOCK_SCREEN_SUMMARY = booleanPreferencesKey("lock_screen_summary")
    /** The day's one-word reading (daily calendar word, else computed summary), in the cached language. */
    val DAY_WORD = stringPreferencesKey("day_word")
    val LAST_UPDATED = longPreferencesKey("last_updated_millis")

    /**
     * Start time of the in-flight refresh, or absent if none. Stored as a
     * timestamp rather than a boolean so a refresh interrupted by process
     * death can never leave the widget stuck on "updating…" forever.
     */
    val REFRESH_STARTED = longPreferencesKey("refresh_started_millis")
    val LAST_ERROR = stringPreferencesKey("last_error")
}

/** A refresh older than this is considered abandoned (process killed mid-flight). */
private const val REFRESH_STALE_AFTER_MS = 60_000L

/**
 * Map raw preferences to the UI model.
 *
 * If the cached reading belongs to a different rasi or language than the one
 * selected (user just switched), we deliberately show an empty state instead
 * of the old text under the new title.
 */
fun Preferences.toRasiPalanState(nowMillis: Long = System.currentTimeMillis()): RasiPalanState {
    val selected = Rasi.fromApiKey(this[RasiPrefsKeys.SELECTED_RASI])
    val language = AppLanguage.fromCode(this[RasiPrefsKeys.LANGUAGE])
    val refreshStarted = this[RasiPrefsKeys.REFRESH_STARTED] ?: 0L
    val isRefreshing = refreshStarted > 0L && nowMillis - refreshStarted < REFRESH_STALE_AFTER_MS
    val lastError = this[RasiPrefsKeys.LAST_ERROR]
    val lockScreenSummary = this[RasiPrefsKeys.LOCK_SCREEN_SUMMARY] ?: true

    val cachedRasi = this[RasiPrefsKeys.CACHED_RASI]
    val cachedLanguage = AppLanguage.fromCode(this[RasiPrefsKeys.CACHED_LANGUAGE]) // v1.0 caches were Tamil
    if (cachedRasi != selected.apiKey || cachedLanguage != language) {
        return RasiPalanState.empty(selected, language, isRefreshing, lastError, lockScreenSummary)
    }

    val isFallback = this[RasiPrefsKeys.IS_FALLBACK] ?: false
    return RasiPalanState(
        rasi = selected,
        language = language,
        prediction = this[RasiPrefsKeys.PREDICTION].orEmpty(),
        nallaNeram = this[RasiPrefsKeys.NALLA_NERAM] ?: "—",
        rahuKalam = this[RasiPrefsKeys.RAHU_KALAM] ?: "—",
        readingDate = this[RasiPrefsKeys.READING_DATE].orEmpty(),
        weekdayTamil = this[RasiPrefsKeys.WEEKDAY_TAMIL].orEmpty(),
        lastUpdatedMillis = this[RasiPrefsKeys.LAST_UPDATED] ?: 0L,
        isFallback = isFallback,
        origin = PredictionOrigin.fromKey(this[RasiPrefsKeys.PREDICTION_ORIGIN])
            ?: if (isFallback) PredictionOrigin.FALLBACK else PredictionOrigin.SCRAPED,
        isRefreshing = isRefreshing,
        lastError = lastError,
        headline = this[RasiPrefsKeys.HEADLINE].orEmpty(),
        chandrashtamamText = this[RasiPrefsKeys.CHANDRASHTAMAM_TEXT].orEmpty(),
        chandrashtamamState = this[RasiPrefsKeys.CHANDRASHTAMAM_STATE] ?: "none",
        tamilDay = this[RasiPrefsKeys.TAMIL_DAY].orEmpty(),
        timeline = decodeTimeline(this[RasiPrefsKeys.TIMELINE_JSON]),
        reminderTypes = reminderTypes(),
        dayWord = this[RasiPrefsKeys.DAY_WORD].orEmpty(),
        lockScreenSummary = lockScreenSummary,
    )
}

private fun decodeTimeline(json: String?): DayTimeline? = json?.let {
    runCatching { DayTimeline.from(RasiPalanApi.json.decodeFromString(TimelineInfo.serializer(), it)) }.getOrNull()
}

fun Preferences.reminderTypes(): Set<PeriodType> =
    this[RasiPrefsKeys.REMINDER_TYPES].orEmpty().mapNotNull { PeriodType.fromKey(it) }.toSet()

/**
 * Raw preferences with I/O errors downgraded to "empty cache". Any other
 * exception is a programming error and is rethrown.
 */
private val Context.safePreferences: Flow<Preferences>
    get() = rasiDataStore.data.catch { error ->
        if (error is IOException) emit(emptyPreferences()) else throw error
    }

/** Continuous stream of widget state; emits on every cache write. */
val Context.rasiPalanStateFlow: Flow<RasiPalanState>
    get() = safePreferences.map { it.toRasiPalanState() }.distinctUntilChanged()

/** One-shot read of the current widget state (local disk only). */
suspend fun Context.readRasiPalanState(): RasiPalanState = safePreferences.first().toRasiPalanState()

/** True once the user has picked their rasi (first launch shows the picker). */
suspend fun Context.hasChosenRasi(): Boolean = safePreferences.first()[RasiPrefsKeys.SELECTED_RASI] != null
