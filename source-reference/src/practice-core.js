import { advanceHold } from './probe-core.js';

export const newPractice = () => ({ index: 0, completed: false, hold: {}, lastAt: null });
export function detectSign(state, { label, score, now }, signs) {
  if (state.completed) return state;
  // A stalled camera/inference stream cannot count as a continuous hold.
  const previous = state.lastAt !== null && now - state.lastAt > 500 ? {} : state.hold;
  const hold = advanceHold(previous, { label, score, now, target: signs[state.index], durationMs: 450 });
  if (!hold.completed) return { ...state, hold, lastAt: now };
  const index = state.index + 1;
  return { index, completed: index === signs.length, hold: {}, lastAt: now };
}
