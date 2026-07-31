// SEXTANT — the handheld register's single token home (ui-library-contract § Token law).
// Every color, face, radius, spacing step, and target size on a SEXTANT surface traces
// here — zero raw hex in the screen files, scene/content colors included.
//
// Package + R note: files declare the template's own namespace (dev.template.sextant).
// An adopting project renames the package and the module namespace together — the
// R.font references below are the only resource coupling (fonts are OFL downloads,
// not committed binaries; see CAPTURE_CONTRACT.md › JVM-offscreen Android recipe).
package dev.template.sextant

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// ---------------------------------------------------------------------------
// Color tokens — one immutable set per theme. Semantic accents carry the house
// meanings whole: amber = command/attention/AI · cyan = live telemetry ·
// green = nominal/recommended · red = threat/abort (reserved: its absence is
// semantic too). `faint` is chrome/de-emphasis only — never the sole carrier
// of text a user must read (ORDINATE's contrast rule, inherited).
// ---------------------------------------------------------------------------

data class SxColors(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val line: Color,
    val lineSoft: Color,
    val ink: Color,
    val muted: Color,      // secondary reading tone — holds >= 4.5:1 on surfaces
    val faint: Color,      // chrome only
    val amber: Color,
    val cyan: Color,
    val green: Color,
    val red: Color,
    val isDark: Boolean,
)

val SxDark = SxColors(
    bg = Color(0xFF0B0F16),        // graphite blue-black — the house world, never pure black
    surface = Color(0xFF111722),
    surface2 = Color(0xFF18202E),
    line = Color(0xFF26314A),
    lineSoft = Color(0xFF1C2536),
    ink = Color(0xFFE4EAF4),
    muted = Color(0xFF93A0B5),
    faint = Color(0xFF5A6780),
    amber = Color(0xFFF5B04E),
    cyan = Color(0xFF4FD2DB),
    green = Color(0xFF63D08F),
    red = Color(0xFFFF6259),
    isDark = true,
)

// Light scheme: same semantics, accents re-derived dark enough to hold >= 4.5:1
// as text/glyph ink on white surfaces (sunlight legibility is the register's job).
val SxLight = SxColors(
    bg = Color(0xFFF3F5F9),
    surface = Color(0xFFFFFFFF),
    surface2 = Color(0xFFE9EDF4),
    line = Color(0xFFD9E0EB),
    lineSoft = Color(0xFFE4E9F1),
    ink = Color(0xFF1B2331),
    muted = Color(0xFF53617A),
    faint = Color(0xFF8B96AA),
    amber = Color(0xFF8F6400),
    cyan = Color(0xFF0E7C86),
    green = Color(0xFF1D7D46),
    red = Color(0xFFC6362E),
    isDark = false,
)

// Scene/content tokens (SQUALL) — content may be any luminance (bright-scene rule,
// inherited from HALCYON), but its palette still lives in the token home.
object SxScene {
    val skyHigh = Color(0xFF1A2138)     // indigo-slate zenith
    val skyLow = Color(0xFF3A3A52)      // storm haze at altitude
    val horizonGlow = Color(0xFFB06A32) // dusk storm-light band — the world's warmth
    val wallFar = Color(0xFF232838)
    val wallMid = Color(0xFF181D2B)
    val wallNear = Color(0xFF0E1220)
    val track = Color(0xFF4A5570)
    val rain = Color(0xFF8FA0C0)
    val scrim = Color(0xCC0B0F16)       // HUD under-halo / banner backing (bg @ 80%)
}

// ---------------------------------------------------------------------------
// Type — display carries identity, mono carries every number, body is Roboto:
// the platform's own body face (the register lives inside the platform, not
// against it). One scale, declared once; 11..44 rides the dense-tool carve-out
// (#191) — 16 is the prose-body floor where prose appears.
// ---------------------------------------------------------------------------

object SxType {
    val display = FontFamily(
        Font(R.font.chakra_petch_medium, FontWeight.Medium),
        Font(R.font.chakra_petch_semibold, FontWeight.SemiBold),
    )
    val mono = FontFamily(
        Font(R.font.ibm_plex_mono_regular, FontWeight.Normal),
        Font(R.font.ibm_plex_mono_medium, FontWeight.Medium),
    )
    val body = FontFamily.Default // Roboto
}

object SxScale { // sp steps — the whole scale, nothing off-scale
    const val micro = 11
    const val label = 12
    const val body = 13
    const val row = 14
    const val prose = 16
    const val title = 18
    const val readout = 20
    const val heroSub = 24
    const val hero = 34
    const val heroGame = 44
}

// ---------------------------------------------------------------------------
// Geometry — 4dp rhythm; "rounded where the thumb lands, square where data
// lives": touch surfaces take the M3 radius, instrument readouts stay square.
// ---------------------------------------------------------------------------

object SxDim {
    val s1: Dp = 4.dp
    val s2: Dp = 8.dp
    val s3: Dp = 12.dp
    val s4: Dp = 16.dp
    val s6: Dp = 24.dp
    val rTouch: Dp = 12.dp      // buttons, nav, sheets, tappable cards
    val rInstrument: Dp = 0.dp  // readouts, plots, data rows — square
    val minTarget: Dp = 48.dp   // one-thumb law floor
    val row: Dp = 56.dp         // list rows
}

// ---------------------------------------------------------------------------
// M3 grounding — tokens map into a ColorScheme so Material components inherit
// the register instead of fighting it. primary = amber (command), secondary =
// cyan (telemetry), tertiary = green (nominal), error = red (threat).
// ---------------------------------------------------------------------------

fun SxColors.toColorScheme(): ColorScheme = if (isDark) darkColorScheme(
    primary = amber, onPrimary = bg,
    secondary = cyan, onSecondary = bg,
    tertiary = green, onTertiary = bg,
    error = red, onError = bg,
    background = bg, onBackground = ink,
    surface = surface, onSurface = ink,
    surfaceVariant = surface2, onSurfaceVariant = muted,
    outline = line, outlineVariant = lineSoft,
) else lightColorScheme(
    primary = amber, onPrimary = surface,
    secondary = cyan, onSecondary = surface,
    tertiary = green, onTertiary = surface,
    error = red, onError = surface,
    background = bg, onBackground = ink,
    surface = surface, onSurface = ink,
    surfaceVariant = surface2, onSurfaceVariant = muted,
    outline = line, outlineVariant = lineSoft,
)

val LocalSx = staticCompositionLocalOf { SxDark }

@Composable
fun SextantTheme(dark: Boolean = true, content: @Composable () -> Unit) {
    val sx = if (dark) SxDark else SxLight
    CompositionLocalProvider(LocalSx provides sx) {
        MaterialTheme(colorScheme = sx.toColorScheme(), content = content)
    }
}
