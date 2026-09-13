export type Cue = 'select' | 'reveal' | 'cast' | 'hit' | 'victory' | 'defeat' | 'secret';

export interface AudioParamLike {
  value: number;
  setValueAtTime?: (value: number, at: number) => void;
  linearRampToValueAtTime?: (value: number, at: number) => void;
  exponentialRampToValueAtTime?: (value: number, at: number) => void;
  cancelScheduledValues?: (at: number) => void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect?: () => void;
}

export interface AudioSourceLike extends AudioNodeLike {
  start: (at?: number) => void;
  stop: (at?: number) => void;
  addEventListener?: (type: 'ended', listener: () => void, options?: { once?: boolean }) => void;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioContextLike {
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: AudioNodeLike;
  resume: () => Promise<void> | void;
  createOscillator: () => AudioSourceLike & { type: string; frequency: AudioParamLike };
  createGain: () => AudioNodeLike & { gain: AudioParamLike };
  createBiquadFilter: () => AudioNodeLike & { type: string; frequency: AudioParamLike };
  createBuffer: (channels: number, length: number, sampleRate: number) => AudioBufferLike;
  createBufferSource: () => AudioSourceLike & { buffer: AudioBufferLike | null; loop: boolean };
}

export type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export interface TimerDriver {
  setTimeout(callback: () => void, delay: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface SynthAudioOptions {
  /** Supply a fake context in tests; production defaults to window.AudioContext. */
  contextFactory?: () => AudioContextLike;
  /** Optional round-generation reader used to discard stale async callbacks. */
  getGeneration?: () => number;
  /** Supply deterministic timers in tests; production uses globalThis timers. */
  timers?: TimerDriver;
}

const defaultTimers: TimerDriver = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

const generationReadFailed = Symbol('generation-read-failed');
type GenerationToken = number | undefined | typeof generationReadFailed;

interface Tone {
  frequency: number;
  delay: number;
  duration: number;
  gain: number;
  type: string;
}

const cueTones: Record<Cue, Tone[]> = {
  select: [{ frequency: 660, delay: 0, duration: 0.09, gain: 0.035, type: 'triangle' }],
  reveal: [
    { frequency: 294, delay: 0, duration: 0.14, gain: 0.045, type: 'triangle' },
    { frequency: 440, delay: 0.07, duration: 0.16, gain: 0.05, type: 'triangle' },
    { frequency: 659, delay: 0.14, duration: 0.2, gain: 0.055, type: 'square' },
  ],
  cast: [
    { frequency: 196, delay: 0, duration: 0.2, gain: 0.04, type: 'sawtooth' },
    { frequency: 293, delay: 0.06, duration: 0.22, gain: 0.045, type: 'triangle' },
    { frequency: 587, delay: 0.12, duration: 0.28, gain: 0.055, type: 'square' },
  ],
  hit: [
    { frequency: 118, delay: 0, duration: 0.16, gain: 0.075, type: 'sawtooth' },
    { frequency: 82, delay: 0.035, duration: 0.2, gain: 0.06, type: 'square' },
  ],
  victory: [
    { frequency: 523, delay: 0, duration: 0.18, gain: 0.045, type: 'triangle' },
    { frequency: 659, delay: 0.1, duration: 0.18, gain: 0.05, type: 'triangle' },
    { frequency: 784, delay: 0.2, duration: 0.24, gain: 0.055, type: 'triangle' },
    { frequency: 1047, delay: 0.3, duration: 0.34, gain: 0.06, type: 'sine' },
  ],
  defeat: [
    { frequency: 262, delay: 0, duration: 0.22, gain: 0.05, type: 'triangle' },
    { frequency: 196, delay: 0.13, duration: 0.26, gain: 0.05, type: 'triangle' },
    { frequency: 131, delay: 0.28, duration: 0.34, gain: 0.055, type: 'sawtooth' },
  ],
  secret: [
    { frequency: 98, delay: 0, duration: 0.22, gain: 0.055, type: 'sawtooth' },
    { frequency: 147, delay: 0.09, duration: 0.25, gain: 0.055, type: 'sawtooth' },
    { frequency: 220, delay: 0.18, duration: 0.3, gain: 0.06, type: 'triangle' },
    { frequency: 330, delay: 0.28, duration: 0.42, gain: 0.065, type: 'square' },
  ],
};

function browserContext(): AudioContextLike {
  const browser = typeof window === 'undefined' ? undefined : window;
  const webkitWindow = browser as (Window & { webkitAudioContext?: new () => AudioContextLike }) | undefined;
  const Constructor = browser?.AudioContext ?? webkitWindow?.webkitAudioContext;
  if (!Constructor) throw new Error('Web Audio is unavailable');
  return new Constructor() as unknown as AudioContextLike;
}

function setParam(param: AudioParamLike, value: number, at: number): void {
  if (param.setValueAtTime) param.setValueAtTime(value, at);
  else param.value = value;
}

function rampParam(param: AudioParamLike, value: number, at: number): void {
  if (param.exponentialRampToValueAtTime) param.exponentialRampToValueAtTime(Math.max(value, 0.0001), at);
  else if (param.linearRampToValueAtTime) param.linearRampToValueAtTime(value, at);
  else param.value = value;
}

/** Small optional Web Audio synth. It never makes a battle action fail. */
export class SynthAudio {
  private context: AudioContextLike | null = null;
  private readonly sources = new Set<AudioSourceLike>();
  private readonly timers: TimerDriver;
  private readonly contextFactory: () => AudioContextLike;
  private readonly getGeneration?: () => number;
  private ambienceSource: AudioSourceLike | null = null;
  private revision = 0;
  private unavailable = false;
  public muted = false;

  constructor(options: SynthAudioOptions = {}) {
    this.contextFactory = options.contextFactory ?? browserContext;
    this.getGeneration = options.getGeneration;
    this.timers = options.timers ?? defaultTimers;
  }

  unlock(): void {
    if (this.muted || this.unavailable) return;
    let context: AudioContextLike;
    try {
      context = this.context ?? (this.context = this.contextFactory());
    } catch {
      this.unavailable = true;
      return;
    }

    const revision = this.revision;
    const generation = this.readGeneration();
    let state: string;
    try { state = context.state; } catch { return; }
    if (state !== 'suspended') {
      this.startAmbience(context, revision, generation);
      return;
    }
    try {
      Promise.resolve(context.resume()).then(() => {
        if (this.isCurrent(revision, generation) && this.context === context && !this.muted) {
          this.startAmbience(context, revision, generation);
        }
      }).catch(() => undefined);
    } catch { /* A blocked resume leaves the synth optional. */ }
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.muted) this.stop();
    else this.unlock();
    return this.muted;
  }

  cue(cue: Cue): void {
    if (this.muted || !this.context || this.unavailable) return;
    const revision = this.revision;
    const generation = this.readGeneration();
    const tones = cueTones[cue];
    if (!tones) return;
    for (const tone of tones) {
      if (tone.delay === 0) this.playTone(tone, revision, generation);
      else this.schedule(() => this.playTone(tone, revision, generation), tone.delay * 1000, revision, generation);
    }
  }

  stop(): void {
    this.revision += 1;
    for (const handle of this.timersForClear()) {
      try { this.timers.clearTimeout(handle); } catch { /* optional timer cleanup */ }
    }
    this.timerHandles.clear();
    const active = [...this.sources];
    this.sources.clear();
    this.ambienceSource = null;
    for (const source of active) {
      try { source.stop(); } catch { /* already ended */ }
      try { source.disconnect?.(); } catch { /* optional cleanup */ }
    }
  }

  private readonly timerHandles = new Set<TimerHandle>();

  private timersForClear(): TimerHandle[] { return [...this.timerHandles]; }

  private schedule(callback: () => void, delay: number, revision: number, generation: GenerationToken): void {
    let handle: TimerHandle;
    try {
      handle = this.timers.setTimeout(() => {
        this.timerHandles.delete(handle);
        if (this.isCurrent(revision, generation)) callback();
      }, delay);
      this.timerHandles.add(handle);
    } catch { /* A timer failure should not affect combat. */ }
  }

  private readGeneration(): GenerationToken {
    if (!this.getGeneration) return undefined;
    try { return this.getGeneration(); } catch { return generationReadFailed; }
  }

  private isCurrent(revision: number, generation: GenerationToken): boolean {
    if (revision !== this.revision || generation === generationReadFailed || this.muted) return false;
    if (!this.getGeneration) return true;
    try { return this.getGeneration() === generation; } catch { return false; }
  }

  private startAmbience(context: AudioContextLike, revision: number, generation: GenerationToken): void {
    if (this.ambienceSource || !this.isCurrent(revision, generation)) return;
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * 2));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 0x51a7;
      for (let index = 0; index < data.length; index += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = (seed / 0x100000000) * 2 - 1;
        const swell = Math.sin((index / context.sampleRate) * Math.PI * 2 * 0.42) * 0.35;
        const edge = Math.min(1, index / (context.sampleRate * 0.08), (data.length - index - 1) / (context.sampleRate * 0.08));
        data[index] = (noise * 0.055 + swell * 0.018) * Math.max(0, edge);
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = 'lowpass';
      setParam(filter.frequency, 900, context.currentTime);
      setParam(gain.gain, 0.22, context.currentTime);
      source.connect(filter).connect(gain).connect(context.destination);
      this.track(source, revision, generation);
      this.ambienceSource = source;
      try {
        source.start(context.currentTime);
      } catch {
        this.sources.delete(source);
        this.ambienceSource = null;
        try { source.stop(); } catch { /* not started */ }
        try { source.disconnect?.(); } catch { /* optional cleanup */ }
      }
    } catch { /* Procedural ambience is optional. */ }
  }

  private playTone(tone: Tone, revision: number, generation: GenerationToken): void {
    if (!this.context || !this.isCurrent(revision, generation)) return;
    const context = this.context;
    let source: AudioSourceLike | null = null;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      source = oscillator;
      const now = context.currentTime;
      oscillator.type = tone.type;
      setParam(oscillator.frequency, tone.frequency, now);
      setParam(gain.gain, 0.0001, now);
      rampParam(gain.gain, tone.gain, now + 0.012);
      rampParam(gain.gain, 0.0001, now + tone.duration);
      oscillator.connect(gain).connect(context.destination);
      this.track(oscillator, revision, generation);
      oscillator.start(now);
      oscillator.stop(now + tone.duration + 0.01);
    } catch {
      if (source) {
        this.sources.delete(source);
        try { source.stop(); } catch { /* not started */ }
        try { source.disconnect?.(); } catch { /* optional cleanup */ }
      }
    }
  }

  private track(source: AudioSourceLike, revision: number, generation: GenerationToken): void {
    this.sources.add(source);
    try {
      source.addEventListener?.('ended', () => {
        this.sources.delete(source);
        if (this.ambienceSource === source) this.ambienceSource = null;
        if (!this.isCurrent(revision, generation)) return;
        try { source.disconnect?.(); } catch { /* optional cleanup */ }
      }, { once: true });
    } catch { /* Ended events are a cleanup optimization only. */ }
  }
}
