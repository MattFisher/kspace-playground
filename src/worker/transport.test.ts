// src/worker/transport.test.ts
import { describe, it, expect } from "vitest";
import { createTransport } from "./transport";
import { fft2dForward, fft2dInverse } from "../engine/fft2d";

/** A fake worker that runs the real transforms synchronously. */
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(msg: any) {
    let result: any;
    if (msg.op === "forward") {
      result = fft2dForward(msg.spatial, msg.N);
    } else {
      result = fft2dInverse({ re: msg.re, im: msg.im }, msg.N);
    }
    queueMicrotask(() =>
      this.onmessage?.({ data: { id: msg.id, result } }),
    );
  }
  terminate() {}
}

describe("transport", () => {
  it("resolves forward transforms by id", async () => {
    const transport = createTransport(new FakeWorker() as any);
    const N = 4;
    const img = new Float32Array(N * N).fill(1);
    const spec = await transport.forward(img, N);
    expect(Math.abs(spec.re[0] - 16)).toBeLessThan(1e-3);
  });

  it("resolves inverse transforms by id", async () => {
    const transport = createTransport(new FakeWorker() as any);
    const N = 4;
    const img = new Float32Array(N * N).fill(3);
    const spec = await transport.forward(img, N);
    const back = await transport.inverse(spec, N);
    for (let i = 0; i < back.length; i++) {
      expect(Math.abs(back[i] - 3)).toBeLessThan(1e-3);
    }
  });
});
