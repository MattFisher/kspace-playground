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
