// src/ui/dom.ts
import { phaseColormaps } from "../engine/mapping";

export interface ToolControls {
  tool: "brush" | "eraser" | "line" | "rect" | "circle";
  size: number;
  softness: number;
  grayValue: number;   // spatial paint value 0..1
  magnitude: number;   // k-space paint magnitude
  phase: number;       // k-space paint phase (radians)
  colormapIndex: number;
}

export interface UI {
  spatialCanvas: HTMLCanvasElement;
  kspaceCanvas: HTMLCanvasElement;
  controls: ToolControls;
  onColormapChange: (cb: () => void) => void;
}

export function buildUI(root: HTMLElement, N: number): UI {
  const controls: ToolControls = {
    tool: "brush",
    size: 12,
    softness: 0.3,
    grayValue: 1,
    magnitude: 50,
    phase: 0,
    colormapIndex: 0,
  };

  root.innerHTML = `
    <div class="toolbar">
      <label>Tool
        <select id="tool">
          <option value="brush">Brush</option>
          <option value="eraser">Eraser</option>
          <option value="line">Line</option>
          <option value="rect">Rectangle</option>
          <option value="circle">Circle/Ring</option>
        </select>
      </label>
      <label>Size <input id="size" type="range" min="1" max="60" value="12"></label>
      <label>Softness <input id="softness" type="range" min="0" max="100" value="30"></label>
      <label>Gray <input id="gray" type="range" min="0" max="100" value="100"></label>
      <label>Magnitude <input id="mag" type="range" min="0" max="200" value="50"></label>
      <label>Phase <input id="phase" type="range" min="-314" max="314" value="0"></label>
      <label>Phase colors
        <select id="colormap">
          ${phaseColormaps.map((c, i) => `<option value="${i}">${c.name}</option>`).join("")}
        </select>
      </label>
      <label>Import spatial <input id="import-spatial" type="file" accept="image/*"></label>
      <label>Import k-space <input id="import-kspace" type="file" accept="image/*"></label>
      <button id="export-spatial">Export image</button>
      <button id="export-kspace">Export k-space</button>
    </div>
    <div class="panels">
      <div class="panel"><h2>Spatial (image)</h2><canvas id="spatial" width="${N}" height="${N}"></canvas></div>
      <div class="panel"><h2>k-space (FFT)</h2><canvas id="kspace" width="${N}" height="${N}"></canvas></div>
    </div>
  `;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;

  $("tool").addEventListener("change", (e) => {
    controls.tool = (e.target as HTMLSelectElement).value as ToolControls["tool"];
  });
  $("size").addEventListener("input", (e) => {
    controls.size = Number((e.target as HTMLInputElement).value);
  });
  $("softness").addEventListener("input", (e) => {
    controls.softness = Number((e.target as HTMLInputElement).value) / 100;
  });
  $("gray").addEventListener("input", (e) => {
    controls.grayValue = Number((e.target as HTMLInputElement).value) / 100;
  });
  $("mag").addEventListener("input", (e) => {
    controls.magnitude = Number((e.target as HTMLInputElement).value);
  });
  $("phase").addEventListener("input", (e) => {
    controls.phase = Number((e.target as HTMLInputElement).value) / 100;
  });

  const colormapListeners: Array<() => void> = [];
  $("colormap").addEventListener("change", (e) => {
    controls.colormapIndex = Number((e.target as HTMLSelectElement).value);
    colormapListeners.forEach((cb) => cb());
  });

  return {
    spatialCanvas: $("spatial") as HTMLCanvasElement,
    kspaceCanvas: $("kspace") as HTMLCanvasElement,
    controls,
    onColormapChange: (cb) => colormapListeners.push(cb),
  };
}
