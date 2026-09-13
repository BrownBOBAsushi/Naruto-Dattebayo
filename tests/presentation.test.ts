import { describe, expect, it } from 'vitest';
import { advanceSign } from '../src/cv/core';
import { calloutEvents, renderClock, resetHoldState, secretScene, startHitstop } from '../src/presentation';

describe('battle presentation sequencing', () => {
  it('freezes the render clock for exactly the 100ms hitstop', () => {
    const clock = startHitstop(1000);
    expect(renderClock(1050, clock)).toBe(1000);
    expect(renderClock(1100, clock)).toBe(1100);
  });
  it('guards the brief round callout sequence and secret clash duration', () => {
    expect(calloutEvents()).toEqual([{ text: 'ROUND', delayMs: 0 }, { text: 'FIGHT', delayMs: 420 }]);
    expect(secretScene(100, 799)).toBe('clash');
    expect(secretScene(100, 800)).toBe('collapse');
  });
  it('requires a full fresh 450ms hold after a camera retry reset', () => {
    const preRetry = advanceSign(resetHoldState(), null, { label: 'serpent', score: 0.9, now: 100, target: 'serpent' });
    const fresh = resetHoldState();
    const first = advanceSign(fresh, null, { label: 'serpent', score: 0.9, now: 400, target: 'serpent' });
    const complete = advanceSign(first.hold, first.lastAt, { label: 'serpent', score: 0.9, now: 850, target: 'serpent' });
    expect(preRetry.hold.startedAt).toBe(100);
    expect(first.hold.startedAt).toBe(400);
    expect(complete.hold.completed).toBe(true);
  });
});
