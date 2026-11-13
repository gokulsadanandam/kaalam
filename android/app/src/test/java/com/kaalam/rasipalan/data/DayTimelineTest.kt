package com.kaalam.rasipalan.data

import com.kaalam.rasipalan.data.network.PeriodInfo
import com.kaalam.rasipalan.data.network.TimelineInfo
import com.kaalam.rasipalan.widget.WidgetTicker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** 12 Nov 2026, Chennai (Thursday), as the backend sends it. */
class DayTimelineTest {

    private fun hm(h: Int, m: Int = 0) = h * 60 + m

    private val timeline = DayTimeline.from(
        TimelineInfo(
            sunrise = hm(6, 7),
            sunset = hm(17, 40),
            periods = listOf(
                PeriodInfo("yamagandam", hm(6, 7), hm(7, 33)),
                PeriodInfo("kuligai", hm(9, 0), hm(10, 27)),
                PeriodInfo("abhijit", hm(11, 30), hm(12, 16)),
                PeriodInfo("rahuKalam", hm(13, 20), hm(14, 47)),
                PeriodInfo("unknownType", hm(15, 0), hm(16, 0)),
            ),
        ),
    )!!

    @Test
    fun `during Kuligai, next good time is Abhijit`() {
        val now = timeline.nowAt(hm(10, 5))
        assertEquals(NowState.Phase.PERIOD, now.phase)
        assertEquals(PeriodType.KULIGAI, now.current!!.type)
        assertEquals(hm(10, 27), now.untilMinute)
        assertEquals(PeriodType.ABHIJIT, now.nextGood!!.type)
    }

    @Test
    fun `between periods is normal time until the next one starts`() {
        val now = timeline.nowAt(hm(8, 0))
        assertEquals(NowState.Phase.NORMAL, now.phase)
        assertEquals(hm(9, 0), now.untilMinute)
    }

    @Test
    fun `after the last good time no next good, after sunset nothing`() {
        val rahu = timeline.nowAt(hm(14, 6))
        assertEquals(PeriodType.RAHU_KALAM, rahu.current!!.type)
        assertNull(rahu.nextGood)
        assertEquals(NowState.Phase.AFTER_SUNSET, timeline.nowAt(hm(18, 0)).phase)
        assertEquals(NowState.Phase.BEFORE_SUNRISE, timeline.nowAt(hm(5, 0)).phase)
        assertEquals(hm(6, 7), timeline.nowAt(hm(5, 0)).untilMinute)
    }

    @Test
    fun `overlaps show the most important period`() {
        val t = DayTimeline(hm(6), hm(18), listOf(DayPeriod(PeriodType.NALLA_NERAM, hm(9), hm(10)), DayPeriod(PeriodType.RAHU_KALAM, hm(9, 30), hm(11))))
        assertEquals(PeriodType.RAHU_KALAM, t.nowAt(hm(9, 45)).current!!.type)
        assertEquals(PeriodType.NALLA_NERAM, t.nowAt(hm(9, 15)).current!!.type)
    }

    @Test
    fun `unknown period types are ignored and row statuses follow the clock`() {
        assertEquals(4, timeline.periods.size)
        val kuligai = timeline.periods.first { it.type == PeriodType.KULIGAI }
        assertEquals(RowStatus.DONE, timeline.statusOf(kuligai, hm(11, 0)))
        assertEquals(RowStatus.NOW, timeline.statusOf(kuligai, hm(9, 0)))
        assertEquals(RowStatus.UPCOMING, timeline.statusOf(kuligai, hm(8, 59)))
    }

    @Test
    fun `formatting helpers`() {
        assertEquals("11:30 AM", formatMinute(hm(11, 30)))
        assertEquals("12:16 PM", formatMinute(hm(12, 16)))
        assertEquals("12:05 AM", formatMinute(5))
        assertEquals("1 ம 25 நி", strings(AppLanguage.TAMIL).duration(85))
        assertEquals("22m", strings(AppLanguage.ENGLISH).duration(22))
        assertEquals(PeriodType.NALLA_NERAM, PeriodType.ABHIJIT.reminderKind())
    }

    @Test
    fun `widget ticks every 5 minutes in the day, at boundaries otherwise`() {
        val ist = ZoneId.of("Asia/Kolkata")
        fun at(h: Int, m: Int) = ZonedDateTime.of(2026, 11, 12, h, m, 0, 0, ist)
        fun millis(h: Int, m: Int) = at(h, m).toInstant().toEpochMilli()

        assertEquals(millis(10, 10), WidgetTicker.nextTickMillis(timeline, at(10, 5)))  // 5 min cap
        assertEquals(millis(10, 27), WidgetTicker.nextTickMillis(timeline, at(10, 24))) // boundary first
        assertEquals(millis(6, 7), WidgetTicker.nextTickMillis(timeline, at(4, 0)))     // sunrise
        assertNull(WidgetTicker.nextTickMillis(timeline, at(18, 0)))                    // after sunset
    }
}
