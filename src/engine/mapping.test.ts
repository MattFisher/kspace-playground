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
