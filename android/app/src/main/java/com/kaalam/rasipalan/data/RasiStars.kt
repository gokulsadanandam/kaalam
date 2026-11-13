package com.kaalam.rasipalan.data

/**
 * Nakshatra padas of each rasi (each rasi = 9 padas of 3°20'), shown on the
 * picker cards and used to search by nakshatra ("அனுஷம்" → விருச்சிகம்).
 */
class RasiStars(val tamil: String, val english: String) {
    /** Lower-case text searched by the picker (names in both scripts, no pada numbers). */
    val searchText: String = "$tamil $english".lowercase().replace(Regex("[0-9\\-·]"), " ")

    fun label(language: AppLanguage) = if (language == AppLanguage.TAMIL) tamil else english
}

val Rasi.stars: RasiStars
    get() = when (this) {
        Rasi.MESHAM -> RasiStars("அசுவினி · பரணி · கார்த்திகை 1", "Ashwini · Bharani · Karthigai 1")
        Rasi.RISHABAM -> RasiStars("கார்த்திகை 2-4 · ரோகிணி · மிருகசீரிடம் 1-2", "Karthigai 2-4 · Rohini · Mirugaseersham 1-2")
        Rasi.MITHUNAM -> RasiStars("மிருகசீரிடம் 3-4 · திருவாதிரை · புனர்பூசம் 1-3", "Mirugaseersham 3-4 · Thiruvathirai · Punarpoosam 1-3")
        Rasi.KADAGAM -> RasiStars("புனர்பூசம் 4 · பூசம் · ஆயில்யம்", "Punarpoosam 4 · Poosam · Ayilyam")
        Rasi.SIMMAM -> RasiStars("மகம் · பூரம் · உத்திரம் 1", "Magam · Pooram · Uthiram 1")
        Rasi.KANNI -> RasiStars("உத்திரம் 2-4 · அஸ்தம் · சித்திரை 1-2", "Uthiram 2-4 · Hastham · Chithirai 1-2")
        Rasi.THULAM -> RasiStars("சித்திரை 3-4 · சுவாதி · விசாகம் 1-3", "Chithirai 3-4 · Swathi · Visakam 1-3")
        Rasi.VIRUCHIGAM -> RasiStars("விசாகம் 4 · அனுஷம் · கேட்டை", "Visakam 4 · Anusham · Kettai")
        Rasi.DHANUSU -> RasiStars("மூலம் · பூராடம் · உத்திராடம் 1", "Moolam · Pooradam · Uthiradam 1")
        Rasi.MAGARAM -> RasiStars("உத்திராடம் 2-4 · திருவோணம் · அவிட்டம் 1-2", "Uthiradam 2-4 · Thiruvonam · Avittam 1-2")
        Rasi.KUMBAM -> RasiStars("அவிட்டம் 3-4 · சதயம் · பூரட்டாதி 1-3", "Avittam 3-4 · Sathayam · Poorattathi 1-3")
        Rasi.MEENAM -> RasiStars("பூரட்டாதி 4 · உத்திரட்டாதி · ரேவதி", "Poorattathi 4 · Uthirattathi · Revathi")
    }

/** Picker search: rasi name in either script, Western sign, or any of its nakshatras. */
fun Rasi.matches(query: String): Boolean {
    val q = query.trim().lowercase()
    if (q.isEmpty()) return true
    return listOf(tamilName, englishName, transliteration).any { it.lowercase().contains(q) } ||
        stars.searchText.contains(q) ||
        // Common alternative spelling of the first nakshatra.
        (this == Rasi.MESHAM && "அஸ்வினி".contains(q))
}
