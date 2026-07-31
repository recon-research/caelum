// SEXTANT primitives — the portable taste layer shared by the register's screens.
// Styles derive from tokens only; components own their internals (contract § API).
package dev.template.sextant

import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

// --- Text styles: one builder per face role; every size from SxScale -------

fun sxDisplay(size: Int, color: Color, weight: FontWeight = FontWeight.SemiBold) =
    TextStyle(
        fontFamily = SxType.display, fontWeight = weight,
        fontSize = size.sp, letterSpacing = 0.14.em, color = color,
    )

fun sxMono(size: Int, color: Color, weight: FontWeight = FontWeight.Normal) =
    TextStyle(
        fontFamily = SxType.mono, fontWeight = weight,
        fontSize = size.sp, color = color,
        fontFeatureSettings = "tnum", // tabular numerals for ALL data (craft rule)
    )

fun sxBody(size: Int, color: Color, weight: FontWeight = FontWeight.Normal) =
    TextStyle(
        fontFamily = SxType.body, fontWeight = weight,
        fontSize = size.sp, color = color,
    )

// HUD-on-scene variant: dark under-halo so glyphs read on any scene luminance
// (bright-scene rule, inherited from HALCYON).
fun TextStyle.haloed(halo: Color = SxScene.scrim) =
    copy(shadow = Shadow(color = halo, offset = Offset(0f, 1f), blurRadius = 8f))

// --- Eyebrow: the letterspaced uppercase section label ---------------------

@Composable
fun Eyebrow(text: String, color: Color, modifier: Modifier = Modifier) {
    BasicText(
        text = text.uppercase(),
        modifier = modifier,
        style = sxDisplay(SxScale.label, color, FontWeight.Medium),
    )
}

// --- Corner brackets: the instrument-panel motif, hero panels only ---------
// (phone hairlines make brackets noise everywhere else — register rule)

fun Modifier.cornerBrackets(color: Color, arm: Float = 34f, stroke: Float = 3.5f) =
    drawBehind {
        val w = size.width
        val h = size.height
        val corners = listOf(
            Pair(Offset(0f, 0f), Pair(Offset(arm, 0f), Offset(0f, arm))),
            Pair(Offset(w, 0f), Pair(Offset(w - arm, 0f), Offset(w, arm))),
            Pair(Offset(0f, h), Pair(Offset(arm, h), Offset(0f, h - arm))),
            Pair(Offset(w, h), Pair(Offset(w - arm, h), Offset(w, h - arm))),
        )
        corners.forEach { (corner, arms) ->
            drawLine(color, corner, arms.first, strokeWidth = stroke)
            drawLine(color, corner, arms.second, strokeWidth = stroke)
        }
    }

// --- Status pip: the house diamond (rotated square), filled = in contact,
// hollow = beyond the horizon (uncertainty as texture) ----------------------

@Composable
fun DiamondPip(color: Color, filled: Boolean = true, sizeDp: Int = 8) {
    androidx.compose.foundation.Canvas(Modifier.size(sizeDp.dp)) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val r = size.width / 2f
        val path = androidx.compose.ui.graphics.Path().apply {
            moveTo(c.x, c.y - r); lineTo(c.x + r, c.y)
            lineTo(c.x, c.y + r); lineTo(c.x - r, c.y); close()
        }
        if (filled) drawPath(path, color)
        else drawPath(path, color, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2f))
    }
}

