export const VISION_VERSION = '0.10.34';
export const ORT_VERSION = '1.17.3';
export const VISION_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/+esm`;
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
export const ORT_MODULE_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/+esm`;
export const ORT_WASM_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
export const CLASSIFIER_URL = 'https://raw.githubusercontent.com/bunkerapps/Jutsu-Hero/10c5a914f9f14b4427d988d253048bf0fae8eb52/public/assets/seal_classifier.onnx';

export interface VisionModule {
  FilesetResolver: { forVisionTasks(url: string): Promise<unknown> };
  HandLandmarker: { createFromOptions(fileset: unknown, options: HandLandmarkerOptions): Promise<HandDetector> };
}

export interface HandLandmarkerOptions {
  baseOptions: { modelAssetPath: string; delegate: 'GPU' | 'CPU' };
  runningMode: 'VIDEO';
  numHands: 2;
}

export interface HandDetector {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): RawDetectionResult;
  close?: () => void;
}

export interface RawDetectionResult {
  landmarks?: Array<Array<{ x: number; y: number }>>;
  handednesses?: Array<Array<{ categoryName?: string }>>;
}

export interface OrtTensor {
  data?: ArrayLike<number>;
}

export interface OrtSession {
  inputNames?: string[];
  outputNames?: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
  release?: () => void | Promise<void>;
  dispose?: () => void;
}

export interface OrtModule {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: 'float32', data: Float32Array, dims: [1, 84]) => unknown;
  InferenceSession: {
    create(model: ArrayBuffer, options: { executionProviders: ['wasm']; graphOptimizationLevel: 'all' }): Promise<OrtSession>;
  };
}

export interface ModelRuntime {
  detector: HandDetector;
  session: OrtSession;
  ort: OrtModule;
  generation: number;
}

export type DynamicLoader = (url: string) => Promise<Record<string, any>>;
export type ModelFreshness = () => boolean;
export interface ModelLoaderOptions {
  loadModule?: DynamicLoader;
  fetchModel?: (input: string) => Promise<ModelResponse>;
}

export interface ModelResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const staleGeneration = () => new Error('Stale model generation');

function disposeDetector(detector: HandDetector | null): void {
  try { detector?.close?.(); } catch { /* disposal is best effort */ }
}

function disposeSession(session: OrtSession | null): void {
  if (!session) return;
  if (session.release) {
    try {
      // ORT versions expose either synchronous or async release. Attach a
      // rejection handler so stale cleanup can never become an unhandled job.
      void Promise.resolve(session.release()).catch(() => undefined);
      return;
    } catch { /* try the alternate API below */ }
  }
  try { session.dispose?.(); } catch { /* disposal is best effort */ }
}

/**
 * Load the pinned browser-only CV models. The freshness callback belongs to
 * the camera attempt that requested the load; stale attempts are disposed and
 * never return usable runtime objects.
 */
export async function loadLocalModels(
  generation: number,
  isCurrentOrLoader: ModelFreshness | DynamicLoader = () => true,
  optionsOrFreshness: ModelLoaderOptions | ModelFreshness = {},
): Promise<ModelRuntime> {
  // Keep the scaffold's former (generation, loadModule, isCurrent) call shape
  // usable while exposing the clearer options object for new callers.
  const legacyLoader = isCurrentOrLoader.length > 0 ? isCurrentOrLoader as DynamicLoader : undefined;
  const isCurrent: ModelFreshness = typeof optionsOrFreshness === 'function'
    ? optionsOrFreshness
    : legacyLoader ? () => true : isCurrentOrLoader as ModelFreshness;
  const options: ModelLoaderOptions = typeof optionsOrFreshness === 'function'
    ? { loadModule: legacyLoader }
    : legacyLoader ? { ...optionsOrFreshness, loadModule: legacyLoader } : optionsOrFreshness;
  const loadModule = options.loadModule ?? ((url: string) => import(/* @vite-ignore */ url));
  const fetchModel = options.fetchModel ?? ((input: string) => fetch(input));
  let detector: HandDetector | null = null;
  let session: OrtSession | null = null;

  const checkCurrent = () => {
    if (!isCurrent()) throw staleGeneration();
  };

  try {
    const vision = await loadModule(VISION_MODULE_URL) as unknown as VisionModule;
    checkCurrent();
    const ort = await loadModule(ORT_MODULE_URL) as unknown as OrtModule;
    checkCurrent();

    ort.env.wasm.wasmPaths = ORT_WASM_URL;
    ort.env.wasm.numThreads = 1;
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    checkCurrent();

    const gpuOptions: HandLandmarkerOptions = {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    };
    try {
      detector = await vision.HandLandmarker.createFromOptions(fileset, gpuOptions);
    } catch {
      checkCurrent();
      const cpuOptions: HandLandmarkerOptions = {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      };
      detector = await vision.HandLandmarker.createFromOptions(fileset, cpuOptions);
    }
    checkCurrent();

    const response = await fetchModel(CLASSIFIER_URL);
    checkCurrent();
    if (!response.ok) throw new Error(`Classifier unavailable (${response.status})`);
    const modelBuffer = await response.arrayBuffer();
    checkCurrent();
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    checkCurrent();
    return { detector, session, ort, generation };
  } catch (error) {
    disposeDetector(detector);
    disposeSession(session);
    throw error;
  }
}

export function disposeModelRuntime(runtime: Partial<ModelRuntime> | null | undefined): void {
  disposeDetector(runtime?.detector ?? null);
  disposeSession(runtime?.session ?? null);
}
