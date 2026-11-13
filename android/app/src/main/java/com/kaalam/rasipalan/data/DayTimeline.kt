package com.kaalam.rasipalan.data

import com.kaalam.rasipalan.data.network.TimelineInfo
import java.time.LocalTime

/** Kinds of timed periods in a day, most important first when they overlap. */
enum class PeriodType(val key: String, val isGood: Boolean, val priority: Int) {
    RAHU_KALAM("rahuKalam", isGood = false, priority = 0),
    YAMAGANDAM("yamagandam", isGood = false, priority = 1),
    KULIGAI("kuligai", isGood = false, priority = 2),
    NALLA_NERAM("nallaNeram", isGood = true, priority = 3),
    ABHIJIT("abhijit", isGood = true, priority = 4);

    companion object {
        fun fromKey(key: String): PeriodType? = entries.firstOrNull { it.key == key }
    }
}

/** A period, in minutes after local midnight (IST). */
data class DayPeriod(val type: PeriodType, val start: Int, val end: Int) {
    operator fun contains(minute: Int) = minute in start until end
}

/** Reminders are per kind: Abhijit is a Nalla Neram, so one bell covers both. */
fun PeriodType.reminderKind(): PeriodType = if (this == PeriodType.ABHIJIT) PeriodType.NALLA_NERAM else this

/** Where a timings row stands relative to now. */
enum class RowStatus { DONE, NOW, UPCOMING }

/**
 * What is happening at a moment of the day.
 *
 * @param current   the special period now (highest priority if they overlap), or null
 * @param phase     [Phase.PERIOD] when [current] is set; otherwise normal time, before sunrise or after sunset
 * @param untilMinute when the current state ends (period end, next period start, sunrise or sunset)
 * @param nextGood  the next auspicious period starting after now, or null
 */
data class NowState(
    val phase: Phase,
    val current: DayPeriod?,
    val untilMinute: Int?,
    val nextGood: DayPeriod?,
) {
    enum class Phase { PERIOD, NORMAL, BEFORE_SUNRISE, AFTER_SUNSET }
}

/** The day's periods between sunrise and sunset. Pure logic: shared by the app, the widget and reminders. */
data class DayTimeline(val sunrise: Int, val sunset: Int, val periods: List<DayPeriod>) {

    fun nowAt(minute: Int): NowState {
        val current = periods.filter { minute in it }.minByOrNull { it.type.priority }
        val nextGood = periods.filter { it.type.isGood && it.start > minute }.minByOrNull { it.start }
        if (current != null) return NowState(NowState.Phase.PERIOD, current, current.end, nextGood)
        if (minute < sunrise) return NowState(NowState.Phase.BEFORE_SUNRISE, null, sunrise, nextGood)
        if (minute >= sunset) return NowState(NowState.Phase.AFTER_SUNSET, null, null, null)
        val nextStart = periods.filter { it.start > minute }.minOfOrNull { it.start }
        return NowState(NowState.Phase.NORMAL, null, nextStart ?: sunset, nextGood)
    }

    fun statusOf(period: DayPeriod, minute: Int): RowStatus = when {
        minute >= period.end -> RowStatus.DONE
        minute >= period.start -> RowStatus.NOW
        else -> RowStatus.UPCOMING
    }

    /** Next minute at which [nowAt] can change (for redraw scheduling), or null after sunset. */
    fun nextBoundaryAfter(minute: Int): Int? =
        (listOf(sunrise, sunset) + periods.flatMap { listOf(it.start, it.end) })
            .filter { it > minute }
            .minOrNull()

    companion object {
        fun from(info: TimelineInfo?): DayTimeline? {
            if (info == null || info.sunset <= info.sunrise) return null
            val periods = info.periods.mapNotNull { p ->
                PeriodType.fromKey(p.type)?.takeIf { p.end > p.start }?.let { DayPeriod(it, p.start, p.end) }
            }.sortedBy { it.start }
            return DayTimeline(info.sunrise, info.sunset, periods)
        }

        fun minuteOf(time: LocalTime): Int = time.hour * 60 + time.minute
    }
}

/** "11:30 AM" from minutes after midnight. */
fun formatMinute(minute: Int): String {
    val m = ((minute % 1440) + 1440) % 1440
    val h24 = m / 60
    val h12 = if (h24 % 12 == 0) 12 else h24 % 12
    return "%d:%02d %s".format(java.util.Locale.ROOT, h12, m % 60, if (h24 < 12) "AM" else "PM")
}
