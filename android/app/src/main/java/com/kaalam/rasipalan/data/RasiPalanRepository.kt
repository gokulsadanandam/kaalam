package com.kaalam.rasipalan.data

import android.content.Context
import android.util.Log
import androidx.datastore.preferences.core.edit
import com.kaalam.rasipalan.data.network.RasiPalanApi
import com.kaalam.rasipalan.data.network.RasiPalanResponse
import com.kaalam.rasipalan.data.network.TimelineInfo
import com.kaalam.rasipalan.reminders.Reminders
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.LocalDate

/**
 * The only class that talks to both the network and the cache.
 *
 *   network (Ktor) ──► validate ──► DataStore.edit { ... } ──► widget recomposes
 *
 * The widget UI never calls this; it only observes the DataStore. Callers
 * (receiver, action callbacks, picker) call [refresh] and then ask
 * [com.kaalam.rasipalan.widget.WidgetUpdater] to redraw.
 */
class RasiPalanRepository(
    context: Context,
    private val api: RasiPalanApi = RasiPalanApi,
) {
    private val appContext = context.applicationContext
    private val store get() = appContext.rasiDataStore

    sealed interface RefreshResult {
        /** Network call succeeded and the cache now holds fresh data. */
        data object Updated : RefreshResult
        /** Cache was already fresh enough; no network call was made. */
        data object SkippedFresh : RefreshResult
        /** Another refresh was already running; this call did nothing. */
        data object SkippedBusy : RefreshResult
        /** Network or parsing failed; previous cache is left intact. */
        data class Failed(val error: Throwable) : RefreshResult
    }

    suspend fun selectedRasi(): Rasi = appContext.readRasiPalanState().rasi

    suspend fun language(): AppLanguage = appContext.readRasiPalanState().language

    /** Persist the user's choice ("my rasi"). The widget immediately shows an empty/loading state for it. */
    suspend fun selectRasi(rasi: Rasi) {
        store.edit { prefs ->
            prefs[RasiPrefsKeys.SELECTED_RASI] = rasi.apiKey
            prefs.remove(RasiPrefsKeys.LAST_ERROR)
        }
    }

    /** Persist the display language. The cached reading no longer matches, so the widget shows loading until [refresh]. */
    suspend fun setLanguage(language: AppLanguage) {
        store.edit { prefs ->
            prefs[RasiPrefsKeys.LANGUAGE] = language.code
            prefs.remove(RasiPrefsKeys.LAST_ERROR)
        }
    }

    /** Daily reminder before every period of [type]'s kind (Abhijit counts as Nalla Neram). */
    suspend fun setReminder(type: PeriodType, enabled: Boolean) {
        store.edit { prefs ->
            val keys = prefs[RasiPrefsKeys.REMINDER_TYPES].orEmpty().toMutableSet()
            val key = type.reminderKind().key
            if (enabled) keys.add(key) else keys.remove(key)
            prefs[RasiPrefsKeys.REMINDER_TYPES] = keys
        }
        Reminders.reschedule(appContext)
    }

    /** Lock-screen summary on/off; redraws (which posts or removes the notification). */
    suspend fun setLockScreenSummary(enabled: Boolean) {
        store.edit { prefs -> prefs[RasiPrefsKeys.LOCK_SCREEN_SUMMARY] = enabled }
        com.kaalam.rasipalan.widget.WidgetUpdater.redrawAll(appContext)
    }

    /** Janma rasi from birth date and time (IST). Throws on failure. */
    suspend fun findBirthRasi(date: LocalDate, hour: Int, minute: Int) =
        api.fetchBirthRasi(date, hour, minute, language())

    /**
     * Fetch today's reading for the selected rasi and write it to the cache.
     *
     * @param force `false` for periodic system updates: skips the network if
     *   the cache already holds a non-fallback reading for the same rasi,
     *   language and IST date that is less than [FRESH_FOR_MS] old. This is
     *   what makes frequent system ticks nearly free on battery. `true` for
     *   explicit user taps.
     */
    suspend fun refresh(force: Boolean): RefreshResult {
        // Periodic ticks never queue behind a running refresh; user taps wait their turn.
        if (!force && refreshMutex.isLocked) return RefreshResult.SkippedBusy

        return refreshMutex.withLock {
            val current = appContext.readRasiPalanState()
            if (!force && isFresh(current)) return@withLock RefreshResult.SkippedFresh

            val rasi = current.rasi
            val language = current.language
            store.edit { it[RasiPrefsKeys.REFRESH_STARTED] = System.currentTimeMillis() }

            try {
                val response = api.fetchRasiPalan(rasi, language)
                require(response.rasi == rasi.apiKey) {
                    "Server answered for '${response.rasi}', expected '${rasi.apiKey}'"
                }
                require(response.prediction.isNotBlank() || !response.generated?.prediction.isNullOrBlank()) {
                    "Server sent an empty prediction"
                }
                writeReading(rasi, language, response)
                Reminders.reschedule(appContext)
                RefreshResult.Updated
            } catch (e: CancellationException) {
                throw e // timeout/cancellation: let structured concurrency unwind
            } catch (e: Exception) {
                Log.w(TAG, "Refresh failed for ${rasi.apiKey}", e)
                store.edit { it[RasiPrefsKeys.LAST_ERROR] = e.toUserMessage(language) }
                RefreshResult.Failed(e)
            } finally {
                // Must run even when cancelled by a timeout, or the widget would
                // keep showing "updating…" until the 60 s staleness guard kicks in.
                withContext(NonCancellable) {
                    store.edit { it.remove(RasiPrefsKeys.REFRESH_STARTED) }
                }
            }
        }
    }

    /**
     * Full reading for [rasi] on [date] (null = today) in the current language,
     * for the reading screen. Today's reading for the selected rasi also
     * refreshes the widget cache. Throws on failure.
     */
    suspend fun fetchReading(rasi: Rasi, date: LocalDate? = null): RasiPalanResponse {
        val language = language()
        val response = api.fetchRasiPalan(rasi, language, date)
        require(response.rasi == rasi.apiKey) {
            "Server answered for '${response.rasi}', expected '${rasi.apiKey}'"
        }
        if (response.isToday) {
            writeReading(rasi, language, response)
            Reminders.reschedule(appContext)
        }
        return response
    }

    /** Atomically replace the cached reading (single DataStore transaction). */
    private suspend fun writeReading(rasi: Rasi, language: AppLanguage, response: RasiPalanResponse) {
        store.edit { prefs ->
            // The user may have switched rasi or language while the request was
            // in flight. Never cache text that no longer matches the selection.
            val selectedNow = Rasi.fromApiKey(prefs[RasiPrefsKeys.SELECTED_RASI])
            if (selectedNow != rasi || AppLanguage.fromCode(prefs[RasiPrefsKeys.LANGUAGE]) != language) return@edit

            prefs[RasiPrefsKeys.CACHED_RASI] = rasi.apiKey
            prefs[RasiPrefsKeys.CACHED_LANGUAGE] = language.code
            val chosen = choosePrediction(response, language)
            prefs[RasiPrefsKeys.PREDICTION] = chosen.text
            prefs[RasiPrefsKeys.PREDICTION_ORIGIN] = chosen.origin.key
            prefs[RasiPrefsKeys.NALLA_NERAM] = response.nallaNeram.ifBlank { "—" }
            prefs[RasiPrefsKeys.RAHU_KALAM] = response.rahuKalam.ifBlank { "—" }
            prefs[RasiPrefsKeys.READING_DATE] = response.date
            prefs[RasiPrefsKeys.WEEKDAY_TAMIL] = response.weekdayTamil
            // Kept even when a generated reading is shown, so periodic ticks
            // keep checking until the newspaper text is published.
            prefs[RasiPrefsKeys.IS_FALLBACK] = response.isFallback
            prefs[RasiPrefsKeys.HEADLINE] = headlineFor(response, chosen)
            prefs[RasiPrefsKeys.DAY_WORD] = dayWord(response, language)?.word.orEmpty()
            prefs[RasiPrefsKeys.CHANDRASHTAMAM_TEXT] = response.generated?.chandrashtamam?.text.orEmpty()
            prefs[RasiPrefsKeys.CHANDRASHTAMAM_STATE] = response.generated?.chandrashtamam?.state ?: "none"
            prefs[RasiPrefsKeys.TAMIL_DAY] = response.panchangam
                ?.takeIf { it.tamilMonth.isNotBlank() }?.let { "${it.tamilMonth} ${it.tamilDay}" }.orEmpty()
            val timeline = response.timeline
            if (timeline != null) {
                prefs[RasiPrefsKeys.TIMELINE_JSON] = RasiPalanApi.json.encodeToString(TimelineInfo.serializer(), timeline)
            } else {
                prefs.remove(RasiPrefsKeys.TIMELINE_JSON)
            }
            prefs[RasiPrefsKeys.LAST_UPDATED] = System.currentTimeMillis()
            prefs.remove(RasiPrefsKeys.LAST_ERROR)
        }
    }

    private fun isFresh(state: RasiPalanState): Boolean {
        if (!state.hasData || state.isFallback || state.isStale) return false
        val age = System.currentTimeMillis() - state.lastUpdatedMillis
        return age in 0 until FRESH_FOR_MS
    }

    fun Throwable.toUserMessage(language: AppLanguage): String {
        val s = strings(language)
        return when (this) {
            is java.net.UnknownHostException -> s.errorNoInternet
            is io.ktor.client.plugins.HttpRequestTimeoutException,
            is java.net.SocketTimeoutException -> s.errorNoResponse
            is io.ktor.client.plugins.ResponseException -> s.errorServer(response.status.value)
            else -> s.errorGeneric
        }
    }

    companion object {
        private const val TAG = "RasiPalanRepository"

        /** A good reading younger than this is reused by periodic ticks. */
        const val FRESH_FOR_MS = 3 * 60 * 60 * 1000L

        /** Shared across instances: one network refresh at a time per process. */
        private val refreshMutex = Mutex()
    }
}
