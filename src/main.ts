// src/main.ts
import "./ui/styles.css";
import { buildUI } from "./ui/dom";
import { createStore } from "./engine/state";
import { fft2dForward, fft2dInverse } from "./engine/fft2d";
import { renderSpatial, renderKspace } from "./engine/render";
import { phaseColormaps } from "./engine/mapping";

const N = 512;
const root = document.querySelector<HTMLDivElement>("#app")!;
const ui = buildUI(root, N);
const store = createStore(N, { forward: fft2dForward, inverse: fft2dInverse });

const spatialCtx = ui.spatialCanvas.getContext("2d")!;
const kspaceCtx = ui.kspaceCanvas.getContext("2d")!;

function paint() {
  const s = renderSpatial(store.getSpatial(), N);
  const sData = s.data as unknown as Uint8ClampedArray<ArrayBuffer>;
  spatialCtx.putImageData(new ImageData(sData, N, N), 0, 0);
  const cmap = phaseColormaps[ui.controls.colormapIndex];
  const k = renderKspace(store.getSpectrum(), N, cmap);
  const kData = k.data as unknown as Uint8ClampedArray<ArrayBuffer>;
  kspaceCtx.putImageData(new ImageData(kData, N, N), 0, 0);
}

store.subscribe(paint);
ui.onColormapChange(paint);
paint();

// Expose for Task 10 wiring/manual debugging.
(window as any).__kspace = { store, ui, paint, N };
