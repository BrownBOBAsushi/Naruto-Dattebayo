import { it } from 'vitest';
import assert from 'node:assert/strict';
import { CameraController, type FrameScheduler } from '../src/cv/camera';
import { advanceSign, type HoldState } from '../src/cv/core';
import {
  CLASSIFIER_URL,
  HAND_MODEL_URL,
  ORT_MODULE_URL,
  ORT_WASM_URL,
  VISION_MODULE_URL,
  WASM_URL,
  loadLocalModels,
} from '../src/cv/models';

const hand = () => Array.from({ length: 21 }, (_, i) => ({ x: i === 9 ? 2 : i, y: i === 9 ? 2 : i }));

class FakeTrack {
  stopped = 0;
  private listener: (() => void) | null = null;
  stop() { this.stopped += 1; }
  addEventListener(_name: string, listener: () => void) { this.listener = listener; }
  removeEventListener(_name: string, listener: () => void) { if (this.listener === listener) this.listener = null; }
  end() { this.listener?.(); }
}

class FakeStream {
  readonly track: FakeTrack;
  constructor(track = new FakeTrack()) { this.track = track; }
  getTracks() { return [this.track]; }
  getVideoTracks() { return [this.track]; }
}

class FakeVideo {
  srcObject: unknown = null;
  muted = false;
  readyState = 2;
  currentTime = 0;
  playCalls = 0;
  pauseCalls = 0;
  async play() { this.playCalls += 1; }
  pause() { this.pauseCalls += 1; }
}

class FakeRaf implements FrameScheduler {
  private next = 1;
  private callbacks = new Map<number, (time: number) => void>();
  request(callback: (time: number) => void) { const id = this.next++; this.callbacks.set(id, callback); return id; }
  cancel(handle: number) { this.callbacks.delete(handle); }
  step(time: number) {
    const next = [...this.callbacks.entries()][0];
    if (!next) return;
    this.callbacks.delete(next[0]);
    next[1](time);
  }
  get pending() { return this.callbacks.size; }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function runtime(run: Promise<Record<string, { data: Float32Array }>> | null = null, generation = 1) {
  const detector = {
    closeCalls: 0,
    close() { this.closeCalls += 1; },
    detectForVideo() { return { landmarks: [hand()], handednesses: [[{ categoryName: 'Left' }]] }; },
  };
  const session = {
    inputNames: ['input'], outputNames: ['output'], releaseCalls: 0, disposeCalls: 0,
    release() { this.releaseCalls += 1; },
    dispose() { this.disposeCalls += 1; },
    run: async () => run ?? { output: { data: Float32Array.from([0.1, 0.9]) } },
  };
  const tensors: unknown[] = [];
  const ort = { Tensor: class { constructor(type: string, data: Float32Array, dims: [1, 84]) { tensors.push({ type, data, dims }); } } } as any;
  return { detector, session, ort, generation, tensors };
}

function response(ok = true, status = 200) {
  return { ok, status, async arrayBuffer() { return new ArrayBuffer(8); } };
}

it('loadLocalModels uses exact pinned URLs/options and GPU to CPU fallback', async () => {
  const moduleUrls: string[] = [];
  const detectorOptions: unknown[] = [];
  const detector = { close() {} };
  const session = { release() {}, inputNames: ['input'], outputNames: ['output'], async run() { return {}; } };
  const ort = {
    env: { wasm: { wasmPaths: '', numThreads: 0 } },
    InferenceSession: { async create(_buffer: ArrayBuffer, options: unknown) { assert.deepEqual(options, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); return session; } },
    Tensor: class {},
  } as any;
  const vision = {
    FilesetResolver: { async forVisionTasks(url: string) { assert.equal(url, WASM_URL); return {}; } },
    HandLandmarker: { async createFromOptions(_fileset: unknown, options: unknown) { detectorOptions.push(options); if (detectorOptions.length === 1) throw new Error('GPU unavailable'); return detector; } },
  } as any;
  const loaded = await loadLocalModels(7, () => true, {
    loadModule: async (url) => { moduleUrls.push(url); return url === VISION_MODULE_URL ? vision : ort; },
    fetchModel: async (url) => { assert.equal(url, CLASSIFIER_URL); return response(); },
  });
  assert.deepEqual(moduleUrls, [VISION_MODULE_URL, ORT_MODULE_URL]);
  assert.deepEqual(detectorOptions, [
    { baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2 },
    { baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2 },
  ]);
  assert.equal(ort.env.wasm.wasmPaths, ORT_WASM_URL);
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.equal(loaded.generation, 7);
});

it('model load failure disposes a detector created before classifier failure', async () => {
  let closed = 0;
  const vision = {
    FilesetResolver: { async forVisionTasks() { return {}; } },
    HandLandmarker: { async createFromOptions() { return { close() { closed += 1; } }; } },
  } as any;
  const ort = { env: { wasm: { wasmPaths: '', numThreads: 0 } }, InferenceSession: { create: async () => { throw new Error('unused'); } }, Tensor: class {} } as any;
  await assert.rejects(loadLocalModels(1, () => true, {
    loadModule: async (url) => url === VISION_MODULE_URL ? vision : ort,
    fetchModel: async () => response(false, 503),
  }), /Classifier unavailable \(503\)/);
  assert.equal(closed, 1);
});

it('session creation failure also disposes the detector', async () => {
  let closed = 0;
  const vision = {
    FilesetResolver: { async forVisionTasks() { return {}; } },
    HandLandmarker: { async createFromOptions() { return { close() { closed += 1; } }; } },
  } as any;
  const ort = {
    env: { wasm: { wasmPaths: '', numThreads: 0 } },
    InferenceSession: { async create() { throw new Error('session failed'); } },
    Tensor: class {},
  } as any;
  await assert.rejects(loadLocalModels(1, () => true, {
    loadModule: async (url) => url === VISION_MODULE_URL ? vision : ort,
    fetchModel: async () => response(),
  }), /session failed/);
  assert.equal(closed, 1);
});

it('stale model generation disposes a session that resolves too late', async () => {
  let current = true;
  let closed = 0;
  let released = 0;
  const sessionCreated = deferred<any>();
  const sessionStarted = deferred<void>();
  const vision = {
    FilesetResolver: { async forVisionTasks() { return {}; } },
    HandLandmarker: { async createFromOptions() { return { close() { closed += 1; } }; } },
  } as any;
  const ort = {
    env: { wasm: { wasmPaths: '', numThreads: 0 } },
    InferenceSession: { async create() { sessionStarted.resolve(); return sessionCreated.promise; } },
    Tensor: class {},
  } as any;
  const loaded = loadLocalModels(1, () => current, {
    loadModule: async (url) => url === VISION_MODULE_URL ? vision : ort,
    fetchModel: async () => response(),
  });
  await sessionStarted.promise;
  current = false;
  sessionCreated.resolve({ release() { released += 1; }, inputNames: ['input'], outputNames: ['output'], async run() { return {}; } });
  await assert.rejects(loaded, /Stale model generation/);
  assert.equal(closed, 1);
  assert.equal(released, 1);
});

it('late camera acquisition is stopped and never dispatches after stop', async () => {
  const video = new FakeVideo();
  const raf = new FakeRaf();
  const acquisition = deferred<FakeStream>();
  const model = runtime(null, 3);
  const statuses: string[] = [];
  const predictions: unknown[] = [];
  const controller = new CameraController(video as unknown as HTMLVideoElement, {
    getRoundGeneration: () => 3,
    loadModels: async () => model,
    devices: { getUserMedia: async () => acquisition.promise as unknown as MediaStream },
    raf,
    onStatus: (status) => statuses.push(status),
    onPrediction: (...prediction) => predictions.push(prediction), now: () => 123,
  });
  const start = controller.start(3);
  await Promise.resolve();
  controller.stop();
  const stream = new FakeStream();
  acquisition.resolve(stream);
  await start;
  assert.equal(stream.track.stopped, 1);
  assert.equal(model.detector.closeCalls, 1);
  assert.equal(model.session.releaseCalls, 1);
  assert.equal(predictions.length, 0);
  assert.equal(video.srcObject, null);
  assert.equal(statuses.at(-1), 'Camera paused');
});

it('late inference is ignored and its runtime is released after stop', async () => {
  const video = new FakeVideo();
  const raf = new FakeRaf();
  const inference = deferred<Record<string, { data: Float32Array }>>();
  const model = runtime(inference.promise, 4);
  const stream = new FakeStream();
  const predictions: unknown[] = [];
  const controller = new CameraController(video as unknown as HTMLVideoElement, {
    getRoundGeneration: () => 4,
    loadModels: async () => model,
    devices: { getUserMedia: async () => stream as unknown as MediaStream },
    raf,
    onPrediction: (...prediction) => predictions.push(prediction), now: () => 222,
  });
  await controller.start(4);
  video.currentTime = 1;
  raf.step(100);
  controller.stop();
  inference.resolve({ output: { data: Float32Array.from([0.1, 0.9]) } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(predictions.length, 0);
  assert.equal(model.session.releaseCalls, 1);
  assert.equal(stream.track.stopped, 1);
});

it('a frame builds float32[1,84], preserves handedness metadata, and dispatches prediction', async () => {
  const video = new FakeVideo();
  const raf = new FakeRaf();
  const model = runtime(null, 7);
  const left = hand().map((point) => ({ x: point.x + 10, y: point.y }));
  const right = hand().map((point) => ({ x: point.x + 30, y: point.y }));
  model.detector.detectForVideo = () => ({
    landmarks: [right, left],
    handednesses: [[{ categoryName: 'Right' }], [{ categoryName: 'Left' }]],
  });
  const predictions: unknown[][] = [];
  const controller = new CameraController(video as unknown as HTMLVideoElement, {
    getRoundGeneration: () => 7,
    loadModels: async () => model,
    devices: { getUserMedia: async () => new FakeStream() as unknown as MediaStream },
    raf,
    onPrediction: (...prediction) => predictions.push(prediction), now: () => 123,
  });
  await controller.start(7);
  video.currentTime = 1;
  raf.step(123);
  await Promise.resolve();
  await Promise.resolve();
  const tensor = model.tensors[0] as { type: string; data: Float32Array; dims: [number, number] };
  assert.equal(tensor.type, 'float32');
  assert.deepEqual(tensor.dims, [1, 84]);
  assert.equal(tensor.data.length, 84);
  assert.equal(predictions[0][0], 'ox');
  assert.ok(Math.abs(Number(predictions[0][1]) - 0.9) < 1e-6);
  assert.deepEqual(predictions[0].slice(2), [123, 7]);
  controller.stop();
});

it('no valid landmarks emits null and never invokes the classifier', async () => {
  const video = new FakeVideo();
  const raf = new FakeRaf();
  const model = runtime(null, 8);
  let runs = 0;
  model.session.run = async () => { runs += 1; return { output: { data: Float32Array.from([0.1, 0.9]) } }; };
  model.detector.detectForVideo = () => ({ landmarks: [[]] }) as any;
  const predictions: unknown[][] = [];
  const controller = new CameraController(video as unknown as HTMLVideoElement, {
    getRoundGeneration: () => 8,
    loadModels: async () => model,
    devices: { getUserMedia: async () => new FakeStream() as unknown as MediaStream },
    raf,
    onPrediction: (...prediction) => predictions.push(prediction), now: () => 222,
  });
  await controller.start(8);
  video.currentTime = 1;
  raf.step(222);
  assert.equal(runs, 0);
  assert.deepEqual(predictions[0], [null, 0, 222, 8]);
  controller.stop();
});

it('retry releases the old stream/runtime before starting a fresh attempt', async () => {
  const video = new FakeVideo();
  const raf = new FakeRaf();
  const first = runtime(null, 5);
  const second = runtime(null, 5);
  const streams = [new FakeStream(), new FakeStream()];
  let modelIndex = 0;
  let streamIndex = 0;
  const controller = new CameraController(video as unknown as HTMLVideoElement, {
    getRoundGeneration: () => 5,
    loadModels: async () => modelIndex++ === 0 ? first : second,
    devices: { getUserMedia: async () => streams[streamIndex++] as unknown as MediaStream },
    raf,
  });
  await controller.start(5);
  await controller.retry(5);
  assert.equal(first.detector.closeCalls, 1);
  assert.equal(first.session.releaseCalls, 1);
  assert.equal(streams[0].track.stopped, 1);
  assert.equal(controller.active, true);
  assert.equal(video.srcObject, streams[1]);
  controller.stop();
  assert.equal(second.detector.closeCalls, 1);
  assert.equal(second.session.releaseCalls, 1);
  assert.equal(streams[1].track.stopped, 1);
});

it('ended video track reports failure and stops the active attempt', async () => {
  const video = new FakeVideo();
  const model = runtime(null, 6);
  const stream = new FakeStream();
  const statuses: string[] = [];
  const controller = new CameraController(video as unknown as HTMLVideoElement, {
    getRoundGeneration: () => 6,
    loadModels: async () => model,
    devices: { getUserMedia: async () => stream as unknown as MediaStream },
    onStatus: (status) => statuses.push(status),
  });
  await controller.start(6);
  stream.track.end();
  assert.equal(controller.active, false);
  assert.equal(stream.track.stopped, 1);
  assert.equal(model.detector.closeCalls, 1);
  assert.equal(model.session.releaseCalls, 1);
  assert.equal(video.srcObject, null);
  assert.equal(statuses.at(-1), 'Camera ended • Retry or Cancel');
});

it('timestamps inference at completion and rejects a result older than the 500ms stall limit', async () => {
  const video = new FakeVideo(); const raf = new FakeRaf(); const inference = deferred<Record<string, { data: Float32Array }>>();
  const model = runtime(inference.promise, 12); let clock = 1000; const predictions: Array<[string | null, number]> = [];
  const controller = new CameraController(video as unknown as HTMLVideoElement, {
    getRoundGeneration: () => 12, loadModels: async () => model,
    devices: { getUserMedia: async () => new FakeStream() as unknown as MediaStream }, raf, now: () => clock,
    onPrediction: (label, _confidence, time) => predictions.push([label, time]),
  });
  await controller.start(12); video.currentTime = 1; raf.step(1000);
  clock = 1601; inference.resolve({ output: { data: Float32Array.from([0.1, 0.9]) } }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(predictions.at(-1), [null, 1601]);
  let hold: HoldState = { label: null, startedAt: null, progress: 0, completed: false }; let lastAt: number | null = null;
  const apply = (label: 'ox' | null, time: number) => { const next = advanceSign(hold, lastAt, { label, score: label ? 0.9 : 0, now: time, target: 'ox' }); hold = next.hold; lastAt = next.lastAt; };
  apply(null, 1601); assert.equal(hold.startedAt, null);
  video.currentTime = 2; clock = 2000; raf.step(2000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  video.currentTime = 3; clock = 2450; raf.step(2450); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  for (const [label, time] of predictions.slice(1)) apply(label === 'ox' ? 'ox' : null, time);
  assert.equal(hold.completed, true);
  controller.stop();
});
