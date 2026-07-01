# Book 15 — Rich-Text Editor Adapter

> Volume III, Book 4 — the third *concrete* adapter, and the one that **completes the volume**. Book 12 set the pattern; Book 13 instantiated it on the data grid; Book 14 on charts; this book applies it to the **rich-text editor** — the third genuine gap (Angular Material ships no editor at all). The engine is **Lexical**, which `docs/ARCHITECTURE.md` **D-09** endorsed — and the research grounding for this book turned up the *favorable mirror* of the visx finding: where visx's render core was React-bound (Book 14 §2.3), **Lexical's core engine carries no React dependency at all** (React lives only in the separately-published `@lexical/react`, which Angular never imports). So unlike charts, **D-09 stands as-is — no refinement** — and Lexical is consumable in Angular as a *real* adapter. All version/library/provenance specifics are grounded in [`research/notes/lexical-editor.md`](../../research/notes/lexical-editor.md) — cited as a research note, never as a `Book §`. It implements **D-09**, which is **deferred for the build** (the heaviest gap, narrowest usage — ROADMAP cut order #1) but written here **in volume order**; the final library/provenance sign-off lands at **M2**.

## 1. TL;DR

A rich-text editor is the third gap Material fills **not at all** — like charts, a pure third-party case from zero. The adapter pattern applies unchanged (Book 12): a **neutral `CaeEditorAdapter` interface** in Caelum's vocabulary (`cae-editor`, signal IO, a Caelum-typed document model — no vendor type leaks, Book 12 §3.1), a **single `editor.adapter.ts`** membrane fenced by ESLint (Book 12 §3.2–§3.3), and **DI swap** via `CAE_EDITOR` + `provideCaelumEditor()` (Book 12 §3.4). The engine D-09 named — **Lexical** — turns out to be the *easy* case the research pass could have gone either way on: its core `lexical` package is a "dependency-free text editor engine" that works "independently of any framework or library," declaring **no `react`/`react-dom`** (research note). That is the inverse of visx (Book 14 §2.3), so **D-09 needs no refinement**: the adapter calls `createEditor()`, `setRootElement()` onto a `cae-editor`-owned `contenteditable`, and `registerRichText`/`registerHistory`, all in vanilla TypeScript behind the membrane. Two dimensions are new to this book. First, **an editor is a form control** — it must implement `ControlValueAccessor` so it plugs into reactive forms (Book 07 §3.1), exchanging a *neutral* document value, never Lexical's `EditorState`. Second, like charts the **fallback is a genuine floor**: for a small need, a CDK-toolbar over a plain `contenteditable` may beat adding Lexical at all (Book 14 §3.5; Book 12 §6; `brief §4`). Implements **D-09**; the provenance sign-off is **M2** work.

## 2. Conceptual Foundations

### 2.1 The gap Material fills *not at all*

Like charts (Book 14 §2.1), Material ships **no rich-text editor**, so there is no first-party floor to climb from — the honest first question (`brief §4`) is again **how big is the editor need?** And here, more than anywhere, the answer is usually "smaller than it looks." A comment box that needs bold/italic/links is not the same artifact as a document authoring surface with tables, images, mentions, and collaborative cursors. The editor is ROADMAP **cut order #1** — the heaviest gap with the narrowest usage — precisely because teams reach for a full editor engine when a `contenteditable` and three commands would do. The bottom rung (Book 12 §2.1) is reached only when the need is genuinely *engine-sized*: a real document model, undo/redo that survives complex selections, paste sanitization, serialization. This book builds the adapter for that case **and** keeps naming the cheaper exit (§3.6), because for the editor the cheaper exit is, as with charts, unusually often the right one.

### 2.2 Headless by core — Lexical's framework-agnostic engine

A rich-text editor's hard parts are not the toolbar buttons — they are the **document model**, **selection**, **undo/redo**, and **paste sanitization**, the things Book 05 §2.3 calls "ruinous to rebuild." Lexical is the analogue of the grid's headless engine (Book 13 §2.2) and the chart's D3 math (Book 14 §2.2): it owns that model and the editing logic, and leaves the *view* to you. Its core API is framework-agnostic by construction (research note): `createEditor(config)` returns an editor instance; `editor.setRootElement(el)` binds it to a `contenteditable` DOM element **you** own; `registerRichText(editor)` and `registerHistory(editor, createEmptyHistoryState(), 300)` wire behavior; all mutation runs inside `editor.update(() => …)` and is observed via `editor.registerUpdateListener(…)`. Nothing in that surface is React. That is the ideal adapter shape for the token bridge — the engine manages the model, the *markup stays ours*, and there is no vendor stylesheet to fight (Book 12 §3.5; Book 13 §2.2). A "batteries-included" editor that renders its own styled chrome would be a strictly worse candidate, for the same reason a CSS-shipping grid would be.

### 2.3 The favorable mirror of visx — Lexical's core is React-free, so D-09 stands

Book 14 §2.3 told the cautionary version of this story: D-08 endorsed visx, and the research pass found visx's render core was **React-bound**, forcing a refinement (D3-direct). This book tells the *favorable* version. Lexical also has a famous React layer — `@lexical/react` — and naïve recall ("Lexical is a React editor") would predict the same trap. The research pass found the opposite (research note): core `lexical` declares **no `react` dependency or peer**; its sole dependency is a zero-dependency `@lexical/internal` leaf, and the headless behavior modules (`@lexical/rich-text`, `@lexical/history`, `@lexical/utils`) are React-free too. The React peer is **quarantined entirely in `@lexical/react`** — a package the Angular adapter never lists in `package.json`. So **D-09 stands as-is, with no refinement**: Lexical is consumable in Angular as a *real* adapter, not the fallback-only outcome the visx case might have led you to fear.

The load-bearing lesson is the same as Book 14 §2.3, from the other direction: **the neutral interface made the framework-binding question cost nothing either way.** Had the core been React-bound, `cae-editor` would have fallen back to `contenteditable` (§3.6) with no change above the membrane; because it is React-free, the same `cae-editor` binds Lexical — also with no change above the membrane. The component and every call site are written against `CaeEditorAdapter`; which engine satisfies it is invisible. The neutrality test — *satisfiable two ways* (Book 12 §3.1; Book 13 §2.3) — is exactly what turns "does the endorsed library fit our framework?" from a project risk into a one-file implementation detail, whichever way the answer falls.

## 3. Architecture & Design

Book 13/14's method, instantiated for the editor. §3.1 the vendor-free interface (with a neutral *document value*); §3.2 the single membrane over `lexical`; §3.3 rendering the `contenteditable` through the token bridge; §3.4 the dimension new to this book — **the editor is a form control**; §3.5 a11y and the toolbar; §3.6 DI + the `contenteditable` fallback as the "size the need" lever, and the checklist.

### 3.1 The neutral editor interface — designed vendor-free

Write the interface as if Lexical did not exist (Book 12 §3.1; Book 13 §3.1). The hardest discipline here is the **value type**: the editor's content must cross the boundary as a *Caelum* type — a `CaeDoc` (an opaque, serializable document value — e.g. a tagged JSON or HTML string in Caelum's own shape), **never** Lexical's `EditorState`. The adapter port (`CaeEditorAdapter`, an abstract class used as a DI token) exposes `attach(el)` (bind to the host element), `getValue(): CaeDoc` / `setValue(doc: CaeDoc)`, a `value` change signal, command methods in Caelum's vocabulary (`toggleBold()`, `toggleItalic()`, `setLink(url)`, `toggleList(kind)`), and a `can`/active-state signal for toolbar reflection. The rule that keeps it real: **no Lexical type crosses the surface** — no `LexicalEditor`, no `EditorState`, no `RangeSelection`, no `$`-prefixed node. Apply the two-way test to each member: if you cannot imagine producing the same `CaeDoc` and honoring the same `toggleBold()` from a hand-rolled `contenteditable` adapter (§3.6), a Lexical concept has leaked. That two-way satisfiability is what made the framework-binding question free (§2.3).

### 3.2 The single membrane — `editor.adapter.ts` over `lexical`

Exactly one file imports `lexical` and the `@lexical/*` behavior modules (Book 12 §3.2). `editor.adapter.ts` calls `createEditor({ namespace, nodes, theme, onError })`, `setRootElement(el)`, and `mergeRegister(registerRichText(editor), registerHistory(editor, createEmptyHistoryState(), 300))` (research note), translates Caelum commands into `editor.update()` closures, and bridges `registerUpdateListener` callbacks into the adapter's `value` signal as serialized `CaeDoc`. The ESLint `no-restricted-imports` rule scopes every `lexical` / `@lexical/*` specifier to this one path (Book 12 §3.3) — the same membrane and anti-erosion guarantee as the grid (Book 13 §3.2), pointed at the Lexical packages. **One extra clause matters here:** the rule (and the dependency review, Book 03 §3.1) must ensure **`@lexical/react` is never added to `package.json` at all** — since it is the only place the React peer lives (§2.3), keeping it out of the dependency set means React cannot leak even by accident. Vendor types live only in this file; above the membrane, `cae-editor` knows only `CaeEditorAdapter`.

### 3.3 Rendering the contenteditable through the token bridge

Because the adapter binds Lexical to a `contenteditable` element that **`cae-editor` owns and styles**, every surface — the editing area, caret, selection highlight, placeholder, and the rendered marks (bold/heading/list/link styling) — is themed through `--cae-*` tokens (Book 04 §3.6; Book 12 §3.5; Book 13 §3.3). Lexical's `theme` config maps node types to **class names**, and those classes are Caelum's, resolving to token-driven rules — so there is no vendor stylesheet to import or override (research note: the engine ships editing logic, not chrome). The toolbar chrome (§3.5) is Caelum markup the same way. The result is an editor that is Caelum's DOM and Caelum's look end to end, re-theming and switching light/dark with the rest of the library for free (Book 04 §3.3) — the same headless dividend that made TanStack a clean grid candidate (Book 13 §2.2).

### 3.4 The editor is a form control — CVA at the boundary

This is the dimension the grid and charts books did not have: a rich-text editor is, to the application, **a form field**. It holds a value, it can be `required`, it is `touched` after the user leaves it, it can be `disabled`. So `cae-editor` implements **`ControlValueAccessor`** (Book 07 §3.1; Book 06 §3.4 — "`ControlValueAccessor` outside") and integrates with `mat-form-field` like any control (Book 07 §3.4): `writeValue(doc)` calls the adapter's `setValue`; the `registerUpdateListener` bridge calls the registered `onChange` with the neutral `CaeDoc`; blur calls `onTouched`; `setDisabledState` toggles the editor's `editable` flag through the adapter. The four control states (Book 07 §2.2) must render honestly — a disabled editor is visibly and behaviorally non-editable; an invalid one (e.g. empty-but-required, or over a length budget) shows error state via the same one matcher the library uses everywhere (Book 07 §3.3). Crucially, the value the form sees is the **neutral `CaeDoc`**, not `EditorState` — the form layer, validators, and persisted data never touch a Lexical type (§3.1). This is the control-authoring checklist of Book 07 §3.6 applied to the heaviest control in the library.

### 3.5 A11y, the toolbar, and the contenteditable surface

An editor is a11y-hard in two distinct places (Book 14 §3.4 made the charts case; this is the editor's). **The editing surface:** the `contenteditable` host needs an accessible name (label association through `mat-form-field`), and announcements for state changes should use the CDK `LiveAnnouncer` (Book 05 §3.2) rather than silent DOM mutation; Lexical manages selection and ARIA on the content correctly, but the *naming and error wiring* are the component's job, not the engine's (the "the adapter fills any a11y gap the library leaves" principle, Book 13 §3.6). **The toolbar:** a formatting toolbar is a **roving-tabindex toolbar** (one tab stop, arrow keys between controls, `aria-pressed` reflecting active marks) — prefer Angular Aria's toolbar pattern (Book 06 §2.2/§3.1) and fall back to a CDK `FocusKeyManager` (Book 05 §3.2) per the reach-for ladder. Toolbar buttons reflect the adapter's active-state signal (§3.1) so "bold is on" is both visible and announced. None of this comes from Lexical; the component owns all of it. Name it explicitly, because "it renders rich text" hides "it is unusable without a mouse and invisible to a screen reader."

### 3.6 DI wiring, the contenteditable fallback, and the checklist

`CAE_EDITOR` is an `InjectionToken`, `provideCaelumEditor()` provides the concrete adapter (Book 12 §3.4; the `provide*()` shape of Book 09 §3.1), and `cae-editor` injects the abstraction. The **fallback is a hand-rolled `contenteditable` adapter** — and per the cut order it is a first-class option, not a degraded mode: for a small need (bold/italic/lists/links), a `LexicalEditorAdapter` is overkill, and a `PlainContentEditableAdapter` satisfying the same `CaeEditorAdapter` interface — a `contenteditable` host, a CDK-managed toolbar, and a thin command layer — may be the *preferred* implementation (Book 14 §3.5; Book 12 §6; `brief §4`; ROADMAP cut order #1 explicitly permits "defer to a `contenteditable` stub"). DI turns the "size the editor need" decision into a **provider choice**, and the neutral interface makes it a one-file swap, not a rewrite (§2.3). The editor-adapter checklist (Book 13 §3.6's legs, adjusted, still tracing to Book 12 §3.6):

1. **Neutral interface, vendor-free** — no Lexical type crosses the surface; the value is a Caelum `CaeDoc`; satisfiable on Lexical *and* on hand-rolled `contenteditable` (§3.1).
2. **Single membrane + ESLint** — only `editor.adapter.ts` imports `lexical`/`@lexical/*`, CI-enforced; **and `@lexical/react` is absent from `package.json`** (§3.2; R6).
3. **Form control done right** — `ControlValueAccessor`, `mat-form-field` integration, the four states, neutral value (§3.4; Book 07 §3.6).
4. **Token-themed surface** — content area, caret, selection, marks, and toolbar read `--cae-*` only; no vendor stylesheet, no color literals (§3.3; Book 04 §3.6).
5. **A11y carried by the component** — accessible name + `LiveAnnouncer` + a roving-tabindex toolbar with `aria-pressed` (§3.5; Book 16).
6. **DI-swappable, fallback exists** — `CAE_EDITOR` token, `provideCaelumEditor()`, and a working `PlainContentEditableAdapter` (§3.6).
7. **Provenance signed at M2** — the `@lexical/*` tree (single-origin Meta/MIT over a zero-dep leaf — the cleanest of the three gaps, research note) walked with `npm ls` + a license scan and signed off (Book 03 §3.2; D-10).
8. **Need-sized** — confirmed the editor need is engine-sized, not three commands better hand-rolled (§2.1; `brief §4`).

## 4. Implementation

Illustrative pseudo-code (Angular 22, signal-first, `OnPush`) — shapes, not a compileable repo. Lexical specifics are kept to the surface the research note verified; the final library/version pin is an M2 decision.

**(a) The neutral, app-owned interface — no vendor types, a neutral value (§3.1).**

```ts
// cae-editor.types.ts
export type CaeDoc = { readonly format: 'cae-doc-v1'; readonly json: string };   // opaque, serializable — NOT EditorState
export type CaeListKind = 'bullet' | 'number';

export abstract class CaeEditorAdapter {                 // the port (used as a DI token)
  abstract attach(host: HTMLElement): void;              // binds to a contenteditable the COMPONENT owns
  abstract setValue(doc: CaeDoc | null): void;
  abstract getValue(): CaeDoc;
  abstract setEditable(editable: boolean): void;
  abstract toggleBold(): void;
  abstract toggleItalic(): void;
  abstract toggleList(kind: CaeListKind): void;
  abstract setLink(url: string | null): void;
  abstract readonly value: Signal<CaeDoc>;               // change stream, signal-driven (zoneless-safe, Book 01 §3.2)
  abstract readonly active: Signal<{ bold: boolean; italic: boolean; list: CaeListKind | null }>;  // toolbar reflection
  abstract destroy(): void;
}
```

**(b) DI wiring — provide the concrete adapter behind the token (§3.6).**

```ts
// cae-editor.providers.ts
export const CAE_EDITOR = new InjectionToken<CaeEditorAdapter>('CaeEditorAdapter');
export function provideCaelumEditor(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_EDITOR, useClass: LexicalEditorAdapter }]);
}
// a small need binds the zero-engine fallback instead: useClass: PlainContentEditableAdapter
```

**(c) The neutral component — injects the ABSTRACTION, owns the contenteditable, is a form control (§3.3–§3.5).**

```ts
@Component({
  selector: 'cae-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: CaeEditor, multi: true }],
  template: `
    <div role="toolbar" aria-label="Formatting" class="cae-editor__toolbar"><!-- roving tabindex; --cae-* themed (§3.5) -->
      <button type="button" [attr.aria-pressed]="adapter.active().bold" (click)="adapter.toggleBold()">B</button>
      <!-- …italic, lists, link… -->
    </div>
    <div #host class="cae-editor__content" (blur)="onTouched()"></div> <!-- contenteditable, Caelum-styled (§3.3) -->`,
})
export class CaeEditor implements ControlValueAccessor, AfterViewInit, OnDestroy {
  protected adapter = inject(CAE_EDITOR);                 // depends on the interface, not lexical
  private host = viewChild.required<ElementRef<HTMLElement>>('host');
  private onChange: (v: CaeDoc) => void = () => {};
  protected onTouched: () => void = () => {};
  ngAfterViewInit() {
    this.adapter.attach(this.host().nativeElement);
    effect(() => this.onChange(this.adapter.value()));   // bridge engine changes → form (neutral CaeDoc, §3.4)
  }
  writeValue(doc: CaeDoc | null) { this.adapter.setValue(doc); }       // CVA: form → engine
  registerOnChange(fn: (v: CaeDoc) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(disabled: boolean) { this.adapter.setEditable(!disabled); }
  ngOnDestroy() { this.adapter.destroy(); }
}
```

**(d) The single adapter file — the ONLY place Lexical is imported (§3.2).**

```ts
// editor.adapter.ts
import { createEditor } from 'lexical';                          // ← the one sanctioned import group (MIT, research note)
import { registerRichText } from '@lexical/rich-text';          //    core is framework-agnostic: NO react peer (§2.3)
import { registerHistory, createEmptyHistoryState } from '@lexical/history';
import { mergeRegister } from '@lexical/utils';
export class LexicalEditorAdapter implements CaeEditorAdapter {
  readonly value = signal<CaeDoc>({ format: 'cae-doc-v1', json: '' });   // template/form read back via a signal
  readonly active = signal({ bold: false, italic: false, list: null });
  private editor = createEditor({ namespace: 'cae', theme: caeTheme, onError: (e) => { throw e; } });
  private teardown = () => {};
  attach(host: HTMLElement) {
    this.editor.setRootElement(host);                            // bind to the COMPONENT's contenteditable
    this.teardown = mergeRegister(
      registerRichText(this.editor),
      registerHistory(this.editor, createEmptyHistoryState(), 300),
      this.editor.registerUpdateListener(({ editorState }) =>   // engine change → neutral CaeDoc (§3.4)
        this.value.set({ format: 'cae-doc-v1', json: JSON.stringify(editorState.toJSON()) })),
    );
  }
  toggleBold() { this.editor.update(() => { /* dispatch FORMAT_TEXT_COMMAND 'bold' */ }); }
  // …setValue via parseEditorState, setEditable via editor.setEditable, etc. Lexical types live ONLY in this file.
  destroy() { this.teardown(); }
}
```

**(e) The contenteditable fallback sketch — same interface, no engine (§3.6).**

```ts
// plain-contenteditable.adapter.ts — satisfies CaeEditorAdapter with a raw contenteditable; imports NO editor library.
export class PlainContentEditableAdapter implements CaeEditorAdapter { /* bold/italic/lists over a div — the §2.1 cheap exit */ }
```

The ESLint rule from Book 12 §3.3 closes the loop: any file other than `editor.adapter.ts` that imports `lexical`/`@lexical/*` fails the build — and `@lexical/react` is absent from the manifest entirely (§3.2). Above the membrane, nothing in Caelum knows whether the editor runs on Lexical or a hand-rolled `contenteditable` — which is what made the framework-binding question (§2.3) a one-file detail rather than a project risk.

## 5. Bleeding Edge

The settled-enough-to-teach frontier for the editor is three tensions — all library facts grounded in `research/notes/lexical-editor.md`, not memory:

- **Lexical is pre-1.0 and moves fast — don't pin before M2.** The research note found `lexical` at 0.46.0, faster-moving than D3 or TanStack; the neutral interface is the insurance that makes waiting free, and every adapter is provisional (Book 12 §5). The single fact that would change the calculus — a React peer migrating into the core package — is on the watch list, but it would contradict the project's whole headless design and is not expected.
- **The contenteditable fallback is a genuine floor, not a stub.** Because the editor is cut order #1, the `PlainContentEditableAdapter` (§3.6) is the most likely thing actually shipped first. `contenteditable` is famously sharp (paste sanitization, cross-browser selection quirks), so the fallback's honest scope is *small* — exactly the "size the need" point (§2.1; `brief §4`). When the need outgrows it, the swap to Lexical is one provider line.
- **Collaboration, zoneless, and SSR.** Real-time collaboration is Lexical's `@lexical/yjs` binding over **Yjs** — a *new third-party dependency with its own origin/license to vet* (Book 03 §2.3; D-10), so it is a separate adapter mode behind the same interface, gated at M2, not assumed. Zoneless needs care unlike D3's pure functions (Book 14 §5): Lexical is event-driven and mutates the `contenteditable` outside Angular's awareness, so the adapter bridges `registerUpdateListener` into signals and runs `editor.update()` without relying on zone-based change detection (Book 01 §3.2). A `@lexical/headless` mode (no DOM) exists for server-side serialization/validation (research note) — useful for SSR or sanitizing a `CaeDoc` on the server.

## 6. Gaps & Opportunities

- **Feature breadth admits incrementally via `@lexical/*` plugins.** bold/italic/lists/links/headings are cheap; richer nodes (tables via `@lexical/table`, images, mentions, markdown via `@lexical/markdown`) each pull an additional `@lexical/*` module — all same-origin Meta/MIT (research note), so they clear Book 03's gate cheaply, but each still admits through the membrane (one import site) and earns its keep against the need, not wholesale.
- **Collaboration (Yjs) is the notable new-dependency frontier.** It is the one editor feature that adds a *non-Lexical* runtime dependency, so it carries the only real provenance question in this gap — vet Yjs's origin/license at M2 before endorsing a collaborative mode (Book 03 §3.1; D-10). Default to single-user until a real need lands.
- **`add_adapter`, instantiated for the editor.** Same skeleton as the grid and charts (Book 13 §6; Book 14 §6): neutral interface + `editor.adapter.ts` + the ESLint override (plus the "`@lexical/react` stays out of `package.json`" clause) + `provideCaelumEditor()` + the `PlainContentEditableAdapter` — the isolation rule shipping in the same PR (R6).
- **Honest status: the editor is deferred (D-09), cut order #1.** The book is written so the discipline is ready; the *build* waits for the team's editor need (ROADMAP), and may ship the `contenteditable` fallback first. For the live status, read `MANIFEST.json` `coverage_gaps` (single-homed there).

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on editor-adapter work:

- **Scaffolding the skeleton + the CVA + the a11y.** Given an editor spec, an agent reliably emits the §3.6 skeleton (neutral interface with a `CaeDoc` value, `editor.adapter.ts`, the ESLint override, the provider, the `contenteditable` fallback), wires the `ControlValueAccessor` (§3.4 — easily forgotten because grid/charts were not form controls), and generates the roving-tabindex toolbar with `aria-pressed` (§3.5) — high-value, mechanically-derivable artifacts.
- **Catching erosion + the React leak.** Grepping a diff for any `import … from 'lexical'`/`'@lexical/…'` outside `editor.adapter.ts` is a reliable erosion lens (R6); the *editor-specific* check the agent must add is grepping `package.json` for **`@lexical/react`** and flagging it — its presence is how the React peer would sneak in (§2.3, §3.2).
- **Surfacing the framework-binding finding correctly.** The agent must route Lexical questions through `research/notes/lexical-editor.md` and report the **favorable** result — core `lexical` is React-free — rather than pattern-matching "Lexical → React" from `@lexical/react`'s fame (the inverse failure mode of the visx case, Book 14 §7; recall is wrong in *both* directions, which is why the note, not memory, is the source).

Where it is only ~1× and must defer to a human:

- **"Size the need."** Whether an editor need is engine-sized or three commands over a `contenteditable` (`brief §4`; §2.1) is a product/architecture call — and, as the heaviest gap, the one most likely to be over-answered toward "add Lexical."
- **The provenance sign-off** (the `@lexical/*` tree, and especially **Yjs** if collaboration is pursued — §6) — a compliance judgment at M2 (Book 03 §3.1).
- **Content-model & UX judgment** — what nodes the document supports, how paste is sanitized, what "valid content" means — is a product call, not the agent's to make.

## 8. Exercises & Further Reading

**Exercises:**
1. Write the `CaeEditorAdapter` interface and prove it neutral by sketching **both** a `LexicalEditorAdapter` (over core `lexical` + `@lexical/rich-text` + `@lexical/history`) and a `PlainContentEditableAdapter` against the same signature — naming no Lexical type, and making the value a `CaeDoc` (§2.3, §3.1; Book 12 §3.1).
2. **The favorable-mirror check:** find in `lexical`'s package metadata that it declares **no `react` peer**, then find the `react`/`react-dom` peers in `@lexical/react`, and write the one-paragraph explanation of why the core is usable in Angular while `@lexical/react` is not — the inverse of the visx exercise (Book 14 §8 ex. 2; research note).
3. Make `cae-editor` a real form control: implement `ControlValueAccessor`, bind it in a reactive form, and verify the form value is a neutral `CaeDoc` (not `EditorState`), that `disabled` and `required` work, and that it integrates with `mat-form-field` (§3.4; Book 07 §3.1/§3.4).
4. **A11y drill:** build the roving-tabindex toolbar (arrow-key navigation, `aria-pressed` reflecting active marks) and confirm the editor is fully keyboard-operable and announces state via `LiveAnnouncer` (§3.5; Book 05 §3.2; Book 16).
5. **Size-the-need:** implement bold/italic/lists on the `PlainContentEditableAdapter` (no engine) and again on Lexical, compare LOC + added bundle KB + paste-sanitization behavior, and write the verdict against `brief §4` (§2.1; Book 03).

**Further reading:** the library/version/provenance grounding for this book is [`research/notes/lexical-editor.md`](../../research/notes/lexical-editor.md) (a research note — web-sourced and staling, **not** a `Book §`); Lexical's docs at [`lexical.dev`](https://lexical.dev/) for the framework-agnostic core API (`createEditor`/`setRootElement`/`registerRichText`), with the caveat that `@lexical/react` is the **React** binding this book does not use. In this library: Book 12 (the adapter pattern this instantiates), Book 13 and Book 14 (the first two concrete adapters — the templates this mirrors: §2.2 headless-is-the-right-shape, §2.3 the interface as swap insurance / the framework-binding question, §3.1 the vendor-free interface, §3.3 token-themed render, §3.6 the checklist, §5 the provisional dependency), Book 07 §3.1/§3.4/§3.6 (the `ControlValueAccessor` contract the editor is the heaviest instance of), Book 06 §2.2/§3.1/§3.4 (the toolbar pattern and "CVA outside" the editor follows), Book 05 §3.2 (the CDK a11y engine behind the toolbar and announcements), Book 03 §2.3/§3.1/§3.2 (the `@lexical/*` tree and its M2 sign-off — and Yjs if collaboration is pursued), Book 04 §3.6 (the token bridge the contenteditable renders through), Book 01 §3.2 (zoneless + signal CD); and forward to Book 16 (Accessibility & Parity Verification — the editor is one of its hard cases), Book 18 (Performance & Bundle Budgets — the Lexical-tree cost vs the contenteditable floor), and Book 20 (Migration & Adoption — the PrimeNG Editor → `cae-editor` map). **This book completes Volume III — the adapter layer.**
