# Transform Examples — Design

**Date:** 2026-06-04
**Status:** Approved (pending spec review)
**Builds on:** `docs/superpowers/specs/2026-06-04-kspace-playground-design.md`

## 1. Summary

A curated set of built-in **examples** that demonstrate the spatial ⟷ Fourier
relationship. The user picks one from a toolbar dropdown; it loads into the
workspace and a short caption explains what it shows. Implemented now.

## 2. Context

Examples load through the existing store (`src/engine/state.ts`): a spatial-domain
example calls `store.setSpatial(buffer)`, a k-space-domain example calls
`store.setSpectrum(spec)`. The store runs one transform to regenerate the other
domain and `emit()`s, so both canvases repaint via the existing `subscribe` path.
Loading an example is therefore import-like, and Undo (see the editing-controls
spec) will wrap it automatically once built.

## 3. Example set (curated, 5)

All five are defined in the **image domain** (`domain: "spatial"`). `N` is the
working resolution (power of two, default 512); `cx = cy = N/2`.

| Name | Generator (per pixel `(x, y)`, index `y*N+x`) | Demonstrates |
|---|---|---|
| **Pure sinusoid** | `0.5 + 0.5*cos(2π·16·x/N)` | One symmetric pair of points + DC |
| **Single point** | `1` at `(cx, cy)`, else `0` | Uniformly bright magnitude (all frequencies) |
| **Box** | `1` inside the centered square of side `N/8`, else `0` | 2D sinc (ripples from sharp edges) |
| **Gaussian blob** | `exp(-((x-cx)² + (y-cy)²) / (2σ²))`, `σ = N/16` | A Gaussian (self-similar transform) |
| **Sum of sinusoids** | `0.5 + 0.17*cos(2π·8·x/N) + 0.17*cos(2π·24·y/N) + 0.16*cos(2π·16·(x+y)/N)` | Several symmetric point-pairs |

### Captions

- **Pure sinusoid:** "A single spatial frequency. In k-space it's one symmetric pair
  of points — plus the bright DC center (the average brightness)."
- **Single point:** "A single point contains every frequency equally — its transform
  is uniformly bright."
- **Box:** "A sharp-edged box becomes a sinc pattern: crisp edges need many high
  frequencies."
- **Gaussian blob:** "A Gaussian transforms to a Gaussian — smooth blobs have compact,
  smooth spectra."
- **Sum of sinusoids:** "Adding frequencies adds points: each sinusoid is one
  symmetric pair in k-space."

## 4. Architecture

### Module `src/engine/examples.ts` (pure, no DOM)

```ts
import type { Spectrum } from "./fft2d";

export interface Example {
  name: string;
  caption: string;
  domain: "spatial" | "kspace";
  generate(N: number): Float32Array | Spectrum;
}

export const examples: Example[];
```

The `domain` field and `Spectrum` return type keep the interface open to future
k-space-defined examples, even though all five v1 examples are spatial.

### UI

- **`src/ui/dom.ts`:** add an **Examples** `<select>` to the toolbar, populated from
  `examples`. Its first option is a placeholder ("Examples…", empty value).
- **`src/ui/styles.css` + `dom.ts`:** add a **caption bar** element below `.panels`
  (full width, small muted text).
- **`src/main.ts`:** on `change`, look up the chosen example, load it
  (`setSpatial` / `setSpectrum` by `domain`), set the caption bar text, then reset the
  `<select>` back to the placeholder so the same example can be re-selected and so the
  dropdown never misrepresents state after manual edits. The Clear button (editing-
  controls spec) also clears the caption bar.

## 5. Data flow

```
select example ──▶ examples[i].generate(N)
              ──▶ store.setSpatial(buf)  OR  store.setSpectrum(spec)
              ──▶ store runs one FFT/IFFT, emits
              ──▶ both canvases repaint; caption bar shows examples[i].caption
```

## 6. Testing

`examples.ts` generators are unit-tested with `fft2dForward` (test at N=64 so the
chosen cycle counts stay below Nyquist):

- **buffer shape:** each spatial generator returns `Float32Array(N*N)`.
- **Pure sinusoid:** spectrum magnitude has strong peaks at buffer indices `(16,0)` and
  `(N-16,0)`, large DC, and is otherwise near-zero.
- **Single point:** all magnitudes are ≈ equal (flat) — assert max/min magnitude ratio ≈ 1.
- **Box:** DC magnitude equals the box area (sum of pixels) and is the maximum.
- **Gaussian blob:** DC is the maximum magnitude; spectrum is symmetric.
- **Sum of sinusoids:** peaks appear at each component frequency (x=8, y=24, and the
  diagonal at 16).

UI wiring (dropdown, caption bar, reset-to-placeholder) is verified by manual smoke test.

## 7. Out of scope

- Thumbnail gallery presentation (dropdown chosen).
- k-space-defined examples (interface supports them; none shipped in v1).
- Parameterized/adjustable examples (fixed frequencies and sizes).
- Animation or step-through explanations.
