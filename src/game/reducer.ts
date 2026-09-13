export type Move = 'rock' | 'paper' | 'scissors';
export type Phase = 'menu' | 'ready' | 'choose' | 'reveal' | 'humanCast' | 'humanAttack' | 'cpuAttack' | 'retryTie' | 'secretEnding' | 'victory' | 'defeat';
export type Outcome = 'humanWin' | 'cpuWin' | 'normalTie' | 'secretEnding' | null;
export type Jutsu = 'fireball' | 'chidori';

export interface BattleState {
  phase: Phase;
  outcome: Outcome;
  roundGeneration: number;
  playerHp: 0 | 1 | 2 | 3;
  cpuHp: 0 | 1 | 2 | 3;
  cpuMove: Move | null;
  playerMove: Move | null;
  nextJutsu: Jutsu;
  pendingCast: boolean;
  acceptedSigns: number;
  attackResolved: boolean;
}

export type BattleAction =
  | { type: 'start'; generation: number }
  | { type: 'beginRound'; generation: number; random: number }
  | { type: 'newRound'; generation: number; random: number }
  | { type: 'chooseMove'; generation: number; move: Move }
  | { type: 'resolveReveal'; generation: number; random: number }
  | { type: 'signAccepted'; generation: number }
  | { type: 'resolveAttack'; generation: number; random: number }
  | { type: 'cancelCast'; generation: number }
  | { type: 'cameraRetry'; generation: number; random: number }
  | { type: 'invalidate'; generation: number }
  | { type: 'replay'; generation: number }
  | { type: 'back'; generation: number };

export function createInitialState(): BattleState {
  return {
    phase: 'menu', outcome: null, roundGeneration: 0,
    playerHp: 3, cpuHp: 3, cpuMove: null, playerMove: null,
    nextJutsu: 'fireball', pendingCast: false, acceptedSigns: 0, attackResolved: false,
  };
}

export function moveFromRandom(random: number): Move {
  const value = Math.max(0, Math.min(0.999999, Number.isFinite(random) ? random : 0));
  return value < 1 / 3 ? 'rock' : value < 2 / 3 ? 'paper' : 'scissors';
}

export function resolveReveal(player: Move, cpu: Move, playerHp: number, cpuHp: number): Exclude<Outcome, null> {
  if (playerHp === 1 && cpuHp === 1 && player === cpu) return 'secretEnding';
  if (player === cpu) return 'normalTie';
  if ((player === 'rock' && cpu === 'scissors') || (player === 'paper' && cpu === 'rock') || (player === 'scissors' && cpu === 'paper')) return 'humanWin';
  return 'cpuWin';
}

function generationMatches(state: BattleState, action: BattleAction): boolean {
  return action.type === 'replay' || action.generation === state.roundGeneration;
}

function terminal(state: BattleState): boolean {
  return state.phase === 'victory' || state.phase === 'defeat' || state.phase === 'secretEnding';
}

export function applyDamage(state: BattleState, target: 'player' | 'cpu' | 'both'): BattleState {
  if (target === 'player') return { ...state, playerHp: Math.max(0, state.playerHp - 1) as 0 | 1 | 2 | 3 };
  if (target === 'cpu') return { ...state, cpuHp: Math.max(0, state.cpuHp - 1) as 0 | 1 | 2 | 3 };
  return { ...state, playerHp: 0, cpuHp: 0 };
}

function freshRound(state: BattleState, random: number): BattleState {
  return {
    ...state,
    phase: 'choose', outcome: null, roundGeneration: state.roundGeneration + 1,
    cpuMove: moveFromRandom(random), playerMove: null, pendingCast: false,
    acceptedSigns: 0, attackResolved: false,
  };
}

function firstRound(state: BattleState, random: number): BattleState {
  return { ...state, phase: 'choose', outcome: null, cpuMove: moveFromRandom(random), playerMove: null, pendingCast: false, acceptedSigns: 0, attackResolved: false };
}

export function reduceBattle(state: BattleState, action: BattleAction): BattleState {
  if (action.type === 'replay') {
    if (action.generation !== state.roundGeneration) return state;
    return {
      ...createInitialState(), phase: 'ready', roundGeneration: state.roundGeneration + 1,
    };
  }
  if (action.type === 'back') {
    if (action.generation !== state.roundGeneration) return state;
    return { ...createInitialState(), roundGeneration: state.roundGeneration + 1 };
  }
  if (!generationMatches(state, action) || terminal(state)) return state;
  switch (action.type) {
    case 'start':
      if (state.phase !== 'menu' && state.phase !== 'ready') return state;
      return { ...state, phase: 'ready', roundGeneration: state.roundGeneration + 1, outcome: null };
    case 'beginRound':
      if (state.phase !== 'ready') return state;
      return firstRound(state, action.random);
    case 'newRound':
      if (!['retryTie', 'humanAttack', 'cpuAttack', 'choose'].includes(state.phase)) return state;
      return freshRound(state, action.random);
    case 'chooseMove':
      if (state.phase !== 'choose' || !state.cpuMove) return state;
      return { ...state, phase: 'reveal', playerMove: action.move, outcome: null };
    case 'resolveReveal': {
      if (state.phase !== 'reveal' || !state.playerMove || !state.cpuMove) return state;
      const outcome = resolveReveal(state.playerMove, state.cpuMove, state.playerHp, state.cpuHp);
      if (outcome === 'secretEnding') return { ...applyDamage(state, 'both'), phase: 'secretEnding', outcome };
      if (outcome === 'normalTie') return { ...freshRound({ ...state, phase: 'retryTie' }, action.random), outcome };
      if (outcome === 'humanWin') return { ...state, phase: 'humanCast', outcome, pendingCast: true, acceptedSigns: 0, attackResolved: false };
      return applyDamage({ ...state, phase: 'cpuAttack', outcome, pendingCast: false, acceptedSigns: 0, attackResolved: true }, 'player');
    }
    case 'signAccepted':
      if (state.phase !== 'humanCast' || !state.pendingCast || state.acceptedSigns >= 3) return state;
      if (state.acceptedSigns < 2) return { ...state, acceptedSigns: state.acceptedSigns + 1 };
      return applyDamage({ ...state, phase: 'humanAttack', acceptedSigns: 3, pendingCast: false, attackResolved: true }, 'cpu');
    case 'resolveAttack': {
      if ((state.phase !== 'humanAttack' && state.phase !== 'cpuAttack') || !state.attackResolved) return state;
      const human = state.phase === 'humanAttack';
      const playerHp = state.playerHp;
      const cpuHp = state.cpuHp;
      const nextJutsu = human ? (state.nextJutsu === 'fireball' ? 'chidori' : 'fireball') : state.nextJutsu;
      if (human && cpuHp === 0) return { ...state, phase: 'victory', outcome: 'humanWin', nextJutsu };
      if (!human && playerHp === 0) return { ...state, phase: 'defeat', outcome: 'cpuWin', nextJutsu };
      return freshRound({ ...state, playerHp, cpuHp, nextJutsu }, action.random);
    }
    case 'cancelCast':
      if (state.phase !== 'humanCast') return state;
      return { ...state, phase: 'ready', outcome: null, pendingCast: false, acceptedSigns: 0, playerMove: null, cpuMove: null, roundGeneration: state.roundGeneration + 1 };
    case 'cameraRetry':
      if (state.phase !== 'ready') return state;
      return { ...state, phase: 'choose', roundGeneration: state.roundGeneration + 1, cpuMove: moveFromRandom(action.random), playerMove: null };
    case 'invalidate':
      if (state.phase === 'humanAttack' && state.cpuHp === 0) return { ...state, phase: 'victory', outcome: 'humanWin', roundGeneration: state.roundGeneration + 1 };
      if (state.phase === 'cpuAttack' && state.playerHp === 0) return { ...state, phase: 'defeat', outcome: 'cpuWin', roundGeneration: state.roundGeneration + 1 };
      return { ...state, phase: 'ready', outcome: null, cpuMove: null, playerMove: null, pendingCast: false, acceptedSigns: 0, attackResolved: false, nextJutsu: state.phase === 'humanAttack' ? (state.nextJutsu === 'fireball' ? 'chidori' : 'fireball') : state.nextJutsu, roundGeneration: state.roundGeneration + 1 };
  }
}
