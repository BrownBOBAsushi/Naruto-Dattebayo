import { describe, expect, it, vi } from 'vitest';
import { SynthAudio, type AudioContextLike, type AudioNodeLike, type AudioSourceLike, type TimerDriver, type TimerHandle } from '../src/audio';

function contextHarness(state = 'running') {
  const sources: AudioSourceLike[] = [];
  const ended = new Map<AudioSourceLike, () => void>();
  const context: AudioContextLike = {
    currentTime: 10,
    sampleRate: 100,
    state,
    destination: { connect: vi.fn(function (this: AudioNodeLike) { return this; }) },
    resume: vi.fn(async () => { context.state = 'running'; }),
    createOscillator: () => {
      const source = sourceHarness();
      sources.push(source);
      return Object.assign(source, { type: 'sine', frequency: paramHarness() });
    },
    createGain: () => ({ connect: vi.fn(function (this: unknown) { return this as AudioNodeLike; }), gain: paramHarness() }) as any,
    createBiquadFilter: () => ({ connect: vi.fn(function (this: unknown) { return this as AudioNodeLike; }), type: 'lowpass', frequency: paramHarness() }) as any,
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => {
      const source = Object.assign(sourceHarness(), { buffer: null, loop: false });
      sources.push(source);
      return source;
    },
  };
  function sourceHarness() {
    const source = {
      connect: vi.fn(function (this: unknown) { return this; }),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn((_type: 'ended', callback: () => void) => { ended.set(source, callback); }),
    } as unknown as AudioSourceLike;
    return source;
  }
  function paramHarness() {
    return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  }
  return { context, sources, ended };
}

function timersHarness() {
  let next = 0;
  const callbacks = new Map<TimerHandle, () => void>();
  const timers: TimerDriver = {
    setTimeout: (callback) => { const handle = (++next) as unknown as TimerHandle; callbacks.set(handle, callback); return handle; },
    clearTimeout: (handle) => { callbacks.delete(handle); },
  };
  return { timers, callbacks, flush: () => { for (const callback of [...callbacks.values()]) callback(); } };
}

describe('SynthAudio', () => {
  it('creates a quiet looping procedural water bed after unlock', async () => {
    const { context, sources } = contextHarness('suspended');
    const audio = new SynthAudio({ contextFactory: () => context });
    audio.unlock();
    await Promise.resolve();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(sources.some((source) => (source as AudioSourceLike & { loop: boolean }).loop)).toBe(true);
  });

  it('keeps cues distinct and schedules later tones through guarded timers', () => {
    const { context, sources } = contextHarness();
    const { timers, callbacks } = timersHarness();
    const audio = new SynthAudio({ contextFactory: () => context, timers });
    audio.unlock();
    audio.cue('reveal');
    expect(sources).toHaveLength(2); // one bed plus the first reveal tone
    expect(callbacks.size).toBe(2);
  });

  it('stop cancels delayed cues and active sources', () => {
    const { context, sources } = contextHarness();
    const { timers, callbacks } = timersHarness();
    const audio = new SynthAudio({ contextFactory: () => context, timers });
    audio.unlock();
    audio.cue('victory');
    audio.stop();
    expect(callbacks.size).toBe(0);
    expect(sources.every((source) => (source.stop as ReturnType<typeof vi.fn>).mock.calls.length > 0)).toBe(true);
  });

  it('ignores delayed cues after the round generation changes', () => {
    const { context, sources } = contextHarness();
    const { timers, flush } = timersHarness();
    let generation = 1;
    const audio = new SynthAudio({ contextFactory: () => context, getGeneration: () => generation, timers });
    audio.unlock();
    audio.cue('cast');
    const before = sources.length;
    generation = 2;
    flush();
    expect(sources).toHaveLength(before);
  });

  it('does not start ambience when stop invalidates a pending resume', async () => {
    const { context, sources } = contextHarness('suspended');
    let resolveResume!: () => void;
    context.resume = vi.fn(() => new Promise<void>((resolve) => { resolveResume = resolve; }));
    const audio = new SynthAudio({ contextFactory: () => context });
    audio.unlock();
    audio.stop();
    resolveResume();
    await Promise.resolve();
    expect(sources).toHaveLength(0);
  });

  it('survives unavailable constructors and throwing resume', async () => {
    const unavailable = new SynthAudio({ contextFactory: () => { throw new Error('blocked'); } });
    expect(() => unavailable.unlock()).not.toThrow();
    const { context } = contextHarness('suspended');
    context.resume = () => { throw new Error('blocked'); };
    const audio = new SynthAudio({ contextFactory: () => context });
    expect(() => audio.unlock()).not.toThrow();
    await Promise.resolve();
  });
});
