package com.kaalam.rasipalan.data

import com.kaalam.rasipalan.data.network.GeneratedPalan
import com.kaalam.rasipalan.data.network.GowriSlot
import com.kaalam.rasipalan.data.network.PredictionDiff
import com.kaalam.rasipalan.data.network.RasiPalanApi
import com.kaalam.rasipalan.data.network.RasiPalanResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PredictionChooserTest {

    private fun response(
        prediction: String = "செய்தித்தாள் பலன்",
        isFallback: Boolean = false,
        generated: String? = "கணிக்கப்பட்ட பலன்",
        diff: PredictionDiff? = null,
    ) = RasiPalanResponse(
        rasi = "mesham",
        rasiTamil = "மேஷம்",
        date = "2026-11-10",
        prediction = prediction,
        nallaNeram = "—",
        rahuKalam = "—",
        isFallback = isFallback,
        generated = generated?.let { GeneratedPalan(prediction = it) },
        diffScore = diff?.score,
        diff = diff,
    )

    @Test
    fun `decodes the real backend payload`() {
        val text = javaClass.classLoader!!.getResource("rasipalan-mesham.json")!!.readText()
        val decoded = RasiPalanApi.json.decodeFromString(RasiPalanResponse.serializer(), text)

        assertEquals("mesham", decoded.rasi)
        assertEquals(8, decoded.generated!!.house)
        assertTrue(decoded.generated!!.isChandrashtamam)
        assertEquals("agree", decoded.diff!!.level)
        assertEquals(decoded.diff!!.score, decoded.diffScore!!, 0.0)
        // The readings agree, so the computed reading is shown.
        assertEquals(PredictionOrigin.GENERATED, choosePrediction(decoded).origin)
    }

    @Test
    fun `decodes the calendar word, papers and how the reading was worked out`() {
        val json = """{"rasi":"viruchigam","rasiTamil":"விருச்சிகம்","date":"2026-11-12","prediction":"x.","nallaNeram":"—","rahuKalam":"—",
            "sourceUrl":"https://www.dailythanthi.com/x",
            "sources":{"sheet":{"word":"எதிர்ப்பு","english":"Opposition","confidence":0.95},
                       "papers":[{"source":"dailythanthi","credit":"Daily Thanthi (dailythanthi.com)","url":"https://www.dailythanthi.com/x","excerpt":"x."}]},
            "generated":{"prediction":"p","summary":"செலவு","score":-1,"house":2,
                         "basis":{"moon":[{"rasi":"விருச்சிகம்","rasiIndex":7,"house":1,"until":"2:19 PM"},{"rasi":"தனுசு","rasiIndex":8,"house":2,"until":null}],"ruling":1}},
            "gochara":[{"house":1,"summary":"நலம்","score":1},{"house":2,"summary":"செலவு","score":-1}]}"""
        val r = RasiPalanApi.json.decodeFromString(RasiPalanResponse.serializer(), json)
        assertEquals("எதிர்ப்பு", r.sources!!.sheet!!.word)
        assertEquals("dailythanthi", r.sources!!.papers.single().source)
        assertEquals(2, r.generated!!.basis!!.moon[1].house)
        assertEquals(1, r.generated!!.basis!!.ruling)
        assertEquals(2, r.gochara.size)

        // The day's one word: the calendar's (in the app language), else the computed summary.
        assertEquals(DayWord("எதிர்ப்பு", fromCalendar = true, score = null), dayWord(r, AppLanguage.TAMIL))
        assertEquals(DayWord("Opposition", fromCalendar = true, score = null), dayWord(r, AppLanguage.ENGLISH))
        val untranslated = r.copy(sources = r.sources!!.copy(sheet = r.sources!!.sheet!!.copy(english = null)))
        assertEquals(DayWord("செலவு", fromCalendar = false, score = -1), dayWord(untranslated, AppLanguage.ENGLISH))
        assertNull(dayWord(r.copy(sources = null, generated = null), AppLanguage.TAMIL))

        val day = RasiPalanApi.json.decodeFromString(
            com.kaalam.rasipalan.data.network.PanchangamDayResponse.serializer(),
            """{"date":"2026-11-12","sheet":{"words":{"viruchigam":"எதிர்ப்பு"},"english":{"viruchigam":null}},"rasiPalan":[{"rasi":"viruchigam","sheetWord":"எதிர்ப்பு"}]}""",
        )
        assertEquals("எதிர்ப்பு", day.sheet!!.words["viruchigam"])
        assertNull(day.sheet!!.english["viruchigam"])
    }

    @Test
    fun `lock-screen line shows now and the next good time`() {
        val timeline = DayTimeline.from(
            com.kaalam.rasipalan.data.network.TimelineInfo(
                sunrise = 366, sunset = 1060,
                periods = listOf(
                    com.kaalam.rasipalan.data.network.PeriodInfo("rahuKalam", 800, 886),
                    com.kaalam.rasipalan.data.network.PeriodInfo("nallaNeram", 1005, 1065),
                ),
            ),
        )!!
        val en = strings(AppLanguage.ENGLISH)
        assertEquals("Now: Rahu Kalam until 2:46 PM · Next: Nalla Neram 4:45 PM", com.kaalam.rasipalan.reminders.LockScreenSummary.nowLine(timeline, 830, en))
        assertEquals("Now: Before sunrise · Next: Nalla Neram 4:45 PM", com.kaalam.rasipalan.reminders.LockScreenSummary.nowLine(timeline, 300, en))
    }

    @Test
    fun `older backend without generated fields still decodes`() {
        val old = """{"rasi":"mesham","rasiTamil":"மேஷம்","date":"2026-11-10","prediction":"x",
            "nallaNeram":"—","rahuKalam":"—","isFallback":true}"""
        val decoded = RasiPalanApi.json.decodeFromString(RasiPalanResponse.serializer(), old)

        assertNull(decoded.generated)
        assertNull(decoded.diffScore)
        assertEquals(ChosenPrediction("x", PredictionOrigin.FALLBACK), choosePrediction(decoded))
    }

    @Test
    fun `no newspaper text yet shows the generated reading`() {
        val chosen = choosePrediction(response(prediction = "placeholder", isFallback = true))
        assertEquals(ChosenPrediction("கணிக்கப்பட்ட பலன்", PredictionOrigin.GENERATED), chosen)
    }

    @Test
    fun `agreeing readings show the computed reading`() {
        val chosen = choosePrediction(response(diff = PredictionDiff(0.1, "agree", "high")))
        assertEquals(ChosenPrediction("கணிக்கப்பட்ட பலன்", PredictionOrigin.GENERATED), chosen)
    }

    @Test
    fun `any disagreement shows the newspaper text, whatever the confidence`() {
        for ((level, confidence) in listOf("partial" to "low", "partial" to "high", "disagree" to "low", "disagree" to "high")) {
            val chosen = choosePrediction(response(diff = PredictionDiff(0.6, level, confidence)))
            assertEquals("$level/$confidence", PredictionOrigin.SCRAPED, chosen.origin)
        }
    }

    @Test
    fun `English always shows the computed reading, since the newspaper is Tamil only`() {
        val r = response(generated = "Computed reading", diff = PredictionDiff(0.6, "disagree", "high"))
        assertEquals(PredictionOrigin.GENERATED, choosePrediction(r, AppLanguage.ENGLISH).origin)
        assertEquals(PredictionOrigin.SCRAPED, choosePrediction(r, AppLanguage.TAMIL).origin)
        val noComputed = response(generated = null)
        assertEquals(PredictionOrigin.SCRAPED, choosePrediction(noComputed, AppLanguage.ENGLISH).origin)
    }

    @Test
    fun `blank generated text never replaces the newspaper text`() {
        val chosen = choosePrediction(response(generated = "  ", diff = PredictionDiff(0.1, "agree", "high")))
        assertEquals(PredictionOrigin.SCRAPED, chosen.origin)
    }

    @Test
    fun `headline belongs to the reading shown`() {
        val r = response(
            prediction = "குடும்பத்தில் விட்டுக் கொடுத்து போவது நல்லது. அலுவலகத்தில் விவாதங்களை தவிர்க்கவும்.",
            diff = PredictionDiff(0.7, "disagree", "high"),
        ).copy(generated = GeneratedPalan(prediction = "கணிப்பு", headline = "செலவுகளில் கவனம்"))
        val scraped = choosePrediction(r)
        assertEquals("குடும்பத்தில் விட்டுக் கொடுத்து போவது நல்லது", headlineFor(r, scraped))
        val agreed = r.copy(diff = PredictionDiff(0.1, "agree", "high"))
        assertEquals("செலவுகளில் கவனம்", headlineFor(agreed, choosePrediction(agreed)))
        assertEquals("a b…", firstSentence("a b cdefgh", max = 5))
    }

    @Test
    fun `good Gowri slots merge when they touch`() {
        val slots = listOf(
            GowriSlot("Dhanam", good = true, part = "day", start = 366, end = 453),
            GowriSlot("Sugam", good = true, part = "day", start = 453, end = 540),
            GowriSlot("Soram", good = false, part = "day", start = 540, end = 626),
            GowriSlot("Uthi", good = true, part = "day", start = 626, end = 713),
            GowriSlot("Amirdha", good = true, part = "night", start = 1060, end = 1153),
        )
        assertEquals(listOf(366 to 540, 626 to 713), goodGowriRanges(slots, "day"))
        assertEquals(listOf(1060 to 1153), goodGowriRanges(slots, "night"))
        assertEquals("6:06 – 9:00 AM", formatRange(366, 540))
    }

    @Test
    fun `calendar sheet helpers`() {
        assertEquals("10.45-11.45", rangeDots(645 to 705))
        assertEquals("12.15", clockDots(735))
        assertEquals("1.20", clockDots(800))
        val (morning, evening) = morningEvening(listOf(645 to 705, 735 to 795, 1005 to 1065))
        assertEquals(listOf(645 to 705), morning)
        assertEquals(listOf(735 to 795, 1005 to 1065), evening)
        // South Indian chart: Meenam top-left, clockwise; the middle is free.
        assertEquals(0 to 0, southChartCell(11))
        assertEquals(0 to 1, southChartCell(0))
        assertEquals(3 to 3, southChartCell(5))
        assertEquals(1 to 0, southChartCell(10))
        val cells = (0 until 12).map { southChartCell(it) }.toSet()
        assertEquals(12, cells.size)
        assertTrue(cells.none { (r, c) -> r in 1..2 && c in 1..2 })
    }

    @Test
    fun `strings format dates in both languages`() {
        val date = java.time.LocalDate.of(2026, 11, 12)
        assertEquals("வியாழன் · 12 நவம்பர் 2026", strings(AppLanguage.TAMIL).fullDate(date))
        assertEquals("Thursday, 12 Nov 2026", strings(AppLanguage.ENGLISH).fullDate(date))
        assertEquals(AppLanguage.TAMIL, AppLanguage.fromCode(null))
        assertEquals("Mesham (Aries)", Rasi.MESHAM.displayName(AppLanguage.ENGLISH))
    }
}
