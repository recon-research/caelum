// SQUALL — SEXTANT's landscape game-HUD exemplar (fictional product; register: SEXTANT).
//
// Pass-1 plan (design-craft § The two-pass process):
//   Subject   — storm-line canyon racer, mid-run. Audience: player in a two-thumb
//               landscape grip. One job: scene readable at a glance, HUD teaching
//               without a manual, thumbs owning the corners.
//   Tokens    — tokens.kt; scene palette in SxScene (content may be any luminance,
//               but its hex still lives in the token home). Dark only: the HUD sits
//               on the scene, not on a theme — stated in the gallery ledger.
//   Layout    — corner-anchored clusters inside the safe rect (never the display
//               corners): lap/split top-left · gate banner top-center · pause
//               top-right · speed instrument center-right · steer ghost bottom-left ·
//               brake/boost bottom-right. Every HUD glyph carries a dark under-halo
//               (bright-scene rule, inherited from HALCYON).
//   Signature — the gust ring: a compass ring around the speed readout where wind
//               direction and strength render as an arc sector — the player reads
//               storms like an instrument.
//   Copy      — coaching in the racer's vernacular ("crosswind ahead — hug the left
//               wall"); split delta green because ahead-of-pace is a judgment.
//   Limit     — game FEEL (motion, timing, touch response) is not judgeable from a
//               still; this golden gates composition, readability, and safe-area
//               discipline only (gallery ledger states it).
package dev.template.sextant

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// ---------------------------------------------------------------------------
// Run state — one source; the banner, the track gates, the split judgment, and
// the boost segments all derive from here (Gate C′ by construction).
// ---------------------------------------------------------------------------

private const val LAP = 2
private const val LAPS_TOTAL = 3
private const val NEXT_GATE = 7
private const val GATES_TOTAL = 12
private const val SPLIT_S = -1.84          // negative = ahead of best
private const val SPEED_KN = 212
private const val GUST_KN = 28
private const val GUST_BEARING_DEG = 40f   // screen: 0° = east, 90° = south (↘)
private const val BOOST_SEGMENTS = 3
private const val BOOST_CHARGED = 2

private fun splitText(): String {
    val s = if (SPLIT_S <= 0) "-" else "+"
    val abs = kotlin.math.abs(SPLIT_S)
    val m = abs.toInt() / 60
    val sec = abs - m * 60
    return "$s$m:${"%05.2f".format(java.util.Locale.US, sec)}"
}

// ---------------------------------------------------------------------------

@Composable
fun StormHudScreen() {
    val sx = SxDark // scene-driven surface: SQUALL does not theme light
    Box(Modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) { drawCanyonScene(sx) }
        Box(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(SxDim.s6)
        ) {
            LapCluster(sx, Modifier.align(Alignment.TopStart))
            GateBanner(sx, Modifier.align(Alignment.TopCenter))
            PauseButton(sx, Modifier.align(Alignment.TopEnd))
            SpeedInstrument(sx, Modifier.align(Alignment.CenterEnd).offset(y = (-48).dp))
            SteerGhost(sx, Modifier.align(Alignment.BottomStart))
            BoostCluster(sx, Modifier.align(Alignment.BottomEnd))
        }
    }
}

// --- HUD clusters -----------------------------------------------------------

@Composable
private fun LapCluster(sx: SxColors, modifier: Modifier) {
    Column(modifier) {
        BasicText("LAP $LAP/$LAPS_TOTAL", style = sxDisplay(SxScale.prose, sx.ink).haloed())
        Spacer(Modifier.height(SxDim.s1))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val ahead = SPLIT_S <= 0
            BasicText(
                splitText(),
                style = sxMono(SxScale.readout, if (ahead) sx.green else sx.red, FontWeight.Medium).haloed(),
            )
            Spacer(Modifier.width(SxDim.s2))
            BasicText("vs best", style = sxBody(SxScale.micro, sx.muted).haloed())
        }
    }
}

@Composable
private fun GateBanner(sx: SxColors, modifier: Modifier) {
    Column(
        modifier
            .background(SxScene.scrim, RoundedCornerShape(SxDim.rTouch))
            .padding(horizontal = SxDim.s4, vertical = SxDim.s2),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BasicText("GATE $NEXT_GATE OF $GATES_TOTAL", style = sxDisplay(SxScale.title, sx.ink))
        Spacer(Modifier.height(2.dp))
        BasicText("crosswind ahead — hug the left wall", style = sxBody(SxScale.body, sx.muted))
    }
}

@Composable
private fun PauseButton(sx: SxColors, modifier: Modifier) {
    Box(
        modifier
            .size(SxDim.minTarget)
            .background(SxScene.scrim, RoundedCornerShape(SxDim.rTouch)),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(14.dp)) {
            val barW = size.width * 0.3f
            drawRect(sx.ink, topLeft = Offset(0f, 0f), size = Size(barW, size.height))
            drawRect(sx.ink, topLeft = Offset(size.width - barW, 0f), size = Size(barW, size.height))
        }
    }
}

@Composable
private fun SpeedInstrument(sx: SxColors, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(148.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) { drawGustRing(sx) }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                BasicText(
                    "$SPEED_KN",
                    style = sxMono(SxScale.heroGame, sx.ink, FontWeight.Medium).haloed(),
                )
                BasicText("KN", style = sxDisplay(SxScale.label, sx.muted).haloed())
            }
        }
        Spacer(Modifier.height(SxDim.s1))
        Box(Modifier.background(SxScene.scrim, RoundedCornerShape(SxDim.rTouch)).padding(horizontal = SxDim.s2, vertical = 3.dp)) {
            BasicText("gust $GUST_KN kn ↘", style = sxMono(SxScale.body, sx.cyan))
        }
    }
}

private fun DrawScope.drawGustRing(sx: SxColors) {
    val pad = 10f
    val rect = Offset(pad, pad) to Size(size.width - 2 * pad, size.height - 2 * pad)
    // ring track
    drawArc(
        color = sx.ink.copy(alpha = 0.28f),
        startAngle = 0f, sweepAngle = 360f, useCenter = false,
        topLeft = rect.first, size = rect.second, style = Stroke(width = 3f),
    )
    // gust sector: position = bearing, sweep = strength (28 kn of the 40 kn scale → 63°)
    val sweep = 90f * GUST_KN / 40f
    drawArc(
        color = sx.cyan,
        startAngle = GUST_BEARING_DEG - sweep / 2f, sweepAngle = sweep, useCenter = false,
        topLeft = rect.first, size = rect.second, style = Stroke(width = 9f),
    )
}

@Composable
private fun SteerGhost(sx: SxColors, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(88.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                drawCircle(sx.ink.copy(alpha = 0.35f), style = Stroke(width = 3f))
                drawCircle(sx.ink.copy(alpha = 0.5f), radius = 9f)
            }
        }
        // teaching that fades: shown at hint strength until the thumb has learned it
        BasicText("steer", style = sxBody(SxScale.micro, sx.ink.copy(alpha = 0.55f)).haloed())
    }
}

@Composable
private fun BoostCluster(sx: SxColors, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.background(SxScene.scrim, RoundedCornerShape(SxDim.rTouch)).padding(horizontal = SxDim.s2, vertical = 2.dp)) {
            BasicText("charge $BOOST_CHARGED/$BOOST_SEGMENTS", style = sxMono(SxScale.micro, sx.amber))
        }
        Spacer(Modifier.height(SxDim.s2))
        Row(verticalAlignment = Alignment.Bottom) {
            Box(
                Modifier
                    .size(64.dp)
                    .background(SxScene.scrim, CircleShape)
                    .border(2.dp, sx.ink.copy(alpha = 0.6f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                BasicText("BRAKE", style = sxDisplay(SxScale.micro, sx.ink, FontWeight.Medium))
            }
            Spacer(Modifier.width(SxDim.s3))
            Box(Modifier.size(108.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize()) { drawBoostSegments(sx) }
                Box(
                    Modifier.size(96.dp).background(sx.amber, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    BasicText("BOOST", style = sxDisplay(SxScale.row, sx.bg, FontWeight.SemiBold))
                }
            }
        }
    }
}

private fun DrawScope.drawBoostSegments(sx: SxColors) {
    val pad = 3f
    val tl = Offset(pad, pad)
    val sz = Size(size.width - 2 * pad, size.height - 2 * pad)
    val seg = 360f / BOOST_SEGMENTS
    repeat(BOOST_SEGMENTS) { i ->
        val filled = i < BOOST_CHARGED
        drawArc(
            color = if (filled) sx.amber else sx.ink.copy(alpha = 0.22f),
            startAngle = -90f + i * seg + 4f, sweepAngle = seg - 8f, useCenter = false,
            topLeft = tl, size = sz, style = Stroke(width = 5f),
        )
    }
}

// --- The scene: dusk canyon, deterministic to the pixel ----------------------

private fun DrawScope.drawCanyonScene(sx: SxColors) {
    val w = size.width
    val h = size.height
    val horizon = h * 0.62f

    // sky falling to the storm-light band (a sky IS a gradient — earned)
    drawRect(
        brush = Brush.verticalGradient(
            0f to SxScene.skyHigh, 0.62f to SxScene.skyLow, 1f to SxScene.horizonGlow,
            startY = 0f, endY = horizon,
        ),
        topLeft = Offset(0f, 0f), size = Size(w, horizon),
    )
    // canyon floor
    drawRect(
        brush = Brush.verticalGradient(
            0f to SxScene.wallMid, 1f to SxScene.wallNear,
            startY = horizon, endY = h,
        ),
        topLeft = Offset(0f, horizon), size = Size(w, h - horizon),
    )
    // canyon walls — three silhouette depths per side
    fun ridge(points: List<Pair<Float, Float>>, color: androidx.compose.ui.graphics.Color) {
        val p = Path()
        p.moveTo(points.first().first * w, points.first().second * h)
        points.drop(1).forEach { (x, y) -> p.lineTo(x * w, y * h) }
        p.close()
        drawPath(p, color)
    }
    ridge(listOf(0f to 0.62f, 0f to 0.30f, 0.10f to 0.38f, 0.19f to 0.28f, 0.30f to 0.62f), SxScene.wallFar)
    ridge(listOf(1f to 0.62f, 1f to 0.24f, 0.90f to 0.34f, 0.80f to 0.30f, 0.68f to 0.62f), SxScene.wallFar)
    ridge(listOf(0f to 0.80f, 0f to 0.36f, 0.09f to 0.46f, 0.16f to 0.40f, 0.26f to 0.72f, 0.30f to 0.80f), SxScene.wallMid)
    ridge(listOf(1f to 0.86f, 1f to 0.32f, 0.93f to 0.44f, 0.85f to 0.42f, 0.74f to 0.80f, 0.70f to 0.86f), SxScene.wallMid)
    ridge(listOf(0f to 1f, 0f to 0.52f, 0.07f to 0.60f, 0.13f to 0.56f, 0.22f to 1f), SxScene.wallNear)
    ridge(listOf(1f to 1f, 1f to 0.50f, 0.94f to 0.62f, 0.87f to 0.58f, 0.78f to 1f), SxScene.wallNear)

    // track: two edges converging on the vanishing point
    val vx = w * 0.55f
    val vy = horizon
    drawLine(SxScene.track, Offset(w * 0.40f, h), Offset(vx, vy), strokeWidth = 3f)
    drawLine(SxScene.track, Offset(w * 0.74f, h), Offset(vx, vy), strokeWidth = 3f)
    // center dashes, shrinking with distance
    listOf(0.92f, 0.78f, 0.68f, 0.61f).forEachIndexed { i, t ->
        val y0 = vy + (h - vy) * (t - 0.58f) / 0.42f
        val x = vx + (w * 0.57f - vx) * (y0 - vy) / (h - vy)
        drawLine(
            SxScene.track.copy(alpha = 0.7f),
            Offset(x, y0), Offset(x, y0 + (h - vy) * 0.045f * (1.2f - i * 0.22f)),
            strokeWidth = 3f - i * 0.5f,
        )
    }

    // the three nearest gates (7, 8, 9): cyan frames straddling the track,
    // nearest brightest — the banner's "GATE 7 OF 12" is the one you meet first
    listOf(
        Triple(0.30f, 1.0f, 7f), Triple(0.55f, 0.55f, 4.5f), Triple(0.72f, 0.35f, 3f),
    ).forEach { (t, alpha, stroke) ->
        val y = h - (h - vy) * t
        val half = w * 0.19f * (1f - t * 0.80f)
        val gh = h * 0.24f * (1f - t * 0.90f)
        val cx = vx + (w * 0.585f - vx) * (y - vy) / (h - vy)
        val p = Path().apply {
            moveTo(cx - half, y)
            lineTo(cx - half * 0.86f, y - gh)
            lineTo(cx + half * 0.86f, y - gh)
            lineTo(cx + half, y)
        }
        drawPath(p, sx.cyan.copy(alpha = alpha), style = Stroke(width = stroke))
    }

    // rain: fixed LCG — two renders of one commit are identical to the pixel
    var seed = 7L
    repeat(46) {
        seed = (seed * 1103515245L + 12345L) and 0x7FFFFFFFL
        val x = (seed % 1000L) / 1000f * w
        seed = (seed * 1103515245L + 12345L) and 0x7FFFFFFFL
        val y = (seed % 1000L) / 1000f * h * 0.9f
        seed = (seed * 1103515245L + 12345L) and 0x7FFFFFFFL
        val a = 0.12f + (seed % 100L) / 100f * 0.16f
        drawLine(
            SxScene.rain.copy(alpha = a),
            Offset(x, y), Offset(x - 7f, y + 30f),
            strokeWidth = 1.6f,
        )
    }
}
