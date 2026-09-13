import { describe, expect, it } from 'vitest';
import { SynthAudio } from '../src/audio';

describe('procedural audio safety', () => {
  it('keeps state transitions safe when AudioContext is unavailable', () => {
    const audio = new SynthAudio();
    expect(() => { audio.unlock(); audio.cue('hit'); audio.stop(); }).not.toThrow();
    expect(audio.toggle()).toBe(true);
  });
});
