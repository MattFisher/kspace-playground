// src/engine/stroke.ts

/** All functions return a Float32Array(N*N) coverage map in [0,1]. */

export function brushCoverage(
  N: number,
  cx: number,
  cy: number,
  radius: number,
  softness: number, // 0 = hard, 1 = fully soft
): Float32Array {
  const cov = new Float32Array(N * N);
  // Extend outer boundary by 0.5px so integer pixels at exactly d==radius
  // receive partial coverage when softness > 0.
  const outer = softness > 0 ? radius + 0.5 : radius;
  const x0 = Math.max(0, Math.floor(cx - outer));
  const x1 = Math.min(N - 1, Math.ceil(cx + outer));
  const y0 = Math.max(0, Math.floor(cy - outer));
  const y1 = Math.min(N - 1, Math.ceil(cy + outer));
  const inner = radius * (1 - softness);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      let a = 0;
      if (d <= inner) a = 1;
      else if (d <= outer) a = 1 - (d - inner) / (outer - inner);
      if (a > 0) cov[y * N + x] = a;
    }
  }
  return cov;
}

export function lineCoverage(
  N: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): Float32Array {
  // Stamp a small brush along the segment.
  const cov = new Float32Array(N * N);
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const r = Math.max(0.5, thickness / 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    const stamp = brushCoverage(N, px, py, r, 0);
    for (let i = 0; i < cov.length; i++) {
      if (stamp[i] > cov[i]) cov[i] = stamp[i];
    }
  }
  return cov;
}

export function rectCoverage(
  N: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Float32Array {
  const cov = new Float32Array(N * N);
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(N - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(N - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      cov[y * N + x] = 1;
    }
  }
  return cov;
}

/** Ring of the given radius and thickness. thickness <= 0 fills the disk. */
export function circleCoverage(
  N: number,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
): Float32Array {
  const cov = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (thickness <= 0) {
        if (d <= radius) cov[y * N + x] = 1;
      } else if (Math.abs(d - radius) <= thickness / 2) {
        cov[y * N + x] = 1;
      }
    }
  }
  return cov;
}
