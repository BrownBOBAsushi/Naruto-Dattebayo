export const LABELS = ['rat', 'ox', 'tiger', 'hare', 'dragon', 'serpent', 'horse', 'ram', 'monkey', 'bird', 'dog', 'boar'] as const;
export type SignLabel = (typeof LABELS)[number];
export interface HandPoint { x: number; y: number }
export interface DetectedHand { landmarks?: HandPoint[]; handedness?: string | Array<{ categoryName?: string }>; }
type HandInput = DetectedHand | HandPoint[];
export interface HoldState { label: SignLabel | null; startedAt: number | null; progress: number; completed: boolean }

const HAND_SIZE = 21;
const VALUES_PER_HAND = HAND_SIZE * 2;
const THRESHOLD = 0.6;

function points(hand: HandInput): HandPoint[] | undefined { return Array.isArray(hand) ? hand : hand?.landmarks; }
function handedness(hand: HandInput): string {
  if (Array.isArray(hand)) return '';
  if (Array.isArray(hand.handedness)) return String(hand.handedness[0]?.categoryName ?? '').toLowerCase();
  return String(hand.handedness ?? '').toLowerCase();
}
function orderHands(hands: HandInput[]): HandInput[] {
  const usable = hands.filter((hand) => (points(hand)?.length ?? 0) >= HAND_SIZE);
  const left = usable.find((hand) => handedness(hand).includes('left'));
  const right = usable.find((hand) => handedness(hand).includes('right'));
  if (left && right && left !== right) return [left, right];
  return usable.slice(0, 2).sort((a, b) => (points(a)?.[0]?.x ?? 0) - (points(b)?.[0]?.x ?? 0));
}
function normalizeHand(hand?: HandInput): number[] {
  const source = hand ? points(hand) : undefined;
  if (!source || source.length < HAND_SIZE) return new Array(VALUES_PER_HAND).fill(0);
  const wrist = source[0];
  const middle = source[9];
  const scale = Math.hypot(middle.x - wrist.x, middle.y - wrist.y) || 1;
  return source.slice(0, HAND_SIZE).flatMap((point) => [(point.x - wrist.x) / scale, (point.y - wrist.y) / scale]);
}
export function buildTensor(hands: HandInput[] = []): number[] { const [first, second] = orderHands(hands); return [...normalizeHand(first), ...normalizeHand(second)]; }
export function classifyScores(scores: ArrayLike<number> | null | undefined, threshold = THRESHOLD): { label: SignLabel; score: number; index: number } | null {
  if (!scores || scores.length === 0) return null;
  let index = 0;
  for (let candidate = 1; candidate < scores.length; candidate += 1) if (scores[candidate] > scores[index]) index = candidate;
  const score = Number(scores[index]);
  const label = LABELS[index];
  return label && score >= threshold ? { label, score, index } : null;
}
export function advanceHold(state: HoldState, input: { label: string | null; score: number; now: number; target: SignLabel; durationMs?: number }): HoldState {
  const valid = input.label === input.target && input.score >= THRESHOLD;
  if (!valid) return { label: null, startedAt: null, progress: 0, completed: false };
  const startedAt = state.startedAt ?? input.now;
  const progress = Math.min(1, Math.max(0, (input.now - startedAt) / (input.durationMs ?? 450)));
  return { label: input.target, startedAt, progress, completed: progress >= 1 };
}
export function advanceSign(state: HoldState, lastAt: number | null, input: { label: string | null; score: number; now: number; target: SignLabel }): { hold: HoldState; lastAt: number } {
  const previous = lastAt !== null && input.now - lastAt > 500 ? { label: null, startedAt: null, progress: 0, completed: false } : state;
  return { hold: advanceHold(previous, input), lastAt: input.now };
}
