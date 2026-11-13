package com.kaalam.rasipalan.widget

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.glance.material3.ColorProviders

/**
 * Traditional "panchangam almanac" palette expressed as Material 3 roles so
 * every Glance composable can read it from `GlanceTheme.colors`.
 *
 *   primary            deep kumkum maroon  -> header band
 *   secondary          temple gold         -> thin divider under the header
 *   background         aged parchment      -> widget body
 *   tertiaryContainer  tulsi green tint    -> "நல்ல நேரம்" (auspicious) cell
 *   errorContainer     soft vermilion     -> "ராகு காலம்" (inauspicious) cell
 *
 * The dark scheme keeps the same identity (maroon header, gold accent) on a
 * dark sandalwood base instead of inverting into a generic grey theme.
 */
private object Palette {
    val Maroon = Color(0xFF7A1F2B)
    val MaroonDeep = Color(0xFF5A1520)
    val Ivory = Color(0xFFFFF8EE)
    val Gold = Color(0xFFC59B2A)
    val GoldBright = Color(0xFFE2C062)
    val Parchment = Color(0xFFF6EBD3)
    val ParchmentLight = Color(0xFFFBF4E6)
    val Ink = Color(0xFF2E1F17)
    val InkSoft = Color(0xFF6A5442)
    val Sandalwood = Color(0xFF241B16)
    val SandalwoodLight = Color(0xFF2F241D)
    val ParchmentText = Color(0xFFF1E4CF)
}

private val LightScheme = lightColorScheme(
    primary = Palette.Maroon,
    onPrimary = Palette.Ivory,
    primaryContainer = Color(0xFFF2D7CB),
    onPrimaryContainer = Color(0xFF3E0A12),
    secondary = Palette.Gold,
    onSecondary = Color(0xFF2A1E00),
    secondaryContainer = Color(0xFFF5E3B3),
    onSecondaryContainer = Color(0xFF3A2C00),
    tertiary = Color(0xFF2F6B3B),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFDCEFD6),
    onTertiaryContainer = Color(0xFF113A1B),
    error = Color(0xFFA8321F),
    onError = Color.White,
    errorContainer = Color(0xFFF8DAD2),
    onErrorContainer = Color(0xFF65170D),
    background = Palette.Parchment,
    onBackground = Palette.Ink,
    surface = Palette.ParchmentLight,
    onSurface = Palette.Ink,
    surfaceVariant = Color(0xFFEDDDBE),
    onSurfaceVariant = Palette.InkSoft,
    outline = Color(0xFFB79C76),
)

private val DarkScheme = darkColorScheme(
    primary = Palette.MaroonDeep,
    onPrimary = Color(0xFFFBE9DF),
    primaryContainer = Color(0xFF6E2330),
    onPrimaryContainer = Color(0xFFFFD9DC),
    secondary = Palette.GoldBright,
    onSecondary = Color(0xFF3A2C00),
    secondaryContainer = Color(0xFF54420E),
    onSecondaryContainer = Color(0xFFF8E3A8),
    tertiary = Color(0xFF9BD3A2),
    onTertiary = Color(0xFF0A3914),
    tertiaryContainer = Color(0xFF1E4427),
    onTertiaryContainer = Color(0xFFCDEBC6),
    error = Color(0xFFFFB4A6),
    onError = Color(0xFF5F1408),
    errorContainer = Color(0xFF5C1D14),
    onErrorContainer = Color(0xFFFAD3CA),
    background = Palette.Sandalwood,
    onBackground = Palette.ParchmentText,
    surface = Palette.SandalwoodLight,
    onSurface = Palette.ParchmentText,
    surfaceVariant = Color(0xFF3B2F26),
    onSurfaceVariant = Color(0xFFD5C3AA),
    outline = Color(0xFF8E7A62),
)

/** Day/night-aware colours; Glance swaps them automatically with the system theme. */
val KaalamWidgetColors = ColorProviders(light = LightScheme, dark = DarkScheme)
