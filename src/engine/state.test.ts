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
