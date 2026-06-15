// src/engine/examples.ts
import type { Spectrum } from "./fft2d";

export interface Example {
  name: string;
  caption: string;
  domain: "spatial" | "kspace";
  generate(N: number): Float32Array | Spectrum;
}

/** 0.5 + 0.5*cos: a single horizontal spatial frequency. */
function sinusoid(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const f = 16;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      out[y * N + x] = 0.5 + 0.5 * Math.cos((2 * Math.PI * f * x) / N);
    }
  }
  return out;
}

/** A single bright pixel at the center. */
function singlePoint(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const c = N >> 1;
  out[c * N + c] = 1;
  return out;
}

/** A centered filled square of side N/8. */
function box(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const c = N >> 1;
  const half = N >> 4; // side = 2*half = N/8
  for (let y = c - half; y < c + half; y++) {
    for (let x = c - half; x < c + half; x++) {
      out[y * N + x] = 1;
    }
  }
  return out;
}

/** A centered Gaussian blob, sigma = N/16. */
function gaussian(N: number): Float32Array {
  const out = new Float32Array(N * N);
  const c = N / 2;
  const sigma = N / 16;
  const denom = 2 * sigma * sigma;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c;
      const dy = y - c;
      out[y * N + x] = Math.exp(-(dx * dx + dy * dy) / denom);
    }
  }
  return out;
}

/** Three superimposed sinusoids (x, y, and diagonal). Stays within [0,1]. */
function sumOfSinusoids(N: number): Float32Array {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      out[y * N + x] =
        0.5 +
        0.17 * Math.cos((2 * Math.PI * 8 * x) / N) +
        0.17 * Math.cos((2 * Math.PI * 24 * y) / N) +
        0.16 * Math.cos((2 * Math.PI * 16 * (x + y)) / N);
    }
  }
  return out;
}

export const examples: Example[] = [
  {
    name: "Pure sinusoid",
    domain: "spatial",
    caption:
      "A single spatial frequency. In k-space it's one symmetric pair of points — plus the bright DC center (the average brightness).",
    generate: sinusoid,
  },
  {
    name: "Single point",
    domain: "spatial",
    caption:
      "A single point contains every frequency equally — its transform is uniformly bright.",
    generate: singlePoint,
  },
  {
    name: "Box",
    domain: "spatial",
    caption:
      "A sharp-edged box becomes a sinc pattern: crisp edges need many high frequencies.",
    generate: box,
  },
  {
    name: "Gaussian blob",
    domain: "spatial",
    caption:
      "A Gaussian transforms to a Gaussian — smooth blobs have compact, smooth spectra.",
    generate: gaussian,
  },
  {
    name: "Sum of sinusoids",
    domain: "spatial",
    caption:
      "Adding frequencies adds points: each sinusoid is one symmetric pair in k-space.",
    generate: sumOfSinusoids,
  },
];
