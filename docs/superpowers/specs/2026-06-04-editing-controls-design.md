# Editing Controls — Clear + Undo/Redo Design

**Date:** 2026-06-04
**Status:** Approved (pending spec review)
**Builds on:** `docs/superpowers/specs/2026-06-04-kspace-playground-design.md`

## 1. Summary

Two editing-safety/control features for the k-space Playground:

1. **Clear** — a toolbar button that blanks the whole workspace.
2. **Undo/Redo** — step backward/forward through edits, one stroke/action per step.

The **Clear** button is implemented now. **Undo/Redo** is specified and planned now,
implemented in a later session.

## 2. Context

The store (`src/engine/state.ts`, `createStore`) owns the two canonical buffers —
`spatial: Float32Array` (1 MB at N=512) and `spectrum: {re, im}` (2 MB) — and tracks
`lastEdited()` (the source-of-truth domain). All mutations (`editSpatial`, `editKspace`,
`setSpatial`, `setSpectrum`) run one transform and `emit()` a "buffers changed" event;
`src/main.ts` repaints both canvases on emit. The interaction layer
(`src/ui/interaction.ts`) is the only place that knows stroke boundaries, because a
single brush drag is coalesced into many per-animation-frame edits.

## 3. Clear button (implemented now)

**Behavior.** A single **Clear** button in the toolbar. On click it calls
`store.setSpatial(new Float32Array(N * N))`, blanking the spatial image to black; the
existing forward FFT makes the spectrum all-zero, and both canvases repaint through the
normal `subscribe` path.

**Decisions.**
- One button, full reset of both domains (not per-panel).
- Reuses the existing `setSpatial` path — no new store concepts, and Undo will wrap it
  automatically once built.
- **No confirmation dialog** for v1. An accidental clear is unrecoverable only until Undo
  ships; the simplicity is worth it. (Revisit if it proves annoying before Undo lands.)

**Testing.** Covered by the existing engine behavior (`setSpatial` zeroing → zero
spectrum is already trivially correct); the button is a one-line wiring verified by manual
smoke test.

## 4. Undo/Redo (specified now, implemented later)

### 4.1 Architecture — a UI-coordinated history manager

A new module `src/engine/history.ts` exposes `createHistory(store, { maxDepth })`. It
wraps the store through its **public interface only** (`getSpatial`, `getSpectrum`,
`lastEdited`, `setSpatial`, `setSpectrum`). The store remains unaware of history.

The **action boundary** (where a stroke begins and ends) is supplied by the interaction
layer, which is the only component that can distinguish one stroke from its many
rAF-coalesced edits. History therefore exposes a small transaction API the UI calls at
those boundaries.

### 4.2 Snapshot model

A snapshot captures **only the canonical (last-edited) buffer**, deep-copied:

```ts
type Snapshot =
  | { domain: "spatial"; buffer: Float32Array }            // ~1 MB
  | { domain: "kspace";  buffer: { re: Float32Array; im: Float32Array } } // ~2 MB
  | { domain: null;      buffer: null };                    // pristine initial state
```

Deep copies are required because the store mutates buffers in place. Restoring a snapshot
calls `setSpatial` / `setSpectrum` (or `setSpatial(zeros)` for the pristine state), which
recomputes the derived side with one FFT (~tens of ms at N=512).

### 4.3 Transaction API and action boundaries

```ts
interface History {
  begin(): void;   // capture current state as the pre-action baseline (idempotent per action)
  commit(): void;  // an edit occurred: push baseline to undo stack, clear redo stack
  cancel(): void;  // no edit occurred: discard the baseline
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(fn: () => void): () => void; // notify for button enable/disable
}
```

Interaction-layer wiring (one step per action — the approved granularity):

- **Brush/eraser drag:** `begin()` on `pointerdown`; on stroke end, `commit()` if any edit
  was applied during the gesture, else `cancel()`.
- **Shape (line/rect/circle):** `begin()` on `pointerdown`; `commit()` on the
  pointer-up that applies the shape (or `cancel()` if none applied).
- **Import (spatial or k-space) and Clear:** `begin()` then the mutation then `commit()` —
  each is one discrete step.

`begin()` is idempotent within an action so a stray second call is harmless. Because
history calls live at the gesture boundary, the per-frame edits inside a drag collapse into
a single undo step.

### 4.4 Stacks and depth

Standard two-stack model:

- `commit()`: `undoStack.push(baseline)`, `redoStack = []`.
- `undo()`: if `undoStack` non-empty → `redoStack.push(snapshot(current))`, then restore
  `undoStack.pop()`.
- `redo()`: if `redoStack` non-empty → `undoStack.push(snapshot(current))`, then restore
  `redoStack.pop()`.

`undoStack` is capped at **maxDepth = 30** steps; the oldest entry is dropped (FIFO) when
exceeded. Worst case memory ≈ 30 × 2 MB = 60 MB. `redoStack` is naturally bounded by undo
history.

### 4.5 Controls

- Toolbar **Undo** and **Redo** buttons, `disabled` driven by `canUndo()` / `canRedo()`
  via `subscribe`.
- Keyboard: **⌘/Ctrl+Z** = undo; **⌘/Ctrl+Shift+Z** and **Ctrl+Y** = redo. Shortcuts are
  ignored while focus is in a text/file input.

### 4.6 Edge cases

- **Pristine state:** the `{ domain: null }` snapshot restores via `setSpatial(zeros)`.
  Undoing back to it is allowed; undo past it is a no-op.
- **No-op gestures** (e.g. a shape tool clicked without a drag) call `cancel()` and add no
  step.
- **Colormap switching** is display-only and is **not** an undoable action (it never
  mutates buffers).

### 4.7 Testing

`history.ts` is unit-tested against a store wired with synchronous transforms
(`fft2dForward` / `fft2dInverse`):

- edit → `undo()` restores the prior buffers; `redo()` re-applies.
- a new `commit()` after `undo()` clears the redo stack.
- depth cap drops the oldest step beyond `maxDepth`.
- spatial-domain and k-space-domain snapshots each restore correctly (including the derived
  side via recompute).
- undo back to the pristine state yields all-zero buffers; undo past it is a no-op.

Interaction-layer wiring (begin/commit/cancel placement) is verified by manual smoke test.

## 5. Out of scope

- Per-panel clear, clear confirmation dialog.
- Undo of colormap or tool/parameter changes (display/tool state, not buffer edits).
- Persisting history across reloads.
- Command-replay history (snapshot model chosen for simplicity/robustness).
