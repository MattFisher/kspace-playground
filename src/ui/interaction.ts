// src/ui/interaction.ts
import type { Store } from "../engine/state";
import type { ToolControls } from "./dom";
import {
  brushCoverage,
  lineCoverage,
  rectCoverage,
  circleCoverage,
} from "../engine/stroke";
import { fftshift } from "../engine/render";

type Domain = "spatial" | "kspace";

/**
 * The k-space canvas is displayed fftshift'd (DC centered), but the spectrum
 * buffer is in FFT-natural order (DC at index 0). A brush built in display
 * coordinates must be mapped back to buffer coordinates before editing the
 * spectrum, otherwise edits land in the diagonally-opposite quadrant. For the
 * power-of-two (even) N used here, fftshift is its own inverse, so we reuse it.
 */
export function displayCoverageToBuffer(cov: Float32Array, N: number): Float32Array {
  return fftshift(cov, N);
}

/** Map a pointer event to integer buffer coordinates for an N×N canvas. */
function toBufferCoords(canvas: HTMLCanvasElement, N: number, e: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * N);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * N);
  return { x: Math.max(0, Math.min(N - 1, x)), y: Math.max(0, Math.min(N - 1, y)) };
}

function applyEdit(store: Store, domain: Domain, c: ToolControls, cov: Float32Array) {
  if (domain === "spatial") {
    const value = c.tool === "eraser" ? 0 : c.grayValue;
    store.editSpatial(cov, value);
  } else {
    const mag = c.tool === "eraser" ? 0 : c.magnitude;
    store.editKspace(displayCoverageToBuffer(cov, store.N), mag, c.phase);
  }
}

export function attachInteraction(
  canvas: HTMLCanvasElement,
  domain: Domain,
  store: Store,
  controls: ToolControls,
) {
  const N = store.N;
  let drawing = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let pendingCoverage: Float32Array | null = null;
  let rafQueued = false;

  function queueEdit(cov: Float32Array) {
    // Accumulate coverage (max) until the next animation frame, then one transform.
    if (!pendingCoverage) pendingCoverage = new Float32Array(N * N);
    for (let i = 0; i < cov.length; i++) {
      if (cov[i] > pendingCoverage[i]) pendingCoverage[i] = cov[i];
    }
    if (!rafQueued) {
      rafQueued = true;
      requestAnimationFrame(() => {
        rafQueued = false;
        const cov2 = pendingCoverage!;
        pendingCoverage = null;
        applyEdit(store, domain, controls, cov2);
      });
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const p = toBufferCoords(canvas, N, e);
    startX = lastX = p.x;
    startY = lastY = p.y;
    if (controls.tool === "brush" || controls.tool === "eraser") {
      queueEdit(brushCoverage(N, p.x, p.y, controls.size / 2, controls.softness));
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = toBufferCoords(canvas, N, e);
    if (controls.tool === "brush" || controls.tool === "eraser") {
      // Stamp along the movement for continuous strokes.
      queueEdit(lineCoverage(N, lastX, lastY, p.x, p.y, controls.size));
    }
    lastX = p.x;
    lastY = p.y;
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!drawing) return;
    drawing = false;
    const p = toBufferCoords(canvas, N, e);
    let cov: Float32Array | null = null;
    if (controls.tool === "line") cov = lineCoverage(N, startX, startY, p.x, p.y, controls.size);
    else if (controls.tool === "rect") cov = rectCoverage(N, startX, startY, p.x, p.y);
    else if (controls.tool === "circle") {
      const r = Math.hypot(p.x - startX, p.y - startY);
      cov = circleCoverage(N, startX, startY, r, controls.size);
    }
    if (cov) applyEdit(store, domain, controls, cov);
  });
}

/** Load an image file, resize to N×N luminance, return a Float32Array(0..1). */
export async function fileToLuminance(file: File, N: number): Promise<Float32Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const c = document.createElement("canvas");
    c.width = N;
    c.height = N;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, N, N);
    const data = ctx.getImageData(0, 0, N, N).data;
    const out = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
