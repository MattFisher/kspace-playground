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
