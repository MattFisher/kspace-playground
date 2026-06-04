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
