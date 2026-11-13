package com.kaalam.rasipalan.data

import org.junit.Assert.assertEquals
import org.junit.Test

class RasiStarsTest {

    private fun search(query: String) = Rasi.entries.filter { it.matches(query) }

    @Test
    fun `search finds a rasi by its nakshatra in either script`() {
        assertEquals(listOf(Rasi.VIRUCHIGAM), search("Kettai"))
        assertEquals(listOf(Rasi.VIRUCHIGAM), search("அனுஷம்"))
        assertEquals(listOf(Rasi.RISHABAM), search("ரோகிணி"))
        // Nakshatras split across two rasis match both.
        assertEquals(listOf(Rasi.MESHAM, Rasi.RISHABAM), search("Karthigai"))
    }

    @Test
    fun `search by rasi name, Western sign and blank query`() {
        assertEquals(listOf(Rasi.MESHAM), search("aries"))
        assertEquals(listOf(Rasi.KANNI), search("கன்னி"))
        assertEquals(listOf(Rasi.MESHAM), search("அஸ்வினி")) // common alternative spelling
        assertEquals(12, search("  ").size)
        assertEquals(emptyList<Rasi>(), search("xyz"))
    }

    @Test
    fun `every rasi has nine padas`() {
        for (rasi in Rasi.entries) {
            val padas = rasi.stars.english.split(" · ").sumOf { part ->
                val range = Regex("(\\d)(?:-(\\d))?$").find(part)
                if (range == null) 4 else {
                    val from = range.groupValues[1].toInt()
                    val to = range.groupValues[2].ifBlank { range.groupValues[1] }.toInt()
                    to - from + 1
                }
            }
            assertEquals("${rasi.name} padas", 9, padas)
        }
    }
}