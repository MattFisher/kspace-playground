// src/engine/fft2d.ts
import { fft1d } from "./fft1d";

export interface Spectrum {
  re: Float32Array;
  im: Float32Array;
}

/** Run an in-place 2D FFT on Float64 buffers (rows then columns). */
function fft2dInPlace(re: Float64Array, im: Float64Array, N: number, invert: boolean): void {
  const rowRe = new Float64Array(N);
  const rowIm = new Float64Array(N);

  // Rows.
  for (let y = 0; y < N; y++) {
    const off = y * N;
    for (let x = 0; x < N; x++) {
      rowRe[x] = re[off + x];
      rowIm[x] = im[off + x];
    }
    fft1d(rowRe, rowIm, invert);
    for (let x = 0; x < N; x++) {
      re[off + x] = rowRe[x];
      im[off + x] = rowIm[x];
    }
  }

  // Columns.
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      rowRe[y] = re[y * N + x];
      rowIm[y] = im[y * N + x];
    }
    fft1d(rowRe, rowIm, invert);
    for (let y = 0; y < N; y++) {
      re[y * N + x] = rowRe[y];
      im[y * N + x] = rowIm[y];
    }
  }
}

/** Forward 2D FFT of a real image. Returns a complex spectrum. */
export function fft2dForward(spatial: Float32Array, N: number): Spectrum {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) re[i] = spatial[i];
  fft2dInPlace(re, im, N, false);
  return { re: Float32Array.from(re), im: Float32Array.from(im) };
}

/** Inverse 2D FFT. Returns the REAL part of the result (documented choice). */
export function fft2dInverse(spec: Spectrum, N: number): Float32Array {
  const re = Float64Array.from(spec.re);
  const im = Float64Array.from(spec.im);
  fft2dInPlace(re, im, N, true);
  return Float32Array.from(re);
}
