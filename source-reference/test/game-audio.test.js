import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/game-audio.js';

function setup() {
  const sources = [];
  const context = {
    state: 'running', currentTime: 10, destination: {},
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createBufferSource() {
      const handlers = [];
      const source = { addEventListener(_, handler) { handlers.push(handler); }, connect() { return { connect() {} }; }, disconnect() {}, start(at) { this.at = at; }, stop() { handlers.forEach(fn => fn()); } };
      sources.push(source); return source;
    },
  };
  const audio = new GameAudio(); audio.context = context;
  const bells = []; audio.deng = at => bells.push(at);
  return { audio, context, sources, bells };
}
test('completion lets the final weave finish, sounds the bell, then schedules the callout', async () => {
  const { audio, sources, bells } = setup();
  audio.load = async () => ({ duration: 2 });
  const result = audio.complete('clip');
  await Promise.resolve();
  assert.deepEqual(bells, [10.14]);
  assert.equal(sources[0].at, 10.65);
  sources[0].stop();
  assert.deepEqual(await result, { played: true });
});
test('changing mode while a callout loads cancels its eventual playback', async () => {
  const { audio, sources } = setup();
  let finishLoad;
  audio.load = () => new Promise(resolve => { finishLoad = resolve; });
  const result = audio.complete('clip');
  audio.cancel(); finishLoad({ duration: 2 });
  assert.deepEqual(await result, { cancelled: true });
  assert.equal(sources.length, 0);
});
test('muted and failed clips never leave completion waiting indefinitely', async () => {
  const { audio, sources } = setup();
  audio.muted = true;
  assert.deepEqual(await audio.complete('clip'), { played: false, blocked: false });
  audio.muted = false; audio.load = async () => null;
  assert.deepEqual(await audio.complete('clip'), { missing: true });
  assert.equal(sources.length, 0);
});
