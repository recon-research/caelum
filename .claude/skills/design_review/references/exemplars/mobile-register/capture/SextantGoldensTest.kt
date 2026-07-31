// The SEXTANT goldens, as executable capture spec — the JVM-offscreen recipe's
// worked example (CAPTURE_CONTRACT.md › JVM-offscreen Android). Drop this file in
// an Android library module's test source set alongside the exemplar sources and
// `gradle recordPaparazziDebug` regenerates every golden, no emulator involved.
//
// Geometry map (contract item 2 — file names map back to surface × theme × width):
//   BosunPhoneGoldens    → fleet-companion-{dark,light}-412  (Pixel-standard 412×915dp)
//   BosunCompactGoldens  → fleet-companion-{dark,light}-360  (compact-width floor)
//   SquallGoldens        → storm-hud-dark-915                (landscape; scene-driven, no light theme)
package dev.template.sextant

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.resources.Density
import com.android.resources.ScreenOrientation
import org.junit.Rule
import org.junit.Test

class BosunPhoneGoldens {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    @Test
    fun fleet_companion_dark_412() =
        paparazzi.snapshot { SextantTheme(dark = true) { FleetCompanionScreen() } }

    @Test
    fun fleet_companion_light_412() =
        paparazzi.snapshot { SextantTheme(dark = false) { FleetCompanionScreen() } }
}

class BosunCompactGoldens {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6.copy(
            screenWidth = 720, screenHeight = 1560, density = Density.XHIGH, // 360×780dp
        ),
    )

    @Test
    fun fleet_companion_dark_360() =
        paparazzi.snapshot { SextantTheme(dark = true) { FleetCompanionScreen() } }

    @Test
    fun fleet_companion_light_360() =
        paparazzi.snapshot { SextantTheme(dark = false) { FleetCompanionScreen() } }
}

class SquallGoldens {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6.copy(
            screenWidth = 2400, screenHeight = 1080, // 915×412dp
            orientation = ScreenOrientation.LANDSCAPE,
        ),
    )

    @Test
    fun storm_hud_dark_915() =
        paparazzi.snapshot { StormHudScreen() }
}
