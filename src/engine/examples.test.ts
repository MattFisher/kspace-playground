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
