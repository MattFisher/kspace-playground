// src/worker/fft.worker.ts
import { fft2dForward, fft2dInverse } from "../engine/fft2d";

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as any;
  if (msg.op === "forward") {
    const result = fft2dForward(msg.spatial as Float32Array, msg.N as number);
    (self as unknown as Worker).postMessage({ id: msg.id, result });
  } else if (msg.op === "inverse") {
    const result = fft2dInverse({ re: msg.re, im: msg.im }, msg.N as number);
    (self as unknown as Worker).postMessage({ id: msg.id, result });
  }
};
