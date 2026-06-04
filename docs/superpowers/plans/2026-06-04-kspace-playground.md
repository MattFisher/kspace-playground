# k-space Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully client-side web app with two side-by-side canvases — a spatial grayscale image and its 2D Fourier transform (brightness = log-magnitude, hue = phase) — each editable with brush/eraser/shape tools and importable from file, with the other side updating live.

**Architecture:** Two canonical `Float32Array` buffers (real `spatial`, complex `spectrum`) are the source of truth; canvases are 8-bit renderings only. Each edit mutates one buffer, runs a single FFT or IFFT (CPU, in a Web Worker), then re-renders both. Pure engine modules (FFT, mapping, render, stroke, state) are unit-tested; the UI wiring is verified by manual smoke test.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas2D, Web Worker. No UI framework. Self-contained radix-2 FFT (no FFT dependency). Static deploy to GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-06-04-kspace-playground-design.md`

**Conventions used throughout this plan:**
- Buffers are row-major, length `N*N`, indexed `i = y*N + x`.
- Complex spectrum is `{ re: Float32Array, im: Float32Array }`.
- `N` is the working resolution (power of two), default **512**, alternative **256**.
- FFT note: the spec listed `ndarray-fft`/`fft.js` as candidates. This plan instead uses a small self-contained radix-2 FFT (Task 2) to avoid external-API guesswork. Same behavior, fewer dependencies.

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules
dist
*.log
.DS_Store
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "kspace-playground",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable", "WebWorker"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>k-space Playground</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/main.ts` (placeholder so dev server runs)**

```ts
const app = document.querySelector<HTMLDivElement>("#app")!;
app.textContent = "k-space Playground — scaffolding OK";
```

- [ ] **Step 7: Install and verify**

Run: `npm install && npm run test`
Expected: install succeeds; vitest reports "No test files found" (exit 0 is fine) — confirms the toolchain runs.

Run: `npm run dev` then open the printed URL.
Expected: page shows "k-space Playground — scaffolding OK". Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Vitest project"
```

---

### Task 2: 1D FFT (radix-2, in-place)

**Files:**
- Create: `src/engine/fft1d.ts`
- Test: `src/engine/fft1d.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/fft1d.test.ts
import { describe, it, expect } from "vitest";
import { fft1d } from "./fft1d";

function close(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

describe("fft1d", () => {
  it("transforms an impulse to a flat spectrum", () => {
    const re = new Float64Array([1, 0, 0, 0]);
    const im = new Float64Array([0, 0, 0, 0]);
    fft1d(re, im, false);
    for (let i = 0; i < 4; i++) {
      expect(close(re[i], 1)).toBe(true);
      expect(close(im[i], 0)).toBe(true);
    }
  });

  it("round-trips forward then inverse", () => {
    const orig = [3, -1, 7, 2, 0, 5, -4, 1];
    const re = Float64Array.from(orig);
    const im = new Float64Array(8);
    fft1d(re, im, false);
    fft1d(re, im, true);
    for (let i = 0; i < 8; i++) {
      expect(close(re[i], orig[i], 1e-9)).toBe(true);
      expect(close(im[i], 0, 1e-9)).toBe(true);
    }
  });

  it("puts a DC value equal to the sum at index 0", () => {
    const re = new Float64Array([2, 2, 2, 2]);
    const im = new Float64Array(4);
    fft1d(re, im, false);
    expect(close(re[0], 8)).toBe(true);
    expect(close(im[0], 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fft1d`
Expected: FAIL — cannot find module `./fft1d`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/fft1d.ts

/**
 * In-place radix-2 Cooley–Tukey FFT. Length must be a power of two.
 * `invert = false` is the forward transform (no normalization).
 * `invert = true` is the inverse transform (divides by n).
 */
export function fft1d(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`fft1d length must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const idx = i + k + half;
        const bRe = re[idx] * curRe - im[idx] * curIm;
        const bIm = re[idx] * curIm + im[idx] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[idx] = aRe - bRe;
        im[idx] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fft1d`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/fft1d.ts src/engine/fft1d.test.ts
git commit -m "feat(engine): add radix-2 1D FFT"
```

---

### Task 3: 2D FFT forward/inverse

**Files:**
- Create: `src/engine/fft2d.ts`
- Test: `src/engine/fft2d.test.ts`

Defines the `Spectrum` type used everywhere downstream.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/fft2d.test.ts
import { describe, it, expect } from "vitest";
import { fft2dForward, fft2dInverse } from "./fft2d";

function close(a: number, b: number, eps = 1e-4) {
  return Math.abs(a - b) < eps;
}

describe("fft2d", () => {
  it("transforms a constant image to a single DC peak", () => {
    const N = 4;
    const img = new Float32Array(N * N).fill(2);
    const spec = fft2dForward(img, N);
    // DC term = sum of all pixels = 2 * 16 = 32.
    expect(close(spec.re[0], 32)).toBe(true);
    expect(close(spec.im[0], 0)).toBe(true);
    // All other terms ~ 0.
    for (let i = 1; i < N * N; i++) {
      expect(close(spec.re[i], 0)).toBe(true);
      expect(close(spec.im[i], 0)).toBe(true);
    }
  });

  it("round-trips forward then inverse", () => {
    const N = 4;
    const img = new Float32Array(N * N);
    for (let i = 0; i < img.length; i++) img[i] = Math.sin(i) * 10;
    const spec = fft2dForward(img, N);
    const back = fft2dInverse(spec, N);
    for (let i = 0; i < img.length; i++) {
      expect(close(back[i], img[i], 1e-3)).toBe(true);
    }
  });

  it("transforms a delta at origin to a flat (all-ones) magnitude", () => {
    const N = 4;
    const img = new Float32Array(N * N);
    img[0] = 1;
    const spec = fft2dForward(img, N);
    for (let i = 0; i < N * N; i++) {
      expect(close(spec.re[i], 1)).toBe(true);
      expect(close(spec.im[i], 0)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fft2d`
Expected: FAIL — cannot find module `./fft2d`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/fft2d.ts
import { fft1d } from "./fft1d";

export interface Spectrum {
  re: Float32Array;
  im: Float32Array;
}

/** Run an in-place 2D FFT on Float64 buffers (rows then columns). */
function fft2dInPlace(re: Float64Array, im: Float64Array, N: number, invert: boolean): void {
  const rowRe = new Float64Array(N);
  const rowIm = new Float64Array(N);

  // Rows.
  for (let y = 0; y < N; y++) {
    const off = y * N;
    for (let x = 0; x < N; x++) {
      rowRe[x] = re[off + x];
      rowIm[x] = im[off + x];
    }
    fft1d(rowRe, rowIm, invert);
    for (let x = 0; x < N; x++) {
      re[off + x] = rowRe[x];
      im[off + x] = rowIm[x];
    }
  }

  // Columns.
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      rowRe[y] = re[y * N + x];
      rowIm[y] = im[y * N + x];
    }
    fft1d(rowRe, rowIm, invert);
    for (let y = 0; y < N; y++) {
      re[y * N + x] = rowRe[y];
      im[y * N + x] = rowIm[y];
    }
  }
}

/** Forward 2D FFT of a real image. Returns a complex spectrum. */
export function fft2dForward(spatial: Float32Array, N: number): Spectrum {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) re[i] = spatial[i];
  fft2dInPlace(re, im, N, false);
  return { re: Float32Array.from(re), im: Float32Array.from(im) };
}

/** Inverse 2D FFT. Returns the REAL part of the result (documented choice). */
export function fft2dInverse(spec: Spectrum, N: number): Float32Array {
  const re = Float64Array.from(spec.re);
  const im = Float64Array.from(spec.im);
  fft2dInPlace(re, im, N, true);
  return Float32Array.from(re);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fft2d`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/fft2d.ts src/engine/fft2d.test.ts
git commit -m "feat(engine): add 2D FFT forward/inverse"
```

---

### Task 4: Complex ⟷ magnitude/phase and phase colormaps

**Files:**
- Create: `src/engine/mapping.ts`
- Test: `src/engine/mapping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/mapping.test.ts
import { describe, it, expect } from "vitest";
import {
  complexFromMagPhase,
  magnitudeOf,
  phaseOf,
  hueWheelColormap,
  redBlueColormap,
} from "./mapping";

function close(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

describe("mapping", () => {
  it("round-trips magnitude/phase through complex", () => {
    const mag = 5;
    const phase = 1.1;
    const c = complexFromMagPhase(mag, phase);
    expect(close(magnitudeOf(c.re, c.im), mag)).toBe(true);
    expect(close(phaseOf(c.re, c.im), phase)).toBe(true);
  });

  it("hue wheel maps wrapped phases to the same color (cyclic)", () => {
    const a = hueWheelColormap.toRGB(-Math.PI);
    const b = hueWheelColormap.toRGB(Math.PI);
    expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(2);
  });

  it("hue wheel inverse round-trips a phase", () => {
    const phase = 0.7;
    const rgb = hueWheelColormap.toRGB(phase);
    const back = hueWheelColormap.fromRGB(rgb.r, rgb.g, rgb.b);
    expect(close(back, phase, 0.05)).toBe(true);
  });

  it("red/blue diverging shows a seam at the wrap (not cyclic)", () => {
    const a = redBlueColormap.toRGB(-Math.PI + 0.01);
    const b = redBlueColormap.toRGB(Math.PI - 0.01);
    // Opposite ends of the diverging scale => very different colors.
    expect(Math.abs(a.r - b.r) + Math.abs(a.b - b.b)).toBeGreaterThan(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mapping`
Expected: FAIL — cannot find module `./mapping`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/mapping.ts

export interface RGB {
  r: number; // 0..255
  g: number;
  b: number;
}

export function complexFromMagPhase(mag: number, phase: number): { re: number; im: number } {
  return { re: mag * Math.cos(phase), im: mag * Math.sin(phase) };
}

export function magnitudeOf(re: number, im: number): number {
  return Math.hypot(re, im);
}

export function phaseOf(re: number, im: number): number {
  return Math.atan2(im, re);
}

/**
 * A phase colormap maps a phase in [-PI, PI] to an RGB color and back.
 * `fromRGB` is used by the k-space color/phase picker.
 */
export interface PhaseColormap {
  name: string;
  /** true if the map respects phase's -PI/+PI wrap. */
  cyclic: boolean;
  toRGB(phase: number): RGB;
  fromRGB(r: number, g: number, b: number): number;
}

function hsvToRgb(h: number, s: number, v: number): RGB {
  // h in [0,360)
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHue(r: number, g: number, b: number): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/** Cyclic hue wheel: phase -> full-saturation hue. */
export const hueWheelColormap: PhaseColormap = {
  name: "Hue wheel (cyclic)",
  cyclic: true,
  toRGB(phase: number): RGB {
    const hue = ((phase + Math.PI) / (2 * Math.PI)) * 360;
    return hsvToRgb(hue, 1, 1);
  },
  fromRGB(r: number, g: number, b: number): number {
    const hue = rgbToHue(r, g, b);
    return (hue / 360) * 2 * Math.PI - Math.PI;
  },
};

/** Red/blue diverging: not cyclic, has a documented seam at +/-PI. */
export const redBlueColormap: PhaseColormap = {
  name: "Red/blue (diverging)",
  cyclic: false,
  toRGB(phase: number): RGB {
    const t = (phase + Math.PI) / (2 * Math.PI); // 0..1
    return {
      r: Math.round(255 * (1 - t)),
      g: 0,
      b: Math.round(255 * t),
    };
  },
  fromRGB(r: number, _g: number, b: number): number {
    const t = b / (r + b || 1);
    return t * 2 * Math.PI - Math.PI;
  },
};

export const phaseColormaps: PhaseColormap[] = [hueWheelColormap, redBlueColormap];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mapping`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/mapping.ts src/engine/mapping.test.ts
git commit -m "feat(engine): add complex<->mag/phase and phase colormaps"
```

---

### Task 5: fftshift and rendering buffers to ImageData

**Files:**
- Create: `src/engine/render.ts`
- Test: `src/engine/render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/render.test.ts
import { describe, it, expect } from "vitest";
import { fftshift, renderSpatial, renderKspace } from "./render";
import { fft2dForward } from "./fft2d";
import { hueWheelColormap } from "./mapping";

describe("render", () => {
  it("fftshift moves index 0 to the center for N=4", () => {
    const N = 4;
    const src = new Float32Array(N * N);
    src[0] = 9; // DC at top-left
    const out = fftshift(src, N);
    // Center for N=4 is (x=2, y=2) => index 2*4 + 2 = 10.
    expect(out[10]).toBe(9);
  });

  it("renderSpatial normalizes to 0..255 and writes opaque RGBA", () => {
    const N = 2;
    const buf = new Float32Array([0, 0.5, 0.5, 1]);
    const img = renderSpatial(buf, N);
    expect(img.data.length).toBe(N * N * 4);
    expect(img.data[0]).toBe(0); // min -> 0
    expect(img.data[12]).toBe(255); // max -> 255
    expect(img.data[3]).toBe(255); // alpha opaque
  });

  it("renderKspace puts the brightest pixel at the DC center", () => {
    const N = 4;
    const constImg = new Float32Array(N * N).fill(1);
    const spec = fft2dForward(constImg, N); // energy only at DC
    const img = renderKspace(spec, N, hueWheelColormap);
    // DC shifts to center (x=2,y=2) => pixel index 10, byte offset 40.
    const centerV = img.data[40] + img.data[41] + img.data[42];
    // A corner (index 0) should be dark.
    const cornerV = img.data[0] + img.data[1] + img.data[2];
    expect(centerV).toBeGreaterThan(cornerV);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- render`
Expected: FAIL — cannot find module `./render`. (Note: `ImageData` is available because vitest runs with `DOM` lib types; if the node env lacks the `ImageData` constructor at runtime, Step 3 includes a tiny shim-free pure object — see implementation.)

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/render.ts
import type { Spectrum } from "./fft2d";
import { magnitudeOf, phaseOf, type PhaseColormap } from "./mapping";

/**
 * A minimal ImageData-shaped result. We avoid the DOM ImageData constructor so
 * the functions are testable in a plain Node environment; the shape is
 * compatible with CanvasRenderingContext2D.putImageData via new ImageData(...)
 * at the call site if needed.
 */
export interface RenderedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Center the DC component (swap quadrants). Works for even N. */
export function fftshift(src: Float32Array, N: number): Float32Array {
  const out = new Float32Array(N * N);
  const half = N >> 1;
  for (let y = 0; y < N; y++) {
    const sy = (y + half) % N;
    for (let x = 0; x < N; x++) {
      const sx = (x + half) % N;
      out[sy * N + sx] = src[y * N + x];
    }
  }
  return out;
}

/** Normalize a real buffer to 0..255 grayscale RGBA. */
export function renderSpatial(spatial: Float32Array, N: number): RenderedImage {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < spatial.length; i++) {
    if (spatial[i] < min) min = spatial[i];
    if (spatial[i] > max) max = spatial[i];
  }
  const range = max - min || 1;
  const data = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < spatial.length; i++) {
    const v = Math.round(((spatial[i] - min) / range) * 255);
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  return { data, width: N, height: N };
}

/**
 * Render a spectrum: brightness = normalized log-magnitude (V), hue from the
 * colormap (phase), saturation 1. DC centered via fftshift.
 */
export function renderKspace(spec: Spectrum, N: number, cmap: PhaseColormap): RenderedImage {
  const logMag = new Float32Array(N * N);
  let maxLog = 0;
  for (let i = 0; i < N * N; i++) {
    const l = Math.log(1 + magnitudeOf(spec.re[i], spec.im[i]));
    logMag[i] = l;
    if (l > maxLog) maxLog = l;
  }
  const scale = maxLog || 1;

  const shiftedLog = fftshift(logMag, N);
  // Shift phase by shifting re/im consistently.
  const shiftedRe = fftshift(spec.re, N);
  const shiftedIm = fftshift(spec.im, N);

  const data = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const v = shiftedLog[i] / scale; // 0..1 brightness
    const phase = phaseOf(shiftedRe[i], shiftedIm[i]);
    const rgb = cmap.toRGB(phase);
    const o = i * 4;
    data[o] = Math.round(rgb.r * v);
    data[o + 1] = Math.round(rgb.g * v);
    data[o + 2] = Math.round(rgb.b * v);
    data[o + 3] = 255;
  }
  return { data, width: N, height: N };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- render`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/render.ts src/engine/render.test.ts
git commit -m "feat(engine): add fftshift and buffer rendering"
```

---

### Task 6: Stroke rasterization (brush, eraser, shapes)

**Files:**
- Create: `src/engine/stroke.ts`
- Test: `src/engine/stroke.test.ts`

Strokes produce a **coverage map** (alpha 0..1 per pixel). The caller decides what to write through that coverage (gray value in spatial; magnitude+phase in k-space), so this module knows nothing about domains.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/stroke.test.ts
import { describe, it, expect } from "vitest";
import { brushCoverage, lineCoverage, rectCoverage, circleCoverage } from "./stroke";

describe("stroke", () => {
  it("brush covers the center fully and falls off to zero outside radius", () => {
    const N = 16;
    const cov = brushCoverage(N, 8, 8, 3, 0); // hardness softness=0
    expect(cov[8 * N + 8]).toBeCloseTo(1, 5);
    // A pixel well outside the radius is untouched.
    expect(cov[0]).toBe(0);
  });

  it("soft brush has partial alpha at the edge", () => {
    const N = 16;
    const cov = brushCoverage(N, 8, 8, 4, 1); // softness=1
    const edge = cov[8 * N + 12]; // ~radius away
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });

  it("line sets coverage along its endpoints", () => {
    const N = 16;
    const cov = lineCoverage(N, 2, 2, 13, 2, 1);
    expect(cov[2 * N + 2]).toBeGreaterThan(0);
    expect(cov[2 * N + 13]).toBeGreaterThan(0);
    expect(cov[8 * N + 8]).toBe(0); // off the line
  });

  it("rect fills its interior", () => {
    const N = 16;
    const cov = rectCoverage(N, 4, 4, 10, 10);
    expect(cov[5 * N + 5]).toBe(1);
    expect(cov[0]).toBe(0);
  });

  it("circle ring covers its radius band only", () => {
    const N = 32;
    const cov = circleCoverage(N, 16, 16, 8, 2); // ring thickness 2
    expect(cov[16 * N + 24]).toBeGreaterThan(0); // on the ring (r=8)
    expect(cov[16 * N + 16]).toBe(0); // center, inside ring
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- stroke`
Expected: FAIL — cannot find module `./stroke`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/stroke.ts

/** All functions return a Float32Array(N*N) coverage map in [0,1]. */

export function brushCoverage(
  N: number,
  cx: number,
  cy: number,
  radius: number,
  softness: number, // 0 = hard, 1 = fully soft
): Float32Array {
  const cov = new Float32Array(N * N);
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(N - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(N - 1, Math.ceil(cy + radius));
  const inner = radius * (1 - softness);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      let a = 0;
      if (d <= inner) a = 1;
      else if (d < radius) a = 1 - (d - inner) / (radius - inner);
      if (a > 0) cov[y * N + x] = a;
    }
  }
  return cov;
}

export function lineCoverage(
  N: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): Float32Array {
  // Stamp a small brush along the segment.
  const cov = new Float32Array(N * N);
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const r = Math.max(0.5, thickness / 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    const stamp = brushCoverage(N, px, py, r, 0);
    for (let i = 0; i < cov.length; i++) {
      if (stamp[i] > cov[i]) cov[i] = stamp[i];
    }
  }
  return cov;
}

export function rectCoverage(
  N: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Float32Array {
  const cov = new Float32Array(N * N);
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(N - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(N - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      cov[y * N + x] = 1;
    }
  }
  return cov;
}

/** Ring of the given radius and thickness. thickness <= 0 fills the disk. */
export function circleCoverage(
  N: number,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
): Float32Array {
  const cov = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (thickness <= 0) {
        if (d <= radius) cov[y * N + x] = 1;
      } else if (Math.abs(d - radius) <= thickness / 2) {
        cov[y * N + x] = 1;
      }
    }
  }
  return cov;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- stroke`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/stroke.ts src/engine/stroke.test.ts
git commit -m "feat(engine): add stroke coverage rasterization"
```

---

### Task 7: State store (canonical buffers + edit operations)

**Files:**
- Create: `src/engine/state.ts`
- Test: `src/engine/state.test.ts`

The store owns both buffers and applies coverage-based edits. It takes the
forward/inverse transforms as **injected functions** so tests run synchronously
and the app can swap in the worker-backed versions.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/state.test.ts
import { describe, it, expect } from "vitest";
import { createStore } from "./state";
import { fft2dForward, fft2dInverse } from "./fft2d";
import { brushCoverage } from "./stroke";

const transforms = { forward: fft2dForward, inverse: fft2dInverse };

describe("state store", () => {
  it("editing spatial updates the spectrum via forward FFT", () => {
    const N = 4;
    const store = createStore(N, transforms);
    const cov = brushCoverage(N, 1, 1, 1, 0);
    store.editSpatial(cov, 1); // paint value 1
    // Spectrum DC should now equal the sum of painted pixels.
    let sum = 0;
    const sp = store.getSpatial();
    for (let i = 0; i < sp.length; i++) sum += sp[i];
    expect(Math.abs(store.getSpectrum().re[0] - sum)).toBeLessThan(1e-3);
    expect(store.lastEdited()).toBe("spatial");
  });

  it("editing k-space updates the spatial image via inverse FFT", () => {
    const N = 4;
    const store = createStore(N, transforms);
    // Paint the DC term (index 0 in unshifted spectrum) to a constant.
    const cov = new Float32Array(N * N);
    cov[0] = 1;
    store.editKspace(cov, 16, 0); // magnitude 16, phase 0 at DC
    const sp = store.getSpatial();
    // Inverse of a DC-only spectrum is a constant = mag / (N*N) = 16/16 = 1.
    for (let i = 0; i < sp.length; i++) {
      expect(Math.abs(sp[i] - 1)).toBeLessThan(1e-3);
    }
    expect(store.lastEdited()).toBe("kspace");
  });

  it("setSpatial replaces the image and recomputes the spectrum", () => {
    const N = 4;
    const store = createStore(N, transforms);
    const img = new Float32Array(N * N).fill(2);
    store.setSpatial(img);
    expect(Math.abs(store.getSpectrum().re[0] - 32)).toBeLessThan(1e-3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- state`
Expected: FAIL — cannot find module `./state`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/state.ts
import type { Spectrum } from "./fft2d";
import { complexFromMagPhase } from "./mapping";

export type Domain = "spatial" | "kspace";

export interface Transforms {
  forward(spatial: Float32Array, N: number): Spectrum;
  inverse(spec: Spectrum, N: number): Float32Array;
}

export interface Store {
  readonly N: number;
  getSpatial(): Float32Array;
  getSpectrum(): Spectrum;
  lastEdited(): Domain | null;
  /** Blend `value` into the spatial buffer through coverage, then forward FFT. */
  editSpatial(coverage: Float32Array, value: number): void;
  /** Write magnitude/phase into the spectrum through coverage, then inverse FFT. */
  editKspace(coverage: Float32Array, magnitude: number, phase: number): void;
  /** Replace the spatial buffer wholesale (e.g. on import) and recompute. */
  setSpatial(spatial: Float32Array): void;
  /** Replace the spectrum wholesale (e.g. on import) and recompute. */
  setSpectrum(spec: Spectrum): void;
  /** Subscribe to "buffers changed"; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

export function createStore(N: number, t: Transforms): Store {
  let spatial = new Float32Array(N * N);
  let spectrum: Spectrum = t.forward(spatial, N);
  let last: Domain | null = null;
  const listeners = new Set<() => void>();

  function emit() {
    for (const fn of listeners) fn();
  }

  return {
    N,
    getSpatial: () => spatial,
    getSpectrum: () => spectrum,
    lastEdited: () => last,

    editSpatial(coverage, value) {
      for (let i = 0; i < spatial.length; i++) {
        const a = coverage[i];
        if (a > 0) spatial[i] = spatial[i] * (1 - a) + value * a;
      }
      spectrum = t.forward(spatial, N);
      last = "spatial";
      emit();
    },

    editKspace(coverage, magnitude, phase) {
      const c = complexFromMagPhase(magnitude, phase);
      const re = spectrum.re;
      const im = spectrum.im;
      for (let i = 0; i < re.length; i++) {
        const a = coverage[i];
        if (a > 0) {
          re[i] = re[i] * (1 - a) + c.re * a;
          im[i] = im[i] * (1 - a) + c.im * a;
        }
      }
      spatial = t.inverse(spectrum, N);
      last = "kspace";
      emit();
    },

    setSpatial(next) {
      spatial = next;
      spectrum = t.forward(spatial, N);
      last = "spatial";
      emit();
    },

    setSpectrum(next) {
      spectrum = next;
      spatial = t.inverse(spectrum, N);
      last = "kspace";
      emit();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- state`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/state.ts src/engine/state.test.ts
git commit -m "feat(engine): add state store with edit operations"
```

---

### Task 8: FFT Web Worker + transport adapter

**Files:**
- Create: `src/worker/fft.worker.ts`
- Create: `src/worker/transport.ts`
- Test: `src/worker/transport.test.ts`

The store in Task 7 is synchronous, but `fft2d` runs fast enough that for v1 we keep the store synchronous and run it **on the main thread inside a requestAnimationFrame throttle** (Task 10). The worker is used for the **initial import transform of large images** and is structured so it can later replace the synchronous transforms. This task builds the worker and a promise-based adapter, and unit-tests the message protocol with a fake worker.

- [ ] **Step 1: Write the failing test**

```ts
// src/worker/transport.test.ts
import { describe, it, expect } from "vitest";
import { createTransport } from "./transport";
import { fft2dForward, fft2dInverse } from "../engine/fft2d";

/** A fake worker that runs the real transforms synchronously. */
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(msg: any) {
    let result: any;
    if (msg.op === "forward") {
      result = fft2dForward(msg.spatial, msg.N);
    } else {
      result = fft2dInverse({ re: msg.re, im: msg.im }, msg.N);
    }
    queueMicrotask(() =>
      this.onmessage?.({ data: { id: msg.id, result } }),
    );
  }
  terminate() {}
}

describe("transport", () => {
  it("resolves forward transforms by id", async () => {
    const transport = createTransport(new FakeWorker() as any);
    const N = 4;
    const img = new Float32Array(N * N).fill(1);
    const spec = await transport.forward(img, N);
    expect(Math.abs(spec.re[0] - 16)).toBeLessThan(1e-3);
  });

  it("resolves inverse transforms by id", async () => {
    const transport = createTransport(new FakeWorker() as any);
    const N = 4;
    const img = new Float32Array(N * N).fill(3);
    const spec = await transport.forward(img, N);
    const back = await transport.inverse(spec, N);
    for (let i = 0; i < back.length; i++) {
      expect(Math.abs(back[i] - 3)).toBeLessThan(1e-3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transport`
Expected: FAIL — cannot find module `./transport`.

- [ ] **Step 3: Write the transport adapter**

```ts
// src/worker/transport.ts
import type { Spectrum } from "../engine/fft2d";

interface PendingResolver {
  (result: any): void;
}

export interface Transport {
  forward(spatial: Float32Array, N: number): Promise<Spectrum>;
  inverse(spec: Spectrum, N: number): Promise<Float32Array>;
}

export function createTransport(worker: Worker): Transport {
  let nextId = 0;
  const pending = new Map<number, PendingResolver>();

  worker.onmessage = (e: MessageEvent) => {
    const { id, result } = e.data as { id: number; result: unknown };
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(result);
    }
  };

  function call<T>(msg: Record<string, unknown>): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve) => {
      pending.set(id, resolve as PendingResolver);
      worker.postMessage({ ...msg, id });
    });
  }

  return {
    forward(spatial, N) {
      return call<Spectrum>({ op: "forward", spatial, N });
    },
    inverse(spec, N) {
      return call<Float32Array>({ op: "inverse", re: spec.re, im: spec.im, N });
    },
  };
}
```

- [ ] **Step 4: Write the worker**

```ts
// src/worker/fft.worker.ts
import { fft2dForward, fft2dInverse } from "../engine/fft2d";

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as any;
  if (msg.op === "forward") {
    const result = fft2dForward(msg.spatial as Float32Array, msg.N as number);
    (self as unknown as Worker).postMessage({ id: msg.id, result });
  } else if (msg.op === "inverse") {
    const result = fft2dInverse({ re: msg.re, im: msg.im }, msg.N as number);
    (self as unknown as Worker).postMessage({ id: msg.id, result });
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- transport`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/worker/
git commit -m "feat(worker): add FFT worker and promise transport"
```

---

### Task 9: UI shell — canvases, palette, picker, render loop

**Files:**
- Create: `src/ui/dom.ts`
- Create: `src/ui/styles.css`
- Modify: `src/main.ts`
- Modify: `index.html`

This task builds the visible layout and wires the store's `subscribe` to repaint both canvases. No drawing interaction yet (Task 10). Verified by manual smoke test.

- [ ] **Step 1: Create `src/ui/styles.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #1e1e1e; color: #eee; }
#app { display: flex; flex-direction: column; height: 100vh; }
.toolbar { display: flex; gap: 12px; align-items: center; padding: 8px 12px; background: #2a2a2a; flex-wrap: wrap; }
.toolbar label { display: flex; gap: 4px; align-items: center; font-size: 13px; }
.panels { display: flex; flex: 1; gap: 12px; padding: 12px; min-height: 0; }
.panel { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.panel h2 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
.panel canvas { width: 100%; height: auto; image-rendering: pixelated; background: #000; border: 1px solid #444; touch-action: none; }
```

- [ ] **Step 2: Create `src/ui/dom.ts`**

```ts
// src/ui/dom.ts
import { phaseColormaps } from "../engine/mapping";

export interface ToolControls {
  tool: "brush" | "eraser" | "line" | "rect" | "circle";
  size: number;
  softness: number;
  grayValue: number;   // spatial paint value 0..1
  magnitude: number;   // k-space paint magnitude
  phase: number;       // k-space paint phase (radians)
  colormapIndex: number;
}

export interface UI {
  spatialCanvas: HTMLCanvasElement;
  kspaceCanvas: HTMLCanvasElement;
  controls: ToolControls;
  onColormapChange: (cb: () => void) => void;
}

export function buildUI(root: HTMLElement, N: number): UI {
  const controls: ToolControls = {
    tool: "brush",
    size: 12,
    softness: 0.3,
    grayValue: 1,
    magnitude: 50,
    phase: 0,
    colormapIndex: 0,
  };

  root.innerHTML = `
    <div class="toolbar">
      <label>Tool
        <select id="tool">
          <option value="brush">Brush</option>
          <option value="eraser">Eraser</option>
          <option value="line">Line</option>
          <option value="rect">Rectangle</option>
          <option value="circle">Circle/Ring</option>
        </select>
      </label>
      <label>Size <input id="size" type="range" min="1" max="60" value="12"></label>
      <label>Softness <input id="softness" type="range" min="0" max="100" value="30"></label>
      <label>Gray <input id="gray" type="range" min="0" max="100" value="100"></label>
      <label>Magnitude <input id="mag" type="range" min="0" max="200" value="50"></label>
      <label>Phase <input id="phase" type="range" min="-314" max="314" value="0"></label>
      <label>Phase colors
        <select id="colormap">
          ${phaseColormaps.map((c, i) => `<option value="${i}">${c.name}</option>`).join("")}
        </select>
      </label>
      <label>Import spatial <input id="import-spatial" type="file" accept="image/*"></label>
      <label>Import k-space <input id="import-kspace" type="file" accept="image/*"></label>
      <button id="export-spatial">Export image</button>
      <button id="export-kspace">Export k-space</button>
    </div>
    <div class="panels">
      <div class="panel"><h2>Spatial (image)</h2><canvas id="spatial" width="${N}" height="${N}"></canvas></div>
      <div class="panel"><h2>k-space (FFT)</h2><canvas id="kspace" width="${N}" height="${N}"></canvas></div>
    </div>
  `;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;

  $("tool").addEventListener("change", (e) => {
    controls.tool = (e.target as HTMLSelectElement).value as ToolControls["tool"];
  });
  $("size").addEventListener("input", (e) => {
    controls.size = Number((e.target as HTMLInputElement).value);
  });
  $("softness").addEventListener("input", (e) => {
    controls.softness = Number((e.target as HTMLInputElement).value) / 100;
  });
  $("gray").addEventListener("input", (e) => {
    controls.grayValue = Number((e.target as HTMLInputElement).value) / 100;
  });
  $("mag").addEventListener("input", (e) => {
    controls.magnitude = Number((e.target as HTMLInputElement).value);
  });
  $("phase").addEventListener("input", (e) => {
    controls.phase = Number((e.target as HTMLInputElement).value) / 100;
  });

  const colormapListeners: Array<() => void> = [];
  $("colormap").addEventListener("change", (e) => {
    controls.colormapIndex = Number((e.target as HTMLSelectElement).value);
    colormapListeners.forEach((cb) => cb());
  });

  return {
    spatialCanvas: $("spatial") as HTMLCanvasElement,
    kspaceCanvas: $("kspace") as HTMLCanvasElement,
    controls,
    onColormapChange: (cb) => colormapListeners.push(cb),
  };
}
```

- [ ] **Step 3: Replace `src/main.ts` to wire store → canvases**

```ts
// src/main.ts
import "./ui/styles.css";
import { buildUI } from "./ui/dom";
import { createStore } from "./engine/state";
import { fft2dForward, fft2dInverse } from "./engine/fft2d";
import { renderSpatial, renderKspace } from "./engine/render";
import { phaseColormaps } from "./engine/mapping";

const N = 512;
const root = document.querySelector<HTMLDivElement>("#app")!;
const ui = buildUI(root, N);
const store = createStore(N, { forward: fft2dForward, inverse: fft2dInverse });

const spatialCtx = ui.spatialCanvas.getContext("2d")!;
const kspaceCtx = ui.kspaceCanvas.getContext("2d")!;

function paint() {
  const s = renderSpatial(store.getSpatial(), N);
  spatialCtx.putImageData(new ImageData(s.data, N, N), 0, 0);
  const cmap = phaseColormaps[ui.controls.colormapIndex];
  const k = renderKspace(store.getSpectrum(), N, cmap);
  kspaceCtx.putImageData(new ImageData(k.data, N, N), 0, 0);
}

store.subscribe(paint);
ui.onColormapChange(paint);
paint();

// Expose for Task 10 wiring/manual debugging.
(window as any).__kspace = { store, ui, paint, N };
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev` and open the URL.
Expected:
- Toolbar with all controls renders.
- Two black 512×512 canvases labeled "Spatial" and "k-space".
- No console errors.
- Switching the "Phase colors" dropdown does not error (image still black — nothing drawn yet).
Stop the dev server.

- [ ] **Step 5: Type-check and commit**

Run: `npm run build`
Expected: `tsc --noEmit` passes, Vite build succeeds.

```bash
git add -A
git commit -m "feat(ui): add layout, controls, and render loop"
```

---

### Task 10: Drawing interaction, import, and export

**Files:**
- Create: `src/ui/interaction.ts`
- Modify: `src/main.ts`

Wires pointer events on both canvases to stroke coverage → store edits, throttled
to one transform per animation frame. Adds file import (to either domain) and PNG export.

- [ ] **Step 1: Create `src/ui/interaction.ts`**

```ts
// src/ui/interaction.ts
import type { Store } from "../engine/state";
import type { ToolControls } from "./dom";
import {
  brushCoverage,
  lineCoverage,
  rectCoverage,
  circleCoverage,
} from "../engine/stroke";

type Domain = "spatial" | "kspace";

/** Map a pointer event to integer buffer coordinates for an N×N canvas. */
function toBufferCoords(canvas: HTMLCanvasElement, N: number, e: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * N);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * N);
  return { x: Math.max(0, Math.min(N - 1, x)), y: Math.max(0, Math.min(N - 1, y)) };
}

function applyEdit(store: Store, domain: Domain, c: ToolControls, cov: Float32Array) {
  if (domain === "spatial") {
    const value = c.tool === "eraser" ? 0 : c.grayValue;
    store.editSpatial(cov, value);
  } else {
    const mag = c.tool === "eraser" ? 0 : c.magnitude;
    store.editKspace(cov, mag, c.phase);
  }
}

export function attachInteraction(
  canvas: HTMLCanvasElement,
  domain: Domain,
  store: Store,
  controls: ToolControls,
) {
  const N = store.N;
  let drawing = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let pendingCoverage: Float32Array | null = null;
  let rafQueued = false;

  function queueEdit(cov: Float32Array) {
    // Accumulate coverage (max) until the next animation frame, then one transform.
    if (!pendingCoverage) pendingCoverage = new Float32Array(N * N);
    for (let i = 0; i < cov.length; i++) {
      if (cov[i] > pendingCoverage[i]) pendingCoverage[i] = cov[i];
    }
    if (!rafQueued) {
      rafQueued = true;
      requestAnimationFrame(() => {
        rafQueued = false;
        const cov2 = pendingCoverage!;
        pendingCoverage = null;
        applyEdit(store, domain, controls, cov2);
      });
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const p = toBufferCoords(canvas, N, e);
    startX = lastX = p.x;
    startY = lastY = p.y;
    if (controls.tool === "brush" || controls.tool === "eraser") {
      queueEdit(brushCoverage(N, p.x, p.y, controls.size / 2, controls.softness));
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = toBufferCoords(canvas, N, e);
    if (controls.tool === "brush" || controls.tool === "eraser") {
      // Stamp along the movement for continuous strokes.
      queueEdit(lineCoverage(N, lastX, lastY, p.x, p.y, controls.size));
    }
    lastX = p.x;
    lastY = p.y;
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!drawing) return;
    drawing = false;
    const p = toBufferCoords(canvas, N, e);
    let cov: Float32Array | null = null;
    if (controls.tool === "line") cov = lineCoverage(N, startX, startY, p.x, p.y, controls.size);
    else if (controls.tool === "rect") cov = rectCoverage(N, startX, startY, p.x, p.y);
    else if (controls.tool === "circle") {
      const r = Math.hypot(p.x - startX, p.y - startY);
      cov = circleCoverage(N, startX, startY, r, controls.size);
    }
    if (cov) applyEdit(store, domain, controls, cov);
  });
}

/** Load an image file, resize to N×N luminance, return a Float32Array(0..1). */
export async function fileToLuminance(file: File, N: number): Promise<Float32Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const c = document.createElement("canvas");
    c.width = N;
    c.height = N;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, N, N);
    const data = ctx.getImageData(0, 0, N, N).data;
    const out = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Extend `src/main.ts` to wire interaction, import, export**

Add the import near the top:

```ts
import { attachInteraction, fileToLuminance } from "./ui/interaction";
```

Then append at the end of `src/main.ts` (after the existing `paint()` call):

```ts
attachInteraction(ui.spatialCanvas, "spatial", store, ui.controls);
attachInteraction(ui.kspaceCanvas, "kspace", store, ui.controls);

function $(id: string) {
  return root.querySelector<HTMLElement>(`#${id}`)!;
}

// Import to spatial: load luminance and set it.
$("import-spatial").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  store.setSpatial(await fileToLuminance(file, N));
});

// Import to k-space (v1): treat luminance as log-magnitude, zero phase.
$("import-kspace").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const lum = await fileToLuminance(file, N);
  const re = new Float32Array(N * N);
  const im = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    // Invert the log-magnitude display mapping: magnitude = exp(scaledLum) - 1.
    re[i] = Math.exp(lum[i] * 8) - 1; // phase 0 -> all real
  }
  store.setSpectrum({ re, im });
});

function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = name;
  a.click();
}

$("export-spatial").addEventListener("click", () => downloadCanvas(ui.spatialCanvas, "image.png"));
$("export-kspace").addEventListener("click", () => downloadCanvas(ui.kspaceCanvas, "kspace.png"));
```

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev` and open the URL. Verify each:
- Brush on the spatial canvas paints a gray stroke; the k-space canvas updates within a frame.
- Brush on the k-space canvas paints; the spatial canvas updates.
- Eraser zeroes the spatial stroke / removes k-space energy.
- Line, Rectangle, Circle/Ring commit on pointer-up in both panels.
- "Import spatial" with a photo: spatial shows the image; k-space shows its spectrum (bright center, dimmer outward).
- "Import k-space" with an image: spatial shows a plausible reconstruction.
- "Export image" / "Export k-space" download PNGs.
- Switching "Phase colors" re-tints the k-space view without changing the spatial image.
- No console errors during any of the above.
Stop the dev server.

- [ ] **Step 4: Type-check and commit**

Run: `npm run build`
Expected: passes.

```bash
git add -A
git commit -m "feat(ui): add drawing interaction, import, and export"
```

---

### Task 11: README and GitHub Pages deploy

**Files:**
- Create: `README.md`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `README.md`**

````markdown
# k-space Playground

Draw on an image and its 2D Fourier transform side by side and watch each update
the other. Brightness in the k-space panel is log-magnitude; hue is phase
(colormap switchable). Everything runs in your browser.

## Develop

```bash
npm install
npm run dev
npm test
```

## Design

See `docs/superpowers/specs/2026-06-04-kspace-playground-design.md`.
````

- [ ] **Step 2: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verify the production build locally**

Run: `npm run build && npm run preview`
Expected: preview serves the app; canvases and drawing work as in Task 10. Stop the preview.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README and GitHub Pages deploy workflow"
```

- [ ] **Step 5: (Manual, by repo owner) Enable Pages**

In GitHub repo settings → Pages → Source: "GitHub Actions". Push `main` and confirm the deployed URL loads.

---

## Final verification

- [ ] Run the full suite: `npm test` → all engine/worker tests pass.
- [ ] Run `npm run build` → type-check and production build succeed.
- [ ] Manual smoke test from Task 10, Step 3 passes end to end.

## Notes for the implementer

- Performance: at N=512 each edit runs a full 2D FFT on the main thread inside a
  requestAnimationFrame throttle. If dragging feels sluggish, the first move is
  to route `editSpatial`/`editKspace` transforms through the Task 8 worker
  (make the store async) before reaching for any GPU work.
- The k-space import inverse-mapping constant (`* 8`) in Task 10 is a rough
  inverse of the display's log scaling; it only needs to look plausible (v1
  treats imported k-space as magnitude-only, zero phase — see the spec).
- Do not edit canvas pixels as a data source anywhere; the two Float32 buffers in
  the store are the single source of truth.
```
