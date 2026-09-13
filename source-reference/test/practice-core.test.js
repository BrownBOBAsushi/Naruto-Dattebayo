import test from 'node:test';
import assert from 'node:assert/strict';
import { newPractice, detectSign } from '../src/practice-core.js';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../data/jutsus.json', import.meta.url)));
const signs = catalog.jutsus.find(jutsu => jutsu.id === 'chidori').handSigns;
const read = (state,label,now,score=.9) => detectSign(state,{label,score,now},signs);
test('requires continuous correct holds in order and completes only after all three signs',() => {
  let state = newPractice();
  state = read(state,'monkey',0);
  state = read(state,'monkey',450);
  assert.equal(state.index,0);
  let time = 500;
  for (const [i,sign] of signs.entries()) {
    state = read(state,sign,time);
    state = read(state,sign,time+449);
    assert.equal(state.index,i);
    state = read(state,sign,time+450);
    assert.equal(state.index,i+1);
    assert.equal(state.completed,i===2);
    time += 500;
  }
  assert.equal(read(state,'ox',time),state);
});
test('missing hands, low confidence, wrong signs and stalled frames reset only the current hold',() => {
  for (const interruption of [{label:null,score:0,now:200},{label:'ox',score:.3,now:200},{label:'tiger',score:.9,now:200},{label:'ox',score:.9,now:1000}]) {
    let state = read(newPractice(),'ox',0);
    state = detectSign(state,interruption,signs);
    state = read(state,'ox',interruption.now+100);
    assert.equal(state.index,0);
    state = read(state,'ox',interruption.now+550);
    assert.equal(state.index,1);
    state = read(state,null,interruption.now+600,0);
    assert.equal(state.index,1);
  }
});
