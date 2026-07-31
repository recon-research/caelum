// capture_ui mount — renders whichever specimen ?screen= names, under the ?theme= it sets.
// Generalized from the EXP-03 harness (#150). A specimen is a *.jsx that default-exports a
// component composed with real props and real copy (design_review Pass-1 discipline), living
// in the project's own specimens dir (CAPTURE_SPECIMENS), symlinked in by capture.mjs.
import React from "react";
import { createRoot } from "react-dom/client";

const params = new URLSearchParams(location.search);
const theme = params.get("theme");
if (theme) document.documentElement.dataset.theme = theme; // themed CSS keys off [data-theme=…]

const mods = import.meta.glob("./specimens/*.jsx");
const id = params.get("screen");
const key = `./specimens/${id}.jsx`;
if (!mods[key]) throw new Error(`unknown specimen: ${id}`);
mods[key]().then((m) =>
  createRoot(document.getElementById("root")).render(React.createElement(m.default, { theme }))
);
