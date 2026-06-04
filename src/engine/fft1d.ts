// src/engine/fft1d.ts

/**
 * In-place radix-2 Cooley–Tukey FFT. Length must be a power of two.
 * `invert = false` is the forward transform (no normalization).
 * `invert = true` is the inverse transform (divides by n).
 */
export function fft1d(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`fft1d length must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const idx = i + k + half;
        const bRe = re[idx] * curRe - im[idx] * curIm;
        const bIm = re[idx] * curIm + im[idx] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[idx] = aRe - bRe;
        im[idx] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}
