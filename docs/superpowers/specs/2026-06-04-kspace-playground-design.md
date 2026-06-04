# k-space Playground — Design

**Date:** 2026-06-04
**Status:** Approved (pending implementation plan)

## 1. Summary

A single-page, fully client-side web app for building intuition about the 2D
Fourier transform of images. Two canvases sit side by side:

- **Spatial** — the grayscale image.
- **k-space** — its 2D Fourier transform, rendered as **brightness = log-magnitude,
  hue = phase**.

The user can draw on either canvas with brush / eraser / shape tools, import an
image file into either domain, and the other canvas updates live. All
computation (including the FFT) runs in the browser, so the app deploys as
static files to GitHub Pages (or similar) for free.

### Goals

- Make the spatial ⟷ frequency relationship *felt*, not just described.
- Surface phase explicitly (most tools hide it) so its role is learnable.
- Stay simple enough to ship and deploy as a static site.

### Non-goals (v1)

- Color/RGB images (grayscale only).
- Clinical / scientific fidelity (this is an intuition tool).
- GPU-scale megapixel realtime.

## 2. Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Purpose | Educational / intuition-building | Drives "legible & correct enough" over "clinically faithful". |
| Color | Grayscale only | One FFT, one spectrum, one phase channel. Color images convert to luminance on import. |
| Phase display | One k-space panel: brightness = log-magnitude, hue = phase | Compact, matches MRI k-space convention. |
| Phase colormap | **Configurable** (cyclic hue wheel default; red/blue diverging; extensible) | User-requested; lets the wrap behavior itself be a teaching moment. |
| Performance | Moderate size (256 default, 512 option), **CPU FFT in a Web Worker** | Far simpler than GPU; live enough at these sizes. |
| Stack | Vanilla TypeScript + Canvas2D + Web Worker, built with Vite | No UI framework — drawing is imperative canvas work anyway. Smallest, fastest, static-deployable. |
| Hand-painted k-space → image | **Take the real part of the IFFT** | Simpler than enforcing conjugate symmetry. See §7. |
| State model | Two canonical float buffers; one transform per edit | Avoids continuous round-trip drift. See §3. |

## 3. Architecture

### State model (the core idea)

"Both update each other" must **not** mean continuously round-tripping FFT↔IFFT —
that accumulates floating-point / quantization drift and feels unstable. Instead:

- Two **canonical float buffers** hold the real data:
  - `spatial: Float32Array` (real-valued image, length N×N)
  - `spectrum: { re: Float32Array, im: Float32Array }` (complex, length N×N)
- The on-screen canvases are **renderings** of these buffers (8-bit), never the
  source of truth.
- Each edit modifies **one** domain's float buffer, then we transform **once** to
  regenerate the other, then re-render both. The last-edited domain is the
  source; the other is derived. One transform per edit ⇒ no drift.

Importing a file is the same pattern: load into one buffer, transform once to
fill the other.

### Modules

```
engine/            (pure, no DOM — the testable core)
  fft2d.ts         2D FFT/IFFT via row–column decomposition over a 1D FFT lib
                   (candidate: ndarray-fft, or fft.js with a 2D wrapper).
                   Operates on Float32Array real/complex buffers.
  state.ts         Owns the two canonical buffers + "last edited domain" logic.
                   editSpatial(stroke) / editKspace(stroke) update one buffer,
                   request the transform, emit "buffers changed".
  render.ts        Buffer -> ImageData.
                   Spatial: normalize float -> 8-bit gray.
                   k-space: magnitude -> log(1+m) -> fftshift (DC centered)
                            -> HSV (V = normalized log-magnitude, S = 1,
                               H via the active PhaseColormap).
  mapping.ts       Pure conversions: brush (magnitude, phase) <-> complex.
                   PhaseColormap interface: phase -> RGB and inverse (for picker).

worker.ts          Hosts fft2d; receives a buffer, returns the transform.
                   Keeps the main thread free.

ui/                Two <canvas> elements, shared tool palette (tool/size/softness),
                   and a picker (gray value for spatial; magnitude + phase/hue for
                   k-space). Plain DOM, no framework.
```

**Brushes write directly into the float buffers, not by reading canvas pixels.**
The k-space picker supplies a target magnitude + phase, and we set
`spectrum[i] = mag · (cos φ, sin φ)`. So we never invert the HSV rendering — the
canvas is display-only, and switching colormaps never touches the data.

## 4. Data flow (edit cycle)

```
pointer stroke ──▶ rasterize into ACTIVE float buffer (main thread)
              ──▶ post buffer to Worker ──▶ FFT or IFFT ──▶ post back
              ──▶ if IFFT: take real part (documented choice, §7)
              ──▶ render BOTH buffers to their canvases
```

Throttled to **one transform per animation frame** so dragging stays smooth.
At 256² a CPU FFT is a few ms; at 512² tens of ms — comfortably live with the
worker off the main thread.

## 5. k-space representation details

- Working resolution is a **power of two** (default **256**, switchable to **512**)
  — required by the FFT and keeps behavior predictable.
- **fftshift** places DC at the center.
- **log-magnitude** (`log(1+m)`, normalized to the current max) so the huge DC
  term doesn't blow out everything else.
- **Phase → hue** via the active `PhaseColormap`. Because V encodes magnitude,
  low-power frequencies render dark, so noisy phase there doesn't visually
  mislead.

### Phase colormaps (configurable)

- **Cyclic hue wheel** (default) — faithful to phase's −π/+π wraparound.
- **Red/blue diverging** — more readable for "which way a frequency pushes", but
  has a **documented hard seam** where phase wraps (+π → −π). Switching to it is
  itself instructive.
- Extensible via the `PhaseColormap` interface (future: twilight, etc.).

The colormap affects **display and the picker's appearance only**; the stored
phase value is unchanged by colormap choice.

## 6. Drawing tools (shared by both panels)

- **Brush** — adjustable size + softness.
- **Eraser** — → black in spatial; → zero magnitude in k-space.
- **Shapes** — line, rectangle, circle/ring. The ring is the natural "frequency
  band" selector in k-space.
- **Picker** — sets what the brush lays down: a gray value in spatial; a
  magnitude + phase (hue) in k-space.

## 7. Import / export

- **Import to spatial:** load image → resize to working resolution → luminance →
  fill `spatial` → FFT.
- **Import to k-space (v1):** interpret the loaded grayscale image as
  **log-magnitude with zero phase**, then IFFT. (Richer interpretations noted in
  open questions.)
- **Export:** save either canvas as PNG.

## 8. Decisions & open questions

### Decided

- Hand-painted k-space → **take the real part of the IFFT**. A real image has a
  conjugate-symmetric spectrum; arbitrary hand-painted k-space generally does
  not, so the IFFT carries a leftover imaginary part. Taking the real part is the
  simplest faithful-enough choice. A symmetry-enforcing "stay exactly real" mode
  (mirror each edit to its conjugate twin) is **future work** and would itself
  teach why spectra are symmetric.
- HSV magnitude/phase encoding (not HSL — keeps strong frequencies vividly
  colored instead of washing to white).
- Fixed power-of-two working resolution.
- CPU FFT in a Web Worker.
- Configurable phase colormap.

### Open

- Richer k-space import (e.g. read hue as phase).
- Undo/redo.
- GPU (glsl-fft) v2 for megapixel realtime.
- Filter presets & region keep/remove in k-space.
- Color / RGB images (per-channel FFT).
- Additional cyclic phase colormaps.
- Conjugate-symmetry-enforcing edit mode.

## 9. Testing

Vitest against the pure `engine/`:

- FFT round-trip identity: `IFFT(FFT(x)) ≈ x` within tolerance.
- Known transforms: single sinusoid → single bright peak at the right frequency;
  impulse → flat magnitude.
- `mapping.ts`: (magnitude, phase) ⟷ complex round-trips; PhaseColormap inverse
  round-trips.

UI / canvas interaction is left to manual smoke testing.

## 10. Deployment

Static build (Vite) → GitHub Pages (or Netlify). No backend, no server-side
compute; everything runs in the browser.

## 11. Prior art (reference)

- Fourifier — closest existing: draw on real space and edit frequency, but manual
  round-trips and magnitude-only.
- 2dfft (Vue + WebGL2) — real-time inverse FFT while brushing a *mask* on the
  spectrum; frequency-only, mask-only. Good GPU reference for a future v2.
- djmannion / EPFL / Edinburgh demos — filter-only (low/high/band-pass).
- GIMP FFT plugin (fftw3) — forward/inverse FFT as menu items, **amplitude only**.

None do both domains freehand-editable with live bidirectional sync and explicit
phase — the gap this project fills.
