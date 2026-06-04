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
