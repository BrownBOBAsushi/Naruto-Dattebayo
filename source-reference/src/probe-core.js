export const LABELS = [
  'rat',
  'ox',
  'tiger',
  'hare',
  'dragon',
  'serpent',
  'horse',
  'ram',
  'monkey',
  'bird',
  'dog',
  'boar',
];

const HAND_SIZE = 21;
const VALUES_PER_HAND = HAND_SIZE * 2;
const CONFIDENCE_THRESHOLD = 0.6;

function unwrapHand(hand) {
  return Array.isArray(hand) ? hand : hand?.landmarks;
}

function handName(hand) {
  return String(hand?.handedness ?? hand?.categoryName ?? '').toLowerCase();
}

function distance(a, b) {
  return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
}

function normalizeHand(hand) {
  const points = unwrapHand(hand);
  if (!Array.isArray(points) || points.length < HAND_SIZE) {
    return new Array(VALUES_PER_HAND).fill(0);
  }

  const wrist = points[0];
  const scale = distance(wrist, points[9]) || 1;
  const values = [];
  for (let index = 0; index < HAND_SIZE; index += 1) {
    values.push((points[index].x - wrist.x) / scale, (points[index].y - wrist.y) / scale);
  }
  return values;
}

function orderHands(hands) {
  const usable = (hands ?? []).filter((hand) => Array.isArray(unwrapHand(hand)));
  const left = usable.find((hand) => handName(hand).includes('left'));
  const right = usable.find((hand) => handName(hand).includes('right'));
  if (left && right && left !== right) return [left, right];
  return usable.slice(0, 2).sort((a, b) => (unwrapHand(a)[0]?.x ?? 0) - (unwrapHand(b)[0]?.x ?? 0));
}

export function buildTensor(hands = []) {
  const ordered = orderHands(hands);
  return [...normalizeHand(ordered[0]), ...normalizeHand(ordered[1])];
}

export function classifyScores(scores, threshold = CONFIDENCE_THRESHOLD) {
  if (!scores || typeof scores.length !== 'number' || scores.length === 0) return null;
  let index = 0;
  for (let candidate = 1; candidate < scores.length; candidate += 1) {
    if (scores[candidate] > scores[index]) index = candidate;
  }
  const score = Number(scores[index]);
  const label = LABELS[index];
  return label && score >= threshold ? { label, score, index } : null;
}

export function majorityLabel(labels) {
  const counts = new Map();
  for (const label of labels ?? []) {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let winner = null;
  let best = 0;
  for (const label of labels ?? []) {
    const count = counts.get(label) ?? 0;
    if (count >= best && count > 0) {
      winner = label;
      best = count;
    }
  }
  return winner;
}

export function advanceHold(state, { label, score = 0, now, target, durationMs = 350 }) {
  const valid = label === target && score >= CONFIDENCE_THRESHOLD;
  if (!valid) return { label: null, startedAt: null, progress: 0, completed: false };
  const startedAt = state.startedAt ?? now;
  const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
  return { label: target, startedAt, progress, completed: progress >= 1 };
}

export function advanceSequence(state, label, sequence) {
  if (state.completed || label !== sequence[state.index]) return state;
  const index = state.index + 1;
  return {
    index,
    successes: index === sequence.length ? state.successes + 1 : state.successes,
    completed: index === sequence.length,
  };
}

export function createTrialLog({ id, sequence, startedAt, endedAt, success, inferenceMs }) {
  return {
    id,
    sequence: [...sequence],
    startedAt,
    endedAt,
    elapsedMs: endedAt - startedAt,
    success: Boolean(success),
    inferenceMs: [...inferenceMs],
  };
}
