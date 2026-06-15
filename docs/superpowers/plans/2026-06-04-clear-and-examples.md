# Clear Button + Transform Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar **Clear** button that blanks the workspace, and a curated set of **transform examples** (pure sinusoid, single point, box, Gaussian, sum-of-sinusoids) selectable from a toolbar dropdown with an explanatory caption.

**Architecture:** A new pure `src/engine/examples.ts` module generates example spatial buffers (unit-tested). Both features load through the existing store (`setSpatial`), which runs one transform and repaints both canvases. The UI gains an Examples `<select>`, a caption bar below the canvases, and a Clear button — all plain DOM wired in `src/main.ts`.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas2D. No new dependencies.

**Specs:**
- `docs/superpowers/specs/2026-06-04-examples-design.md`
- `docs/superpowers/specs/2026-06-04-editing-controls-design.md` (Clear section)

**Conventions:** Buffers are row-major `Float32Array` length `N*N`, indexed `i = y*N + x`. `N` is the working resolution (power of two, default 512). Examples are sequenced before Clear because the Clear handler clears the caption bar that the Examples task introduces.

---

### Task 1: Examples engine module

**Files:**
- Create: `src/engine/examples.ts`
- Test: `src/engine/examples.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/examples.test.ts
import { describe, it, expect } from "vitest";
import { examples } from "./examples";
import { fft2dForward, type Spectrum } from "./fft2d";

const N = 64;

function byName(name: string) {
  const ex = examples.find((e) => e.name === name);
  if (!ex) throw new Error(`no example named ${name}`);
  return ex;
}

function mag(spec: Spectrum, x: number, y: number) {
  const i = y * N + x;
  return Math.hypot(spec.re[i], spec.im[i]);
}

function maxMag(spec: Spectrum) {
  let m = 0;
  for (let i = 0; i < N * N; i++) m = Math.max(m, Math.hypot(spec.re[i], spec.im[i]));
  return m;
}

describe("examples", () => {
  it("has five spatial examples that each generate an N*N buffer", () => {
    expect(examples.length).toBe(5);
    for (const ex of examples) {
      expect(ex.domain).toBe("spatial");
      expect(ex.caption.length).toBeGreaterThan(0);
      const buf = ex.generate(N) as Float32Array;
      expect(buf.length).toBe(N * N);
    }
  });

  it("pure sinusoid peaks at +/- its frequency on the x axis", () => {
    const spec = fft2dForward(byName("Pure sinusoid").generate(N) as Float32Array, N);
    expect(mag(spec, 16, 0)).toBeGreaterThan(100);
    expect(mag(spec, N - 16, 0)).toBeGreaterThan(100);
    expect(mag(spec, 0, 0)).toBeGreaterThan(mag(spec, 16, 0)); // DC dominates
    expect(mag(spec, 7, 3)).toBeLessThan(1); // off-peak ~ 0
  });

  it("single point has a flat magnitude spectrum", () => {
    const spec = fft2dForward(byName("Single point").generate(N) as Float32Array, N);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < N * N; i++) {
      const m = Math.hypot(spec.re[i], spec.im[i]);
      if (m < min) min = m;
      if (m > max) max = m;
    }
    expect(max - min).toBeLessThan(1e-4);
  });

  it("box has DC equal to its area and DC is the maximum magnitude", () => {
    const buf = byName("Box").generate(N) as Float32Array;
    let area = 0;
    for (let i = 0; i < buf.length; i++) area += buf[i];
    const spec = fft2dForward(buf, N);
    expect(mag(spec, 0, 0)).toBeCloseTo(area, 1);
    expect(mag(spec, 0, 0)).toBeCloseTo(maxMag(spec), 1);
  });

  it("gaussian blob has DC as its maximum magnitude", () => {
    const spec = fft2dForward(byName("Gaussian blob").generate(N) as Float32Array, N);
    expect(mag(spec, 0, 0)).toBeCloseTo(maxMag(spec), 1);
  });

  it("sum of sinusoids peaks at each component frequency", () => {
    const spec = fft2dForward(byName("Sum of sinusoids").generate(N) as Float32Array, N);
    expect(mag(spec, 8, 0)).toBeGreaterThan(100);
    expect(mag(spec, 0, 24)).toBeGreaterThan(100);
    expect(mag(spec, 16, 16)).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- examples`
Expected: FAIL — cannot find module `./examples`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/examples.ts
import type { Spectrum } from "./fft2d";

export interface Example {
  name: string;
  caption: string;
  domain: "spatial" | "kspace";
  generate(N: number): Float32Array | Spectrum;
}

/** 0.5 + 0.5*cos: a single horizontal spatial frequency. */
function sinusoid(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const f = 16;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      out[y * N + x] = 0.5 + 0.5 * Math.cos((2 * Math.PI * f * x) / N);
    }
  }
  return out;
}

/** A single bright pixel at the center. */
function singlePoint(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const c = N >> 1;
  out[c * N + c] = 1;
  return out;
}

/** A centered filled square of side N/8. */
function box(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const c = N >> 1;
  const half = N >> 4; // side = 2*half = N/8
  for (let y = c - half; y < c + half; y++) {
    for (let x = c - half; x < c + half; x++) {
      out[y * N + x] = 1;
    }
  }
  return out;
}

/** A centered Gaussian blob, sigma = N/16. */
function gaussian(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const c = N / 2;
  const sigma = N / 16;
  const denom = 2 * sigma * sigma;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c;
      const dy = y - c;
      out[y * N + x] = Math.exp(-(dx * dx + dy * dy) / denom);
    }
  }
  return out;
}

/** Three superimposed sinusoids (x, y, and diagonal). Stays within [0,1]. */
function sumOfSinusoids(N: number): Float32Array {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      out[y * N + x] =
        0.5 +
        0.17 * Math.cos((2 * Math.PI * 8 * x) / N) +
        0.17 * Math.cos((2 * Math.PI * 24 * y) / N) +
        0.16 * Math.cos((2 * Math.PI * 16 * (x + y)) / N);
    }
  }
  return out;
}

export const examples: Example[] = [
  {
    name: "Pure sinusoid",
    domain: "spatial",
    caption:
      "A single spatial frequency. In k-space it's one symmetric pair of points — plus the bright DC center (the average brightness).",
    generate: sinusoid,
  },
  {
    name: "Single point",
    domain: "spatial",
    caption:
      "A single point contains every frequency equally — its transform is uniformly bright.",
    generate: singlePoint,
  },
  {
    name: "Box",
    domain: "spatial",
    caption:
      "A sharp-edged box becomes a sinc pattern: crisp edges need many high frequencies.",
    generate: box,
  },
  {
    name: "Gaussian blob",
    domain: "spatial",
    caption:
      "A Gaussian transforms to a Gaussian — smooth blobs have compact, smooth spectra.",
    generate: gaussian,
  },
  {
    name: "Sum of sinusoids",
    domain: "spatial",
    caption:
      "Adding frequencies adds points: each sinusoid is one symmetric pair in k-space.",
    generate: sumOfSinusoids,
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- examples`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/examples.ts src/engine/examples.test.ts
git commit -m "feat(engine): add transform example generators"
```

---

### Task 2: Examples dropdown + caption bar

**Files:**
- Modify: `src/ui/dom.ts` (import examples; add Examples `<select>` and caption bar)
- Modify: `src/ui/styles.css` (caption bar styling)
- Modify: `src/main.ts` (wire selection → load example + show caption)

- [ ] **Step 1: Add the import at the top of `src/ui/dom.ts`**

Change the imports at the top of the file from:

```ts
// src/ui/dom.ts
import { phaseColormaps } from "../engine/mapping";
```

to:

```ts
// src/ui/dom.ts
import { phaseColormaps } from "../engine/mapping";
import { examples } from "../engine/examples";
```

- [ ] **Step 2: Add the Examples select to the toolbar in `src/ui/dom.ts`**

In the `root.innerHTML` template, insert the Examples label as the FIRST child of `<div class="toolbar">`, immediately before the `<label>Tool` block:

```html
      <label>Examples
        <select id="examples">
          <option value="">Examples…</option>
          ${examples.map((e, i) => `<option value="${i}">${e.name}</option>`).join("")}
        </select>
      </label>
```

- [ ] **Step 3: Add the caption bar in `src/ui/dom.ts`**

In the same template, immediately AFTER the closing `</div>` of `<div class="panels">`, add:

```html
    <div class="caption" id="caption"></div>
```

- [ ] **Step 4: Add caption styling to `src/ui/styles.css`**

Append this rule to the end of the file:

```css
.caption { padding: 6px 12px; font-size: 13px; color: #aaa; min-height: 20px; }
```

- [ ] **Step 5: Wire example selection in `src/main.ts`**

Add these imports next to the other imports at the top of `src/main.ts`:

```ts
import { examples } from "./engine/examples";
import type { Spectrum } from "./engine/fft2d";
```

Then append at the END of `src/main.ts`:

```ts
function setCaption(text: string) {
  $("caption").textContent = text;
}

$("examples").addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  if (select.value === "") return;
  const ex = examples[Number(select.value)];
  const data = ex.generate(N);
  if (ex.domain === "spatial") store.setSpatial(data as Float32Array);
  else store.setSpectrum(data as Spectrum);
  setCaption(ex.caption);
  // Reset to the placeholder so the same example can be re-selected and the
  // dropdown never misrepresents state after manual edits.
  select.value = "";
});
```

- [ ] **Step 6: Type-check and build**

Run: `npm run build`
Expected: `tsc --noEmit` passes and the Vite build succeeds.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev` and open the URL. Verify:
- The toolbar shows an **Examples** dropdown listing all five examples.
- Selecting **Pure sinusoid** fills the spatial canvas with a striped pattern and the k-space canvas shows a symmetric pair of bright points plus the DC center; the caption bar below the canvases shows the sinusoid caption.
- Selecting **Single point**, **Box**, **Gaussian blob**, and **Sum of sinusoids** each updates both canvases and the caption.
- After a selection the dropdown returns to "Examples…".
- No console errors.
Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): add examples dropdown and caption bar"
```

---

### Task 3: Clear button

**Files:**
- Modify: `src/ui/dom.ts` (add Clear button)
- Modify: `src/main.ts` (wire Clear → blank workspace + clear caption)

- [ ] **Step 1: Add the Clear button to the toolbar in `src/ui/dom.ts`**

In the `root.innerHTML` template, immediately AFTER the `<button id="export-kspace">Export k-space</button>` line, add:

```html
      <button id="clear">Clear</button>
```

- [ ] **Step 2: Wire the Clear button in `src/main.ts`**

Append at the END of `src/main.ts` (after the examples wiring from Task 2, so `setCaption` is already defined):

```ts
$("clear").addEventListener("click", () => {
  store.setSpatial(new Float32Array(N * N));
  setCaption("");
});
```

- [ ] **Step 3: Type-check and build**

Run: `npm run build`
Expected: `tsc --noEmit` passes and the Vite build succeeds.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev` and open the URL. Verify:
- Draw something on the spatial canvas (brush), then click **Clear** → both canvases go black.
- Select an example, confirm its caption shows, then click **Clear** → canvases blank AND the caption clears.
- No console errors.
Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): add clear button"
```

---

## Final verification

- [ ] Run the full suite: `npm test` → all engine tests pass (including the 6 new example tests).
- [ ] Run `npm run build` → type-check and production build succeed.
- [ ] Manual smoke test: each example loads with its caption; Clear blanks the workspace and caption.

## Notes for the implementer

- All five v1 examples are spatial-domain; the `Example.domain` field and `Spectrum`
  return type exist so a future k-space-defined example can be added without changing the
  loading code in `main.ts`.
- Loading an example and Clear both go through `store.setSpatial`/`setSpectrum`, so when
  Undo/Redo is implemented later they become undoable with no extra work.
- Do not normalize example buffers to a fixed range; `renderSpatial` already min/max
  normalizes for display.
