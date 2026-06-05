// src/main.ts
import "./ui/styles.css";
import { buildUI } from "./ui/dom";
import { createStore } from "./engine/state";
import { fft2dForward, fft2dInverse } from "./engine/fft2d";
import { renderSpatial, renderKspace } from "./engine/render";
import { phaseColormaps } from "./engine/mapping";
import { attachInteraction, fileToLuminance } from "./ui/interaction";
import { examples } from "./engine/examples";
import type { Spectrum } from "./engine/fft2d";

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

attachInteraction(ui.spatialCanvas, "spatial", store, ui.controls);
attachInteraction(ui.kspaceCanvas, "kspace", store, ui.controls);

function $(id: string) {
  return root.querySelector<HTMLElement>(`#${id}`)!;
}

// Import to spatial: load luminance and set it.
$("import-spatial").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  store.setSpatial(await fileToLuminance(file, N));
});

// Import to k-space (v1): treat luminance as log-magnitude, zero phase.
$("import-kspace").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const lum = await fileToLuminance(file, N);
  const re = new Float32Array(N * N);
  const im = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    // Invert the log-magnitude display mapping: magnitude = exp(scaledLum) - 1.
    re[i] = Math.exp(lum[i] * 8) - 1; // phase 0 -> all real
  }
  store.setSpectrum({ re, im });
});

function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = name;
  a.click();
}

$("export-spatial").addEventListener("click", () => downloadCanvas(ui.spatialCanvas, "image.png"));
$("export-kspace").addEventListener("click", () => downloadCanvas(ui.kspaceCanvas, "kspace.png"));

function setCaption(text: string) {
  $("caption").textContent = text;
}

$("examples").addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  if (select.value === "") return;
  const ex = examples[Number(select.value)];
  const data = ex.generate(N);
  if (ex.domain === "spatial") store.setSpatial(data as Float32Array);
  else store.setSpectrum(data as Spectrum);
  setCaption(ex.caption);
  // Reset to the placeholder so the same example can be re-selected and the
  // dropdown never misrepresents state after manual edits.
  select.value = "";
});

$("clear").addEventListener("click", () => {
  store.setSpatial(new Float32Array(N * N));
  setCaption("");
});
