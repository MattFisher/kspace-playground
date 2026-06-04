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
