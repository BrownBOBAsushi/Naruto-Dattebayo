import { buildTensor, classifyScores, type DetectedHand, type SignLabel } from './core';
import {
  disposeModelRuntime,
  loadLocalModels,
  type ModelRuntime,
  type OrtTensor,
  type RawDetectionResult,
} from './models';

export interface CameraDevice {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export interface CameraHooks {
  onStatus?: (status: string) => void;
  onPrediction?: (label: SignLabel | null, confidence: number, time: number, generation: number) => void;
}

export interface FrameScheduler {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

export type ModelLoader = (generation: number, isCurrent: () => boolean) => Promise<ModelRuntime>;

export interface CameraControllerOptions extends CameraHooks {
  devices?: CameraDevice;
  getRoundGeneration: () => number;
  loadModels?: ModelLoader;
  raf?: FrameScheduler;
  now?: () => number;
}

interface CameraTrack {
  stop?: () => void;
  addEventListener?: (name: string, listener: () => void) => void;
  removeEventListener?: (name: string, listener: () => void) => void;
}

interface CameraStream {
  getTracks?: () => CameraTrack[];
  getVideoTracks?: () => CameraTrack[];
}

interface CameraAttempt {
  epoch: number;
  generation: number;
  stream: CameraStream | null;
  runtime: ModelRuntime | null;
  runtimeDisposed: boolean;
  frameHandle: number | null;
  inFlight: boolean;
  lastVideoTime: number;
  cancelled: boolean;
  track: CameraTrack | null;
  trackEnded: (() => void) | null;
  videoFailure: (() => void) | null;
}

interface VideoElement {
  srcObject: unknown;
  muted: boolean;
  readyState: number;
  currentTime: number;
  play(): Promise<unknown>;
  pause(): void;
  addEventListener?: (name: string, listener: () => void) => void;
  removeEventListener?: (name: string, listener: () => void) => void;
}

function browserScheduler(): FrameScheduler {
  const root = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: (time: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  if (root.requestAnimationFrame && root.cancelAnimationFrame) {
    return {
      request: (callback) => root.requestAnimationFrame!(callback),
      cancel: (handle) => root.cancelAnimationFrame!(handle),
    };
  }
  let nextHandle = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  return {
    request: (callback) => {
      const handle = nextHandle++;
      timers.set(handle, setTimeout(() => {
        timers.delete(handle);
        callback(typeof performance === 'undefined' ? Date.now() : performance.now());
      }, 16));
      return handle;
    },
    cancel: (handle) => {
      const timer = timers.get(handle);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(handle);
    },
  };
}

function streamTracks(stream: CameraStream | null): CameraTrack[] {
  return stream?.getTracks?.() ?? [];
}

function stopStream(stream: CameraStream | null): void {
  for (const track of streamTracks(stream)) {
    try { track.stop?.(); } catch { /* track cleanup must not mask the original failure */ }
  }
}

function resultHands(result: RawDetectionResult | null | undefined): DetectedHand[] {
  const landmarks = result?.landmarks ?? [];
  return landmarks.filter((points) => points.length >= 21).map((points, index) => ({
    landmarks: points,
    // MediaPipe returns handednesses in the same index order as landmarks.
    // core.buildTensor then keeps left primary and right secondary.
    handedness: result?.handednesses?.[index]?.[0]?.categoryName ?? '',
  }));
}

/**
 * Owns one camera/model attempt at a time. The round reducer owns generation;
 * this class only captures it on async work and drops stale work safely.
 */
export class CameraController {
  private readonly video: VideoElement;
  private readonly devices: CameraDevice;
  private readonly getRoundGeneration: () => number;
  private readonly modelLoader: ModelLoader;
  private readonly hooks: CameraHooks;
  private readonly raf: FrameScheduler;
  private readonly now: () => number;
  private epoch = 0;
  private activeAttempt: CameraAttempt | null = null;

  constructor(video: HTMLVideoElement, options: CameraControllerOptions) {
    this.video = video;
    this.devices = options.devices ?? ((globalThis as typeof globalThis & { navigator?: Navigator }).navigator?.mediaDevices as unknown as CameraDevice);
    this.getRoundGeneration = options.getRoundGeneration;
    this.modelLoader = options.loadModels ?? ((generation, isCurrent) => loadLocalModels(generation, isCurrent));
    this.hooks = options;
    this.raf = options.raf ?? browserScheduler();
    this.now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
  }

  get active(): boolean {
    return this.activeAttempt?.stream !== null && this.activeAttempt?.stream !== undefined;
  }

  /** Start a camera/model attempt for the reducer generation supplied by main. */
  async start(generation: number): Promise<void> {
    this.invalidateCurrent();
    const attempt: CameraAttempt = {
      epoch: ++this.epoch,
      generation,
      stream: null,
      runtime: null,
      runtimeDisposed: false,
      frameHandle: null,
      inFlight: false,
      lastVideoTime: -1,
      cancelled: false,
      track: null,
      trackEnded: null,
      videoFailure: null,
    };
    this.activeAttempt = attempt;
    this.hooks.onStatus?.('Loading recognition…');
    let acquisitionStarted = false;
    try {
      const runtime = await this.modelLoader(generation, () => this.isCurrentAttempt(attempt));
      if (!this.isCurrentAttempt(attempt) || runtime.generation !== generation) {
        disposeModelRuntime(runtime);
        return;
      }
      attempt.runtime = runtime;
      acquisitionStarted = true;
      this.hooks.onStatus?.('Requesting camera…');
      const stream = await this.devices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!this.isCurrentAttempt(attempt)) {
        stopStream(stream as unknown as CameraStream);
        this.disposeAttempt(attempt);
        return;
      }
      attempt.stream = stream as unknown as CameraStream;
      this.video.srcObject = stream;
      this.video.muted = true;
      await this.video.play();
      if (!this.isCurrentAttempt(attempt)) {
        this.disposeAttempt(attempt);
        return;
      }
      this.attachEndedHandler(attempt);
      this.attachVideoFailureHandler(attempt);
      this.hooks.onStatus?.('Camera live • signs stay on this device');
      this.schedule(attempt);
    } catch {
      if (!this.isCurrentAttempt(attempt)) {
        this.disposeAttempt(attempt);
        return;
      }
      this.failAttempt(attempt, acquisitionStarted ? 'Camera unavailable • Retry or Cancel' : 'Recognition unavailable • Retry or Cancel');
    }
  }

  /** Stop all attempt resources and invalidate pending async work. */
  stop(status = 'Camera paused'): void {
    this.epoch += 1;
    const attempt = this.activeAttempt;
    if (attempt) this.disposeAttempt(attempt);
    this.activeAttempt = null;
    this.hooks.onStatus?.(status);
  }

  async retry(generation: number): Promise<void> {
    this.stop('Retrying camera…');
    await this.start(generation);
  }

  isCurrent(generation: number): boolean {
    const attempt = this.activeAttempt;
    return !!attempt && attempt.generation === generation && this.getRoundGeneration() === generation && !attempt.cancelled;
  }

  private isCurrentAttempt(attempt: CameraAttempt): boolean {
    return this.activeAttempt === attempt
      && !attempt.cancelled
      && attempt.epoch === this.epoch
      && this.getRoundGeneration() === attempt.generation;
  }

  private invalidateCurrent(): void {
    this.epoch += 1;
    if (this.activeAttempt) this.disposeAttempt(this.activeAttempt);
    this.activeAttempt = null;
  }

  private attachEndedHandler(attempt: CameraAttempt): void {
    const track = attempt.stream?.getVideoTracks?.()[0] ?? streamTracks(attempt.stream)[0] ?? null;
    if (!track?.addEventListener) return;
    const ended = () => {
      if (this.isCurrentAttempt(attempt)) this.failAttempt(attempt, 'Camera ended • Retry or Cancel');
    };
    attempt.track = track;
    attempt.trackEnded = ended;
    track.addEventListener('ended', ended);
  }

  private attachVideoFailureHandler(attempt: CameraAttempt): void {
    if (!this.video.addEventListener) return;
    const failed = () => {
      if (this.isCurrentAttempt(attempt)) this.failAttempt(attempt, 'Camera feed failed • Retry or Cancel');
    };
    attempt.videoFailure = failed;
    this.video.addEventListener('error', failed);
    this.video.addEventListener('stalled', failed);
  }

  private disposeAttempt(attempt: CameraAttempt): void {
    attempt.cancelled = true;
    if (attempt.frameHandle !== null) {
      this.raf.cancel(attempt.frameHandle);
      attempt.frameHandle = null;
    }
    if (attempt.track && attempt.trackEnded) {
      try { attempt.track.removeEventListener?.('ended', attempt.trackEnded); } catch { /* best effort */ }
    }
    attempt.track = null;
    attempt.trackEnded = null;
    if (attempt.videoFailure) {
      try {
        this.video.removeEventListener?.('error', attempt.videoFailure);
        this.video.removeEventListener?.('stalled', attempt.videoFailure);
      } catch { /* best effort */ }
    }
    attempt.videoFailure = null;
    const stream = attempt.stream;
    attempt.stream = null;
    if (stream) {
      stopStream(stream);
      if (this.video.srcObject === stream) {
        try { this.video.pause(); } catch { /* best effort */ }
        this.video.srcObject = null;
      }
    }
    if (!attempt.runtimeDisposed) {
      attempt.runtimeDisposed = true;
      disposeModelRuntime(attempt.runtime);
      attempt.runtime = null;
    }
  }

  private failAttempt(attempt: CameraAttempt, status: string): void {
    if (!this.isCurrentAttempt(attempt)) {
      this.disposeAttempt(attempt);
      return;
    }
    this.disposeAttempt(attempt);
    this.activeAttempt = null;
    this.epoch += 1;
    this.hooks.onStatus?.(status);
  }

  private schedule(attempt: CameraAttempt): void {
    if (!this.isCurrentAttempt(attempt) || attempt.frameHandle !== null) return;
    const epoch = attempt.epoch;
    const generation = attempt.generation;
    attempt.frameHandle = this.raf.request((time) => {
      attempt.frameHandle = null;
      this.processFrame(attempt, epoch, generation, time);
    });
  }

  private processFrame(attempt: CameraAttempt, epoch: number, generation: number, frameTime: number): void {
    if (!this.isCurrentAttempt(attempt) || epoch !== attempt.epoch || generation !== attempt.generation) {
      this.disposeAttempt(attempt);
      return;
    }
    if (attempt.inFlight) {
      this.schedule(attempt);
      return;
    }
    if (!attempt.runtime || !attempt.stream || this.video.readyState < 2 || this.video.currentTime === attempt.lastVideoTime) {
      this.schedule(attempt);
      return;
    }
    attempt.lastVideoTime = this.video.currentTime;
    const now = Number.isFinite(frameTime) ? frameTime : this.now();
    let result: RawDetectionResult;
    try {
      result = attempt.runtime.detector.detectForVideo(this.video as unknown as HTMLVideoElement, now);
    } catch {
      this.failAttempt(attempt, 'Recognition stopped • Retry or Cancel');
      return;
    }
    if (!this.isCurrentAttempt(attempt)) {
      this.disposeAttempt(attempt);
      return;
    }
    const hands = resultHands(result);
    if (hands.length === 0) {
      this.dispatchPrediction(null, 0, now, generation);
      this.schedule(attempt);
      return;
    }
    attempt.inFlight = true;
    void this.runInference(attempt, epoch, generation, hands, now);
  }

  private async runInference(
    attempt: CameraAttempt,
    epoch: number,
    generation: number,
    hands: DetectedHand[],
    now: number,
  ): Promise<void> {
    try {
      const runtime = attempt.runtime;
      if (!runtime || !this.isCurrentAttempt(attempt) || epoch !== attempt.epoch) return;
      const values = Float32Array.from(buildTensor(hands));
      if (values.length !== 84) throw new Error('Unexpected classifier tensor shape');
      const inputName = runtime.session.inputNames?.[0];
      const outputName = runtime.session.outputNames?.[0];
      if (!inputName || !outputName) throw new Error('Classifier names unavailable');
      const tensor = new runtime.ort.Tensor('float32', values, [1, 84]);
      const output = await runtime.session.run({ [inputName]: tensor });
      if (!this.isCurrentAttempt(attempt) || epoch !== attempt.epoch || generation !== attempt.generation) {
        this.disposeAttempt(attempt);
        return;
      }
      const scores: OrtTensor | undefined = output[outputName];
      const prediction = classifyScores(scores?.data);
      this.dispatchPrediction(prediction?.label ?? null, prediction?.score ?? 0, now, generation);
    } catch {
      if (this.isCurrentAttempt(attempt) && epoch === attempt.epoch) this.failAttempt(attempt, 'Recognition stopped • Retry or Cancel');
      else this.disposeAttempt(attempt);
    } finally {
      attempt.inFlight = false;
      if (this.isCurrentAttempt(attempt) && epoch === attempt.epoch) this.schedule(attempt);
      else if (!this.isCurrentAttempt(attempt)) this.disposeAttempt(attempt);
    }
  }

  private dispatchPrediction(label: SignLabel | null, confidence: number, time: number, generation: number): void {
    try { this.hooks.onPrediction?.(label, confidence, time, generation); } catch { /* caller errors do not own camera resources */ }
  }
}
