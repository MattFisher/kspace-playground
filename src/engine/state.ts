// src/engine/state.ts
import type { Spectrum } from "./fft2d";
import { complexFromMagPhase } from "./mapping";

export type Domain = "spatial" | "kspace";

export interface Transforms {
  forward(spatial: Float32Array, N: number): Spectrum;
  inverse(spec: Spectrum, N: number): Float32Array;
}

export interface Store {
  readonly N: number;
  getSpatial(): Float32Array;
  getSpectrum(): Spectrum;
  lastEdited(): Domain | null;
  /** Blend `value` into the spatial buffer through coverage, then forward FFT. */
  editSpatial(coverage: Float32Array, value: number): void;
  /** Write magnitude/phase into the spectrum through coverage, then inverse FFT. */
  editKspace(coverage: Float32Array, magnitude: number, phase: number): void;
  /** Replace the spatial buffer wholesale (e.g. on import) and recompute. */
  setSpatial(spatial: Float32Array): void;
  /** Replace the spectrum wholesale (e.g. on import) and recompute. */
  setSpectrum(spec: Spectrum): void;
  /** Subscribe to "buffers changed"; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

export function createStore(N: number, t: Transforms): Store {
  let spatial: Float32Array = new Float32Array(N * N);
  let spectrum: Spectrum = t.forward(spatial, N);
  let last: Domain | null = null;
  const listeners = new Set<() => void>();

  function emit() {
    for (const fn of listeners) fn();
  }

  return {
    N,
    getSpatial: () => spatial,
    getSpectrum: () => spectrum,
    lastEdited: () => last,

    editSpatial(coverage, value) {
      for (let i = 0; i < spatial.length; i++) {
        const a = coverage[i];
        if (a > 0) spatial[i] = spatial[i] * (1 - a) + value * a;
      }
      spectrum = t.forward(spatial, N);
      last = "spatial";
      emit();
    },

    editKspace(coverage, magnitude, phase) {
      const c = complexFromMagPhase(magnitude, phase);
      const re = spectrum.re;
      const im = spectrum.im;
      for (let i = 0; i < re.length; i++) {
        const a = coverage[i];
        if (a > 0) {
          re[i] = re[i] * (1 - a) + c.re * a;
          im[i] = im[i] * (1 - a) + c.im * a;
        }
      }
      spatial = t.inverse(spectrum, N);
      last = "kspace";
      emit();
    },

    setSpatial(next) {
      spatial = next;
      spectrum = t.forward(spatial, N);
      last = "spatial";
      emit();
    },

    setSpectrum(next) {
      spectrum = next;
      spatial = t.inverse(spectrum, N);
      last = "kspace";
      emit();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
