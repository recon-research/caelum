import type { MatMenuPanel } from '@angular/material/menu';

/**
 * The structural seam a `cae-menu` exposes so a *trigger* — `cae-button`'s `menuTriggerFor`
 * input (#57) or the `caeMenuTriggerFor` directive — can wire the menu's overlay panel into
 * Material's `MatMenuTrigger` without importing the `CaeMenu` *class*. Homing it in
 * `caelum/shared` (a type-only entry point) rather than in `caelum/menu` keeps `caelum/button`
 * free of any runtime dependency on `caelum/menu`: cae-button names this interface (an
 * `import type`, erased at build) and never drags menu/overlay code into every button bundle.
 * `CaeMenu` implements it, so a consumer still binds the `cae-menu` instance directly
 * (`[menuTriggerFor]="myCaeMenu"`) — the structural type only decouples the two entry points,
 * the same reasoning that homes `CaeTooltipPosition` here (#36). Type-only: `import type` keeps
 * `caelum/shared` runtime-free.
 */
export interface CaeMenuPanelHost {
  /**
   * The underlying Material menu panel, for a trigger to open. `undefined` until the menu's
   * view has initialised (it resolves reactively after first render), so read it reactively —
   * a trigger wires it as `?? null`, which `MatMenuTrigger` treats as "no menu" (inert).
   */
  getMenuPanel(): MatMenuPanel | undefined;
}
