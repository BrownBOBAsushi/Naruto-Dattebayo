import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LABELS,
  advanceHold,
  advanceSequence,
  buildTensor,
  classifyScores,
  createTrialLog,
  majorityLabel,
} from '../src/probe-core.js';

test('normalizes one hand relative to wrist and middle MCP into 42 float values', () => {
  const hand = Array.from({ length: 21 }, (_, index) => ({
    x: 10 + index,
    y: 20 + index * 2,
  }));
  hand[9] = { x: 12, y: 24 };

  const tensor = buildTensor([hand]);

  assert.equal(tensor.length, 84);
  assert.deepEqual(tensor.slice(0, 6), [0, 0, 1 / Math.sqrt(20), 2 / Math.sqrt(20), 2 / Math.sqrt(20), 4 / Math.sqrt(20)]);
  assert.deepEqual(tensor.slice(42), new Array(42).fill(0));
});

test('buildTensor keeps left hand primary and zero fills a missing secondary hand', () => {
  const left = Array.from({ length: 21 }, () => ({ x: 4, y: 8 }));
  left[0] = { x: 2, y: 4 };
  left[9] = { x: 3, y: 6 };
  const right = Array.from({ length: 21 }, () => ({ x: 20, y: 10 }));
  right[1] = { x: 22, y: 10 };

  const tensor = buildTensor([{ landmarks: right, handedness: 'Right' }, { landmarks: left, handedness: 'Left' }]);

  assert.equal(tensor[0], 0);
  assert.equal(tensor[1], 0);
  assert.ok(tensor[2] > 0);
  assert.equal(tensor[42], 0);
  assert.equal(tensor[43], 0);
  assert.ok(tensor[44] > 0);
});

test('buildTensor puts a right-only detection in primary and leaves secondary zero-filled', () => {
  const right = Array.from({ length: 21 }, () => ({ x: 20, y: 10 }));
  right[1] = { x: 22, y: 10 };
  const tensor = buildTensor([{ landmarks: right, handedness: 'Right' }]);

  assert.ok(tensor[2] > 0);
  assert.deepEqual(tensor.slice(42), new Array(42).fill(0));
});

test('buildTensor sorts an incomplete handedness pair by wrist x and preserves both hands', () => {
  const first = Array.from({ length: 21 }, () => ({ x: 30, y: 10 }));
  first[1] = { x: 32, y: 10 };
  const second = Array.from({ length: 21 }, () => ({ x: 10, y: 10 }));
  second[1] = { x: 12, y: 10 };
  const tensor = buildTensor([{ landmarks: first, handedness: 'Left' }, { landmarks: second }]);

  assert.ok(tensor[2] > 0);
  assert.ok(tensor[44] > 0);
  assert.equal(tensor[0], 0);
  assert.equal(tensor[42], 0);
});

test('classifyScores returns the direct argmax only when confidence reaches .6', () => {
  const scores = new Array(LABELS.length).fill(0);
  scores[4] = 0.6;
  assert.deepEqual(classifyScores(scores), { label: 'dragon', score: 0.6, index: 4 });

  scores[4] = 0.599;
  assert.equal(classifyScores(scores), null);
});

test('majorityLabel stabilizes the last three predictions and preserves ties by recency', () => {
  assert.equal(majorityLabel(['rat', 'ox', 'ox']), 'ox');
  assert.equal(majorityLabel(['rat', 'ox', 'hare']), 'hare');
  assert.equal(majorityLabel(['rat', null, 'rat']), 'rat');
});

test('advanceHold reaches completion after 350ms and resets on absence, low score, or wrong label', () => {
  let state = { label: null, startedAt: null, progress: 0, completed: false };
  state = advanceHold(state, { label: 'rat', score: 0.8, now: 1000, target: 'rat' });
  state = advanceHold(state, { label: 'rat', score: 0.8, now: 1349, target: 'rat' });
  assert.equal(state.completed, false);
  state = advanceHold(state, { label: 'rat', score: 0.8, now: 1350, target: 'rat' });
  assert.equal(state.completed, true);
  assert.equal(state.progress, 1);

  const reset = advanceHold(state, { label: null, score: 0, now: 1500, target: 'rat' });
  assert.deepEqual(reset, { label: null, startedAt: null, progress: 0, completed: false });
});

test('advanceSequence moves through exactly three targets and records one success', () => {
  const sequence = ['rat', 'ox', 'tiger'];
  let state = { index: 0, successes: 0, completed: false };
  state = advanceSequence(state, 'rat', sequence);
  state = advanceSequence(state, 'ox', sequence);
  state = advanceSequence(state, 'tiger', sequence);
  assert.deepEqual(state, { index: 3, successes: 1, completed: true });
  assert.deepEqual(advanceSequence(state, 'rat', sequence), state);
});

test('createTrialLog contains timing and recognition results but no video payload', () => {
  const record = createTrialLog({
    id: 'trial-1',
    sequence: ['rat', 'ox', 'tiger'],
    startedAt: 1000,
    endedAt: 2200,
    success: true,
    inferenceMs: [12.3, 14.1],
  });

  assert.deepEqual(record, {
    id: 'trial-1',
    sequence: ['rat', 'ox', 'tiger'],
    startedAt: 1000,
    endedAt: 2200,
    elapsedMs: 1200,
    success: true,
    inferenceMs: [12.3, 14.1],
  });
  assert.equal('video' in record, false);
});
