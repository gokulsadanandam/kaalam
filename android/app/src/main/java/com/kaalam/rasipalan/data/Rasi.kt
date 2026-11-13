package com.kaalam.rasipalan.data

/**
 * The 12 rasis (moon signs).
 *
 * [apiKey] must match the canonical `key` values the backend returns from
 * `/api/rasis`, so the client never sends Tamil text in a URL.
 */
enum class Rasi(
    val apiKey: String,
    val tamilName: String,
    val englishName: String,
    /** Tamil name in Latin letters, as English-language Tamil calendars print it. */
    val transliteration: String,
) {
    MESHAM("mesham", "மேஷம்", "Aries", "Mesham"),
    RISHABAM("rishabam", "ரிஷபம்", "Taurus", "Rishabam"),
    MITHUNAM("mithunam", "மிதுனம்", "Gemini", "Mithunam"),
    KADAGAM("kadagam", "கடகம்", "Cancer", "Kadagam"),
    SIMMAM("simmam", "சிம்மம்", "Leo", "Simmam"),
    KANNI("kanni", "கன்னி", "Virgo", "Kanni"),
    THULAM("thulam", "துலாம்", "Libra", "Thulam"),
    VIRUCHIGAM("viruchigam", "விருச்சிகம்", "Scorpio", "Viruchigam"),
    DHANUSU("dhanusu", "தனுசு", "Sagittarius", "Dhanusu"),
    MAGARAM("magaram", "மகரம்", "Capricorn", "Magaram"),
    KUMBAM("kumbam", "கும்பம்", "Aquarius", "Kumbam"),
    MEENAM("meenam", "மீனம்", "Pisces", "Meenam");

    /** "மேஷம்" in Tamil, "Mesham (Aries)" in English. */
    fun displayName(language: AppLanguage): String = when (language) {
        AppLanguage.TAMIL -> tamilName
        AppLanguage.ENGLISH -> "$transliteration ($englishName)"
    }

    /** Picker row: both scripts, the chosen language first. */
    fun listLabel(language: AppLanguage): String = when (language) {
        AppLanguage.TAMIL -> "$tamilName   ·   $englishName"
        AppLanguage.ENGLISH -> "$transliteration ($englishName)   ·   $tamilName"
    }

    companion object {
        val DEFAULT = MESHAM

        /** Safe decode of a persisted key; unknown/corrupt values fall back to [DEFAULT]. */
        fun fromApiKey(key: String?): Rasi = entries.firstOrNull { it.apiKey == key } ?: DEFAULT
    }
}
