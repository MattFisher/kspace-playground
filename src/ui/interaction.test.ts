// src/ui/interaction.test.ts
import { describe, it, expect } from "vitest";
import { displayCoverageToBuffer } from "./interaction";
import { createStore } from "../engine/state";
import { fft2dForward, fft2dInverse } from "../engine/fft2d";
import { renderKspace } from "../engine/render";
import { hueWheelColormap } from "../engine/mapping";
import { brushCoverage } from "../engine/stroke";

/** Index of the brightest (r+g+b) pixel in a RenderedImage. */
function brightestPixel(data: Uint8ClampedArray, N: number) {
  let best = -1;
  let bx = -1;
  let by = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      const v = data[o] + data[o + 1] + data[o + 2];
      if (v > best) {
        best = v;
        bx = x;
        by = y;
      }
    }
  }
  return { x: bx, y: by };
}

describe("k-space brush coordinate mapping", () => {
  it("brightens the displayed k-space under the cursor, not the diagonally-opposite quadrant", () => {
    const N = 8;
    const store = createStore(N, { forward: fft2dForward, inverse: fft2dInverse });

    // The user brushes at display position (1, 2) — off-center so the bug
    // (which lands at ((1+4)%8, (2+4)%8) = (5, 6)) is distinguishable.
    const dx = 1;
    const dy = 2;
    const cov = brushCoverage(N, dx, dy, 0.6, 0); // single hard pixel at (dx, dy)

    // The interaction layer must map display-coordinate coverage back to the
    // spectrum buffer before editing it.
    store.editKspace(displayCoverageToBuffer(cov, N), 80, 0);

    const img = renderKspace(store.getSpectrum(), N, hueWheelColormap);
    expect(brightestPixel(img.data, N)).toEqual({ x: dx, y: dy });
  });
});
