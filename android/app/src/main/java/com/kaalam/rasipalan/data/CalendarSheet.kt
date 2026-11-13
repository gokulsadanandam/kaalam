package com.kaalam.rasipalan.data

import com.kaalam.rasipalan.data.network.GowriSlot

/**
 * Good Gowri times for one half of the day ("day" or "night"), with touching
 * slots merged: e.g. Thursday's Dhanam 6:06–7:33 and Sugam 7:33–9:00 become
 * 6:06–9:00. Minutes after local midnight; night ranges may pass 1440.
 */
fun goodGowriRanges(slots: List<GowriSlot>, part: String): List<Pair<Int, Int>> {
    val out = mutableListOf<Pair<Int, Int>>()
    for (slot in slots.filter { it.good && it.part == part }.sortedBy { it.start }) {
        val last = out.lastOrNull()
        if (last != null && slot.start - last.second <= 1) out[out.lastIndex] = last.first to maxOf(last.second, slot.end)
        else out += slot.start to slot.end
    }
    return out
}

/** "6:06 – 9:00 AM", "11:53 AM – 1:20 PM" (same style as the timings rows). */
fun formatRange(start: Int, end: Int): String {
    val a = formatMinute(start)
    val b = formatMinute(end)
    return if (a.takeLast(2) == b.takeLast(2)) "${a.dropLast(3)} – $b" else "$a – $b"
}

/** "10.45", "1.20": 12-hour clock with a dot, as printed on calendar sheets. */
fun clockDots(minute: Int): String {
    val m = ((minute % 1440) + 1440) % 1440
    val h = (m / 60) % 12
    return "%d.%02d".format(java.util.Locale.ROOT, if (h == 0) 12 else h, m % 60)
}

/** "10.45-11.45" */
fun rangeDots(range: Pair<Int, Int>): String = "${clockDots(range.first)}-${clockDots(range.second)}"

/** The sheet's two rows: ranges starting before noon (காலை), and the rest (மாலை). */
fun morningEvening(ranges: List<Pair<Int, Int>>): Pair<List<Pair<Int, Int>>, List<Pair<Int, Int>>> =
    ranges.partition { it.first < 12 * 60 }

/**
 * Gowri Nalla Neram for the sheet's two rows: the first good daytime Gowri
 * before noon, and the first good one from 4 PM (evening or night).
 */
fun gowriForSheet(slots: List<GowriSlot>): Pair<Pair<Int, Int>?, Pair<Int, Int>?> {
    val day = goodGowriRanges(slots, "day")
    val all = day + goodGowriRanges(slots, "night")
    return day.firstOrNull { it.first < 12 * 60 } to all.firstOrNull { it.first >= 16 * 60 }
}

/**
 * South Indian chart: each rasi has a fixed cell in a 4×4 grid (row, column),
 * Meenam at the top-left, then clockwise; the middle 2×2 is free.
 */
fun southChartCell(rasiIndex: Int): Pair<Int, Int> = when (rasiIndex) {
    11 -> 0 to 0
    0 -> 0 to 1
    1 -> 0 to 2
    2 -> 0 to 3
    3 -> 1 to 3
    4 -> 2 to 3
    5 -> 3 to 3
    6 -> 3 to 2
    7 -> 3 to 1
    8 -> 3 to 0
    9 -> 2 to 0
    10 -> 1 to 0
    else -> throw IllegalArgumentException("rasi $rasiIndex")
}
