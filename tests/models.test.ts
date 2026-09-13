import { describe, expect, it } from 'vitest';
import { loadLocalModels, WASM_URL, ORT_WASM_URL, HAND_MODEL_URL, CLASSIFIER_URL } from '../src/cv/models';

describe('pinned local model loading', () => {
  it('uses VIDEO two-hand MediaPipe, WASM one-thread ORT, and exact model URLs', async () => {
    const calls: string[] = []; let current = true; let sessionReleased = false; let detectorClosed = false;
    const detector = { close: () => { detectorClosed = true; } };
    const vision = { FilesetResolver: { forVisionTasks: async (url: string) => { calls.push(url); return {}; } }, HandLandmarker: { createFromOptions: async (_fileset: unknown, options: unknown) => { calls.push(JSON.stringify(options)); return detector; } } };
    const ort = { env: { wasm: {} as Record<string, unknown> }, InferenceSession: { create: async () => ({ release: () => { sessionReleased = true; } }) } };
    try {
      const runtime = await loadLocalModels(4, () => current, { loadModule: async (url) => url.includes('mediapipe') ? vision : ort, fetchModel: async (url) => { calls.push(String(url)); return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }; } });
      expect(runtime.generation).toBe(4); expect(ort.env.wasm.wasmPaths).toBe(ORT_WASM_URL); expect(ort.env.wasm.numThreads).toBe(1); expect(calls).toContain(WASM_URL); expect(calls.some((call) => call.includes(HAND_MODEL_URL))).toBe(true); expect(calls).toContain(CLASSIFIER_URL); expect(calls.some((call) => call.includes('"runningMode":"VIDEO"') && call.includes('"numHands":2'))).toBe(true);
    } finally { /* injected fetch keeps the test isolated */ }
    expect(detectorClosed).toBe(false); expect(sessionReleased).toBe(false);
    current = false;
  });

  it('disposes the detector when a model load becomes stale after fetch', async () => {
    let current = true; let closeCount = 0; let resolveBuffer: ((value: ArrayBuffer) => void) | undefined;
    const detector = { close: () => { closeCount += 1; } };
    const vision = { FilesetResolver: { forVisionTasks: async () => ({}) }, HandLandmarker: { createFromOptions: async () => detector } };
    const ort = { env: { wasm: {} as Record<string, unknown> }, InferenceSession: { create: async () => ({}) } };
    const loading = loadLocalModels(9, () => current, { loadModule: async (url) => url.includes('mediapipe') ? vision : ort, fetchModel: async () => ({ ok: true, status: 200, arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { resolveBuffer = resolve; }) }) });
    await new Promise<void>((resolve) => { const wait = () => { if (resolveBuffer !== undefined) resolve(); else queueMicrotask(wait); }; wait(); });
    current = false; resolveBuffer?.(new ArrayBuffer(4));
    await expect(loading).rejects.toThrow('Stale model generation'); expect(closeCount).toBe(1);
  });
});
