package com.kaalam.rasipalan.data

import com.kaalam.rasipalan.data.network.RasiPalanResponse

/** Where the text the widget shows came from. Stored by [key] in the cache. */
enum class PredictionOrigin(val key: String) {
    /** Newspaper text scraped by the backend. */
    SCRAPED("scraped"),

    /** Original reading computed from the Moon's transit (Chandra Gochara). */
    GENERATED("generated"),

    /** The backend's generic placeholder: neither of the above was available. */
    FALLBACK("fallback");

    companion object {
        fun fromKey(key: String?): PredictionOrigin? = entries.firstOrNull { it.key == key }
    }
}

data class ChosenPrediction(val text: String, val origin: PredictionOrigin)

/**
 * Pick which reading the widget and the reading screen show first:
 *
 *  1. The computed (Moon-transit) reading, in the app's language, whenever
 *     there is one and the newspaper either is not out yet or says the same.
 *  2. The newspaper text when the two readings do not agree (`diff.level` is
 *     `partial` or `disagree`): the newspaper astrologer's judgement wins,
 *     since the computed reading uses the Moon alone.
 *  3. With an older backend that sends no `generated` field: the newspaper
 *     text, or the fallback placeholder.
 *
 * Newspaper text is only in Tamil, so in English the computed reading (which
 * the backend writes in the app's language) always comes first.
 */
fun choosePrediction(response: RasiPalanResponse, language: AppLanguage = AppLanguage.TAMIL): ChosenPrediction {
    val scraped = response.prediction.trim()
    val generated = response.generated?.prediction?.trim().orEmpty()
    val hasNewspaper = !response.isFallback && scraped.isNotEmpty()
    val disagree = language == AppLanguage.TAMIL &&
        response.diff?.level?.let { it.isNotEmpty() && it != "agree" } == true

    return when {
        generated.isNotEmpty() && !(hasNewspaper && disagree) -> ChosenPrediction(generated, PredictionOrigin.GENERATED)
        response.isFallback -> ChosenPrediction(scraped, PredictionOrigin.FALLBACK)
        else -> ChosenPrediction(scraped, PredictionOrigin.SCRAPED)
    }
}

/**
 * The one-line headline that belongs to [chosen]: the computed headline for
 * the computed reading, the newspaper's first sentence for newspaper text.
 */
fun headlineFor(response: RasiPalanResponse, chosen: ChosenPrediction): String = when (chosen.origin) {
    PredictionOrigin.GENERATED -> response.generated?.headline.orEmpty()
    PredictionOrigin.SCRAPED -> firstSentence(chosen.text)
    PredictionOrigin.FALLBACK -> ""
}

/** First sentence of [text], shortened at a word boundary to about [max] characters. */
fun firstSentence(text: String, max: Int = 90): String {
    val sentence = text.trim().substringBefore('.').trim()
    if (sentence.length <= max) return sentence
    val cut = sentence.lastIndexOf(' ', max).takeIf { it > max / 2 } ?: max
    return sentence.take(cut).trimEnd() + "…"
}

/** The day's one-word reading and where it came from. */
data class DayWord(val word: String, val fromCalendar: Boolean, val score: Int?)

/**
 * The one summary word shown for the day: the daily calendar's word (in
 * English when the app is in English and a translation exists), otherwise
 * the computed Moon-transit summary ("செலவு"). Null when neither exists.
 */
fun dayWord(response: RasiPalanResponse, language: AppLanguage): DayWord? {
    val sheet = response.sources?.sheet
    val sheetWord = when (language) {
        AppLanguage.TAMIL -> sheet?.word
        AppLanguage.ENGLISH -> sheet?.english
    }?.trim()?.takeIf { it.isNotEmpty() }
    if (sheetWord != null) return DayWord(sheetWord, fromCalendar = true, score = null)
    val generated = response.generated?.takeIf { it.summary.isNotBlank() } ?: return null
    return DayWord(generated.summary, fromCalendar = false, score = generated.score)
}
