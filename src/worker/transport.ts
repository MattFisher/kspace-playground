// src/worker/transport.ts
import type { Spectrum } from "../engine/fft2d";

interface PendingResolver {
  (result: any): void;
}

export interface Transport {
  forward(spatial: Float32Array, N: number): Promise<Spectrum>;
  inverse(spec: Spectrum, N: number): Promise<Float32Array>;
}

export function createTransport(worker: Worker): Transport {
  let nextId = 0;
  const pending = new Map<number, PendingResolver>();

  worker.onmessage = (e: MessageEvent) => {
    const { id, result } = e.data as { id: number; result: unknown };
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(result);
    }
  };

  function call<T>(msg: Record<string, unknown>): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve) => {
      pending.set(id, resolve as PendingResolver);
      worker.postMessage({ ...msg, id });
    });
  }

  return {
    forward(spatial, N) {
      return call<Spectrum>({ op: "forward", spatial, N });
    },
    inverse(spec, N) {
      return call<Float32Array>({ op: "inverse", re: spec.re, im: spec.im, N });
    },
  };
}
