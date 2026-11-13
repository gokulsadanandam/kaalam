package com.kaalam.rasipalan.widget

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime

class DailyRefreshTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(hour: Int, minute: Int) = ZonedDateTime.of(2026, 11, 12, hour, minute, 0, 0, ist)

    @Test
    fun `after midnight slot waits for the morning slot`() {
        assertEquals(Duration.ofHours(3).plusMinutes(5), DailyRefresh.delayUntilNextSlot(at(3, 55)))
    }

    @Test
    fun `after the morning slot waits for just after midnight`() {
        assertEquals(Duration.ofHours(14).plusMinutes(10), DailyRefresh.delayUntilNextSlot(at(10, 0)))
    }

    @Test
    fun `exactly at a slot schedules the next one, never zero`() {
        assertEquals(Duration.ofHours(6).plusMinutes(50), DailyRefresh.delayUntilNextSlot(at(0, 10)))
        assertEquals(Duration.ofHours(17).plusMinutes(10), DailyRefresh.delayUntilNextSlot(at(7, 0)))
    }
}
