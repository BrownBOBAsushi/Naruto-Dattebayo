import { describe, expect, it } from 'vitest';
import { advanceHold, advanceSign, buildTensor, classifyScores, LABELS, type SignLabel } from '../src/cv/core';

const hand = (x: number, y: number) => Array.from({ length: 21 }, (_, index) => ({ x: x + index, y: y + index * 2 }));

describe('local CV contract', () => {
  it('builds finite float32-compatible 84-value normalized tensors', () => {
    const first = hand(10, 20);
    first[9] = { x: 12, y: 24 };
    const tensor = buildTensor([first]);
    expect(tensor).toHaveLength(84);
    expect(tensor.slice(0, 6)).toEqual([0, 0, 1 / Math.sqrt(20), 2 / Math.sqrt(20), 2 / Math.sqrt(20), 4 / Math.sqrt(20)]);
    expect(tensor.slice(42).every((value) => value === 0)).toBe(true);
    expect(tensor.every(Number.isFinite)).toBe(true);
  });

  it('keeps left primary and falls back to wrist x when handedness is ambiguous', () => {
    const left = hand(2, 4);
    const right = hand(20, 10);
    left[1] = { x: 12, y: 4 }; right[1] = { x: 20, y: 20 };
    const tensor = buildTensor([{ landmarks: right, handedness: 'Right' }, { landmarks: left, handedness: 'Left' }]);
    expect(tensor[2]).toBeGreaterThan(0);
    expect(tensor[45]).toBeGreaterThan(0);
    const byX = buildTensor([{ landmarks: right }, { landmarks: left }]);
    expect(byX[2]).toBeCloseTo((left[1].x - left[0].x) / Math.hypot(left[9].x - left[0].x, left[9].y - left[0].y));
    expect(byX[45]).toBeCloseTo((right[1].y - right[0].y) / Math.hypot(right[9].x - right[0].x, right[9].y - right[0].y));
  });

  it('keeps zero-scale landmarks finite by using a unit denominator', () => {
    const flat = Array.from({ length: 21 }, () => ({ x: 5, y: 5 }));
    flat[1] = { x: 6, y: 7 };
    expect(buildTensor([flat])[2]).toBe(1);
    expect(buildTensor([flat]).every(Number.isFinite)).toBe(true);
  });

  it('uses direct argmax and accepts exactly the .6 threshold', () => {
    const scores = new Array(LABELS.length).fill(0);
    scores[5] = 0.6;
    expect(classifyScores(scores)).toMatchObject({ label: 'serpent', score: 0.6, index: 5 });
    scores[5] = 0.599;
    expect(classifyScores(scores)).toBeNull();
  });

  it('requires a 450ms continuous hold and resets only on a >500ms inference stall', () => {
    let state = { label: null as SignLabel | null, startedAt: null as number | null, progress: 0, completed: false };
    state = advanceHold(state, { label: 'ox', score: 0.9, now: 1000, target: 'ox' });
    state = advanceHold(state, { label: 'ox', score: 0.9, now: 1449, target: 'ox' });
    expect(state.completed).toBe(false);
    state = advanceHold(state, { label: 'ox', score: 0.9, now: 1450, target: 'ox' });
    expect(state.completed).toBe(true);
    expect(advanceHold(state, { label: 'hare', score: 0.9, now: 1500, target: 'ox' }).completed).toBe(false);
  });

  it('resets the current hold after a strict >500ms gap but preserves it at exactly 500ms', () => {
    let state = { label: 'ox' as SignLabel, startedAt: 1000, progress: 0.5, completed: false };
    const exact = advanceSign(state, 1000, { label: 'ox', score: .9, now: 1500, target: 'ox' });
    expect(exact.hold.startedAt).toBe(1000);
    const stalled = advanceSign(state, 1000, { label: 'ox', score: .9, now: 1501, target: 'ox' });
    expect(stalled.hold.startedAt).toBe(1501);
  });
});
