import { describe, expect, it } from 'vitest';
import { CameraController } from '../src/cv/camera';

function videoMock() {
  return { srcObject: null as MediaStream | null, muted: false, play: async () => undefined, pause: () => undefined } as unknown as HTMLVideoElement;
}
function streamMock() {
  let stopped = 0;
  return { stream: { getTracks: () => [{ stop: () => { stopped += 1; } }] } as unknown as MediaStream, stopped: () => stopped };
}
function runtimeMock() { return { detector: { detectForVideo: () => ({ landmarks: [] }) }, session: { inputNames: ['input'], outputNames: ['output'], run: async () => ({ output: { data: [] } }) }, ort: { Tensor: class { constructor(_type: string, _data: Float32Array, _dims: [number, number]) {} } }, generation: 1 }; }

describe('camera lifecycle', () => {
  it('stops a stale stream acquired after a retry', async () => {
    let resolveFirst!: (stream: MediaStream) => void;
    const first = new Promise<MediaStream>((resolve) => { resolveFirst = resolve; });
    const second = streamMock(); const stale = streamMock(); let calls = 0;
    const devices = { getUserMedia: (() => { calls += 1; return calls === 1 ? first : Promise.resolve(second.stream); }) as (constraints: MediaStreamConstraints) => Promise<MediaStream> };
    const camera = new CameraController(videoMock(), { devices, getRoundGeneration: () => 1, loadModels: async () => runtimeMock() });
    const oldStart = camera.start(1);
    await Promise.resolve();
    const newStart = camera.retry(1);
    resolveFirst(stale.stream);
    await oldStart; await newStart;
    expect(stale.stopped()).toBe(1); expect(second.stopped()).toBe(0);
  });

  it('stops active tracks and invalidates frames when visibility is lost', async () => {
    const stream = streamMock(); const camera = new CameraController(videoMock(), { devices: { getUserMedia: async () => stream.stream }, getRoundGeneration: () => 1, loadModels: async () => runtimeMock() });
    const generation = 1; await camera.start(generation);
    expect(camera.isCurrent(generation)).toBe(true);
    camera.onVisibilityChange(true);
    expect(camera.active).toBe(false); expect(camera.isCurrent(generation)).toBe(false); expect(stream.stopped()).toBe(1);
  });

  it('does not call frame hooks after stop', async () => {
    const stream = streamMock(); let predictions = 0; const video = videoMock(); Object.defineProperty(video, 'readyState', { value: 3 }); Object.defineProperty(video, 'currentTime', { value: 1 }); const camera = new CameraController(video, { devices: { getUserMedia: async () => stream.stream }, getRoundGeneration: () => 1, loadModels: async () => runtimeMock(), onPrediction: () => { predictions += 1; } });
    await camera.start(1); camera.stop();
    expect(predictions).toBe(0);
  });

  it('drops an in-flight classifier result after the camera generation is stopped', async () => {
    const stream = streamMock(); let callback: ((time: number) => void) | undefined; let resolveRun!: (value: Record<string, { data: number[] }>) => void; let runStarted = false; let predictions = 0;
    const points = Array.from({ length: 21 }, (_, index) => ({ x: index, y: index }));
    const runtime = { detector: { detectForVideo: () => ({ landmarks: [points], handednesses: [[{ categoryName: 'Left' }]] }) }, session: { inputNames: ['input'], outputNames: ['output'], run: async () => { runStarted = true; return new Promise<Record<string, { data: number[] }>>((resolve) => { resolveRun = resolve; }); } }, ort: { Tensor: class { constructor(_type: string, _data: Float32Array, _dims: [number, number]) {} } }, generation: 1 };
    const video = videoMock(); Object.defineProperty(video, 'readyState', { value: 3 }); Object.defineProperty(video, 'currentTime', { value: 1 });
    const raf = { request: (fn: (time: number) => void) => { callback = fn; return 1; }, cancel: () => undefined };
    const camera = new CameraController(video, { devices: { getUserMedia: async () => stream.stream }, getRoundGeneration: () => 1, loadModels: async () => runtime, raf, onPrediction: () => { predictions += 1; } });
    await camera.start(1); callback?.(100); await new Promise<void>((resolve) => { const wait = () => runStarted ? resolve() : queueMicrotask(wait); wait(); }); camera.stop(); resolveRun({ output: { data: [.9] } }); await Promise.resolve(); await Promise.resolve();
    expect(predictions).toBe(0);
  });

  it('does not report live when video playback is rejected', async () => {
    const stream = streamMock(); const statuses: string[] = [];
    const listeners = new Map<string, () => void>();
    const video = {
      srcObject: null as MediaStream | null, muted: false, readyState: 3, currentTime: 0,
      play: async () => { throw new Error('autoplay blocked'); }, pause: () => undefined,
      addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
      removeEventListener: (name: string) => { listeners.delete(name); },
    } as unknown as HTMLVideoElement;
    const camera = new CameraController(video, {
      devices: { getUserMedia: async () => stream.stream },
      getRoundGeneration: () => 1,
      loadModels: async () => runtimeMock(),
      onStatus: (status) => statuses.push(status),
    });
    await camera.start(1);
    expect(camera.active).toBe(false);
    expect(statuses.at(-1)).toBe('Camera unavailable • Retry or Cancel');
    expect(stream.stopped()).toBe(1);
    expect(listeners.size).toBe(0);
  });
});
