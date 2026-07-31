// BOSUN — SEXTANT's portrait app exemplar (fictional product; register: SEXTANT).
//
// Pass-1 plan (design-craft § The two-pass process):
//   Subject   — field companion for an autonomous survey-drone fleet. Audience: the
//               field ops tech in the paddock, sun on the screen. One job: fleet state
//               at a glance, act on the one drone that needs attention.
//   Tokens    — tokens.kt (SxDark/SxLight). Display Chakra Petch, mono IBM Plex Mono,
//               body Roboto (the platform's own face). Rounded where the thumb lands,
//               square where data lives.
//   Layout    — single column, one job per zone: top bar → pass-horizon instrument →
//               battery strip → fleet list → wind-hold alert → bottom nav. Primary
//               action bottom-third (one-thumb law).
//   Signature — the pass-horizon arc: the comms horizon as a wide instrument arc,
//               drone diamonds at bearing (hollow = beyond the horizon), time to next
//               contact big and tabular at its center.
//   Copy      — real, from the subject's world; every repeated value derives from the
//               one fleet dataset below, so cross-surface truth (Gate C′) holds by
//               construction rather than by proofreading.
package dev.template.sextant

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

// ---------------------------------------------------------------------------
// Data — ONE source. Every count, id, percentage, and reason on this screen is
// derived from these values at render time (numbers interlock or don't ship).
// ---------------------------------------------------------------------------

data class Drone(
    val id: String,
    val status: String,
    val detail: String,
    val batteryPct: Int,
    val rangeKm: Double,
    val bearingDeg: Float,   // -90 (west horizon) .. +90 (east horizon)
    val inContact: Boolean,  // false = beyond the comms horizon
    val attention: Boolean,  // the amber chain
)

private val fleet = listOf(
    Drone("BSN-01", "mapping", "row 12 of 30", 87, 1.2, -62f, true, false),
    Drone("BSN-02", "in transit", "leg 3 · beyond horizon", 74, 3.8, -21f, false, false),
    Drone("BSN-04", "landing", "pad B", 31, 0.4, 8f, true, true),
    Drone("BSN-07", "holding", "", 66, 2.1, 33f, true, false), // detail derives from the alert
    Drone("BSN-09", "mapping", "row 4 of 30", 91, 2.7, 58f, true, false),
    Drone("BSN-12", "charging", "pad A", 44, 0.0, 74f, true, false),
)

data class WindAlert(val droneId: String, val gustKn: Int, val abortKn: Int, val altitudeM: Int, val gridRow: Int)

private val alerts = listOf(WindAlert("BSN-07", 28, 32, 40, 9))

private const val NEXT_CONTACT = "06:12"
private const val MISSION_TAG = "SURVEY 47-C · GRID 9"
private const val UTC_NOW = "UTC 21:47:12"
private const val LAST_PACKET = "pkt 00:03" // the alive element; frozen in goldens

private fun Drone.detailText(): String =
    alerts.find { it.droneId == id }?.let { "gusts ${it.gustKn} kn" } ?: detail

// ---------------------------------------------------------------------------

@Composable
fun FleetCompanionScreen() {
    val sx = LocalSx.current
    // the alert docks above the nav — the command tray: attention and its actions
    // live in the thumb zone (one-thumb law), never below the fold
    Scaffold(
        containerColor = sx.bg,
        bottomBar = {
            Column {
                AlertCard(sx, Modifier.padding(horizontal = SxDim.s4, vertical = SxDim.s2))
                BosunNav(sx)
            }
        },
    ) { pad ->
        Column(
            Modifier
                .padding(pad)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SxDim.s4)
        ) {
            TopBar(sx)
            PassHorizonPanel(sx)
            Spacer(Modifier.height(SxDim.s3))
            BatteryPanel(sx)
            Spacer(Modifier.height(SxDim.s4))
            Eyebrow("Deployed · ${fleet.size}", sx.muted)
            Spacer(Modifier.height(SxDim.s1))
            fleet.forEachIndexed { i, d ->
                FleetRow(sx, d)
                if (i < fleet.lastIndex) HorizontalDivider(color = sx.lineSoft, thickness = 1.dp)
            }
            Spacer(Modifier.height(SxDim.s4))
        }
    }
}

// --- Top bar ----------------------------------------------------------------

@Composable
private fun TopBar(sx: SxColors) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = SxDim.s4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            BasicText("BOSUN", style = sxDisplay(SxScale.title, sx.ink))
            Spacer(Modifier.height(SxDim.s1))
            BasicText(MISSION_TAG, style = sxMono(SxScale.micro, sx.muted))
        }
        Column(horizontalAlignment = Alignment.End) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).background(sx.cyan, CircleShape))
                Spacer(Modifier.width(6.dp))
                BasicText(LAST_PACKET, style = sxMono(SxScale.label, sx.cyan))
            }
            Spacer(Modifier.height(2.dp))
            BasicText(UTC_NOW, style = sxMono(SxScale.micro, sx.muted))
        }
    }
}

// --- Pass horizon: the signature instrument ----------------------------------

@Composable
private fun PassHorizonPanel(sx: SxColors) {
    val rising = fleet.first { !it.inContact }
    Column(
        Modifier
            .fillMaxWidth()
            .background(sx.surface)
            .border(1.dp, sx.lineSoft)
            .cornerBrackets(sx.line)
            .padding(SxDim.s4)
    ) {
        Row(Modifier.fillMaxWidth()) {
            Eyebrow("Pass horizon", sx.muted, Modifier.weight(1f))
            BasicText("160° SWEEP", style = sxMono(SxScale.micro, sx.muted))
        }
        Box(Modifier.fillMaxWidth().height(148.dp)) {
            Canvas(Modifier.fillMaxSize()) { drawHorizonArc(sx) }
            Column(
                Modifier.align(Alignment.BottomCenter).padding(bottom = SxDim.s2),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BasicText(NEXT_CONTACT, style = sxMono(SxScale.hero, sx.ink, FontWeight.Medium))
                Spacer(Modifier.height(2.dp))
                BasicText(
                    "next contact · ${rising.id} rising",
                    style = sxBody(SxScale.body, sx.muted),
                )
            }
        }
    }
}

private fun DrawScope.drawHorizonArc(sx: SxColors) {
    val cx = size.width / 2f
    val cy = size.height * 0.96f
    val r = minOf(size.width / 2f - 12f, size.height * 0.88f)
    // horizon baseline
    drawLine(sx.lineSoft, Offset(0f, cy), Offset(size.width, cy), strokeWidth = 2f)
    // the arc
    drawArc(
        color = sx.line,
        startAngle = 180f, sweepAngle = 180f, useCenter = false,
        topLeft = Offset(cx - r, cy - r), size = Size(2 * r, 2 * r),
        style = Stroke(width = 3f),
    )
    // bearing ticks every 30°
    for (deg in listOf(-60, -30, 0, 30, 60)) {
        val a = Math.toRadians(270.0 + deg)
        val outer = Offset(cx + (r + 0f) * cos(a).toFloat(), cy + r * sin(a).toFloat())
        val inner = Offset(cx + (r - 10f) * cos(a).toFloat(), cy + (r - 10f) * sin(a).toFloat())
        drawLine(sx.faint, inner, outer, strokeWidth = 2f)
    }
    // one diamond per drone, at bearing; hollow = beyond the horizon
    fleet.forEach { d ->
        val a = Math.toRadians(270.0 + d.bearingDeg)
        val p = Offset(cx + r * cos(a).toFloat(), cy + r * sin(a).toFloat())
        val dr = 11f
        val path = Path().apply {
            moveTo(p.x, p.y - dr); lineTo(p.x + dr, p.y)
            lineTo(p.x, p.y + dr); lineTo(p.x - dr, p.y); close()
        }
        val color = if (d.attention) sx.amber else sx.cyan
        // dark backing so diamonds read over the arc line
        drawPath(path, sx.surface)
        if (d.inContact) drawPath(path, color)
        else drawPath(path, color, style = Stroke(width = 3f))
    }
}

// --- Fleet battery strip ------------------------------------------------------

@Composable
private fun BatteryPanel(sx: SxColors) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(sx.surface)
            .border(1.dp, sx.lineSoft)
            .padding(SxDim.s4)
    ) {
        Eyebrow("Fleet battery", sx.muted)
        Spacer(Modifier.height(SxDim.s3))
        Row(Modifier.fillMaxWidth()) {
            fleet.forEach { d ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    val fill = if (d.attention) sx.amber else sx.cyan
                    Box(Modifier.size(width = 10.dp, height = 36.dp).background(sx.lineSoft)) {
                        Box(
                            Modifier
                                .align(Alignment.BottomCenter)
                                .fillMaxWidth()
                                .height((36 * d.batteryPct / 100).dp)
                                .background(fill)
                        )
                    }
                    Spacer(Modifier.height(SxDim.s1))
                    BasicText(
                        "${d.batteryPct}",
                        style = sxMono(SxScale.micro, if (d.attention) sx.amber else sx.ink),
                    )
                    BasicText(d.id.takeLast(2), style = sxMono(SxScale.micro, sx.muted))
                }
            }
        }
        Spacer(Modifier.height(SxDim.s3))
        Row(
            Modifier.background(sx.green.copy(alpha = 0.14f)).padding(horizontal = SxDim.s3, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(6.dp).background(sx.green, CircleShape))
            Spacer(Modifier.width(SxDim.s2))
            BasicText(
                "Looks right — drains match the flight plan",
                style = sxBody(SxScale.label, sx.ink),
            )
        }
    }
}

// --- Fleet list ----------------------------------------------------------------

@Composable
private fun FleetRow(sx: SxColors, d: Drone) {
    Row(
        Modifier.fillMaxWidth().height(SxDim.row),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DiamondPip(
            color = if (d.attention) sx.amber else sx.cyan,
            filled = d.inContact,
        )
        Spacer(Modifier.width(SxDim.s3))
        Column(Modifier.weight(1f)) {
            BasicText(d.id, style = sxMono(SxScale.row, sx.ink, FontWeight.Medium))
            BasicText(
                "${d.status} · ${d.detailText()}".trimEnd(' ', '·'),
                style = sxBody(SxScale.body, sx.muted),
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            BasicText(
                "${d.batteryPct}%",
                style = sxMono(SxScale.row, if (d.attention) sx.amber else sx.ink),
            )
            BasicText("${d.rangeKm} km", style = sxMono(SxScale.micro, sx.muted))
        }
    }
}

// --- Wind-hold alert: gates that explain themselves ------------------------------

@Composable
private fun AlertCard(sx: SxColors, modifier: Modifier = Modifier) {
    val a = alerts.first()
    val landing = fleet.first { it.status == "landing" }
    val margin = a.abortKn - a.gustKn
    Column(
        modifier
            .fillMaxWidth()
            .background(sx.surface2, RoundedCornerShape(SxDim.rTouch))
            .border(1.dp, sx.line, RoundedCornerShape(SxDim.rTouch))
            .padding(SxDim.s4)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Eyebrow("Wind hold", sx.amber, Modifier.weight(1f))
            BasicText(a.droneId, style = sxMono(SxScale.label, sx.ink, FontWeight.Medium))
        }
        Spacer(Modifier.height(SxDim.s2))
        BasicText(
            "${a.droneId} is holding at ${a.altitudeM} m over grid row ${a.gridRow}. " +
                "Resuming flies into gusts $margin kn under the ${a.abortKn} kn abort line.",
            style = sxBody(SxScale.body, sx.muted),
        )
        Spacer(Modifier.height(SxDim.s3))
        Row {
            Button(
                onClick = {},
                colors = ButtonDefaults.buttonColors(containerColor = sx.amber, contentColor = sx.bg),
                shape = RoundedCornerShape(SxDim.rTouch),
                contentPadding = PaddingValues(horizontal = SxDim.s3),
                modifier = Modifier.weight(1f).height(SxDim.minTarget),
            ) {
                BasicText(
                    "RESUME ROUTE",
                    style = sxDisplay(SxScale.body, sx.bg, FontWeight.Medium),
                    maxLines = 1,
                )
            }
            Spacer(Modifier.width(SxDim.s3))
            OutlinedButton(
                onClick = {},
                enabled = false,
                border = BorderStroke(1.dp, sx.lineSoft),
                colors = ButtonDefaults.outlinedButtonColors(disabledContentColor = sx.faint),
                shape = RoundedCornerShape(SxDim.rTouch),
                contentPadding = PaddingValues(horizontal = SxDim.s3),
                modifier = Modifier.weight(1f).height(SxDim.minTarget),
            ) {
                BasicText(
                    "HOLD FLEET",
                    style = sxDisplay(SxScale.body, sx.faint, FontWeight.Medium),
                    maxLines = 1,
                )
            }
        }
        Spacer(Modifier.height(SxDim.s2))
        // a faint disabled label never carries its reason alone — repeated in muted
        BasicText(
            "${landing.id} is landing — holds resume after touchdown",
            style = sxBody(SxScale.label, sx.muted),
        )
    }
}

// --- Bottom nav: M3 NavigationBar wearing the register ----------------------------

@Composable
private fun BosunNav(sx: SxColors) {
    NavigationBar(containerColor = sx.surface, tonalElevation = 0.dp) {
        NavItem(sx, "Fleet", selected = true) { FleetGlyph(it) }
        NavItem(sx, "Map", selected = false) { MapGlyph(it) }
        NavItem(sx, "Alerts", selected = false) { c ->
            BadgedBox(badge = {
                Badge(containerColor = sx.amber, contentColor = sx.bg) {
                    BasicText("${alerts.size}", style = sxMono(SxScale.micro, sx.bg, FontWeight.Medium))
                }
            }) { AlertGlyph(c) }
        }
        NavItem(sx, "Config", selected = false) { ConfigGlyph(it) }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.NavItem(
    sx: SxColors,
    name: String,
    selected: Boolean,
    icon: @Composable (Color) -> Unit,
) {
    NavigationBarItem(
        selected = selected,
        onClick = {},
        icon = { icon(LocalContentColor.current) },
        label = {
            val c = LocalContentColor.current
            BasicText(name, style = sxBody(SxScale.label, c, FontWeight.Medium))
        },
        colors = NavigationBarItemDefaults.colors(
            indicatorColor = sx.surface2,
            selectedIconColor = sx.ink, selectedTextColor = sx.ink,
            unselectedIconColor = sx.muted, unselectedTextColor = sx.muted,
        ),
    )
}

// Instrument glyphs, hand-drawn from tokens — no icon-set dependency.

@Composable
private fun FleetGlyph(color: Color) = Canvas(Modifier.size(22.dp)) {
    fun diamond(cx: Float, cy: Float, r: Float, filled: Boolean) {
        val p = Path().apply {
            moveTo(cx, cy - r); lineTo(cx + r, cy); lineTo(cx, cy + r); lineTo(cx - r, cy); close()
        }
        if (filled) drawPath(p, color) else drawPath(p, color, style = Stroke(2.5f))
    }
    diamond(size.width / 2f, size.height * 0.30f, size.width * 0.17f, true)
    diamond(size.width * 0.26f, size.height * 0.68f, size.width * 0.15f, false)
    diamond(size.width * 0.74f, size.height * 0.68f, size.width * 0.15f, false)
}

@Composable
private fun MapGlyph(color: Color) = Canvas(Modifier.size(22.dp)) {
    val p = Path().apply {
        moveTo(size.width * 0.14f, size.height * 0.82f)
        quadraticBezierTo(size.width * 0.38f, size.height * 0.44f, size.width * 0.58f, size.height * 0.58f)
        quadraticBezierTo(size.width * 0.74f, size.height * 0.68f, size.width * 0.86f, size.height * 0.22f)
    }
    drawPath(p, color, style = Stroke(2.5f))
    drawCircle(color, radius = 3f, center = Offset(size.width * 0.14f, size.height * 0.82f))
    drawCircle(color, radius = 3f, center = Offset(size.width * 0.86f, size.height * 0.22f))
}

@Composable
private fun AlertGlyph(color: Color) = Canvas(Modifier.size(22.dp)) {
    val p = Path().apply {
        moveTo(size.width / 2f, size.height * 0.12f)
        lineTo(size.width * 0.92f, size.height * 0.86f)
        lineTo(size.width * 0.08f, size.height * 0.86f)
        close()
    }
    drawPath(p, color, style = Stroke(2.5f))
    drawLine(
        color,
        Offset(size.width / 2f, size.height * 0.40f),
        Offset(size.width / 2f, size.height * 0.62f),
        strokeWidth = 2.5f,
    )
    drawCircle(color, radius = 1.8f, center = Offset(size.width / 2f, size.height * 0.74f))
}

@Composable
private fun ConfigGlyph(color: Color) = Canvas(Modifier.size(22.dp)) {
    val ys = listOf(0.26f, 0.52f, 0.78f)
    val knobs = listOf(0.68f, 0.32f, 0.55f)
    ys.forEachIndexed { i, fy ->
        val y = size.height * fy
        drawLine(color, Offset(size.width * 0.10f, y), Offset(size.width * 0.90f, y), strokeWidth = 2f)
        drawCircle(color, radius = 3.5f, center = Offset(size.width * knobs[i], y))
    }
}
