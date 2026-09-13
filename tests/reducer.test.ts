import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  reduceBattle,
  moveFromRandom,
  type BattleState,
  type Move,
} from '../src/game/reducer';

const begin = (random = 0): BattleState => {
  let state = createInitialState();
  state = reduceBattle(state, { type: 'start', generation: state.roundGeneration });
  return reduceBattle(state, { type: 'beginRound', generation: state.roundGeneration, random });
};

const choose = (state: BattleState, move: Move) =>
  reduceBattle(state, { type: 'chooseMove', generation: state.roundGeneration, move });

const resolve = (state: BattleState) =>
  reduceBattle(state, { type: 'resolveReveal', generation: state.roundGeneration, random: 0.67 });

function humanWinToCast(player: Move = 'rock', cpuRandom = 0.9): BattleState {
  let state = begin(cpuRandom);
  state = choose(state, player);
  return resolve(state);
}

describe('battle reducer', () => {
  it('maps the uniform random thirds at their boundaries', () => {
    expect(moveFromRandom(0)).toBe('rock');
    expect(moveFromRandom(1 / 3)).toBe('paper');
    expect(moveFromRandom(2 / 3)).toBe('scissors');
    expect(moveFromRandom(1)).toBe('scissors');
  });
  it('samples and locks the CPU move before player choice', () => {
    const state = begin(0.34);
    expect(state.phase).toBe('choose');
    expect(state.cpuMove).toBe('paper');
    const chosen = choose(state, 'rock');
    expect(chosen.cpuMove).toBe('paper');
    expect(chosen.phase).toBe('reveal');
  });

  it('resolves all ordered RPS outcomes', () => {
    const cases: Array<[Move, Move, string]> = [
      ['rock', 'scissors', 'humanWin'], ['rock', 'paper', 'cpuWin'], ['rock', 'rock', 'normalTie'],
      ['paper', 'rock', 'humanWin'], ['paper', 'scissors', 'cpuWin'], ['paper', 'paper', 'normalTie'],
      ['scissors', 'paper', 'humanWin'], ['scissors', 'rock', 'cpuWin'], ['scissors', 'scissors', 'normalTie'],
    ];
    for (const [player, cpu, result] of cases) {
      let state = begin(cpu === 'rock' ? 0 : cpu === 'paper' ? 0.34 : 0.67);
      state = choose(state, player);
      const revealed = resolve(state);
      expect(revealed.outcome).toBe(result);
    }
  });

  it('normal ties reroll into a fresh choose round without damage', () => {
    let state = begin(0);
    state = choose(state, 'rock');
    state = resolve(state);
    expect(state.phase).toBe('choose');
    expect(state.playerHp).toBe(3);
    expect(state.cpuHp).toBe(3);
    expect(state.roundGeneration).toBe(2);
    expect(state.cpuMove).not.toBe('rock');
  });

  it('only the third accepted sign enters human attack and damage resolves once', () => {
    let state = humanWinToCast();
    expect(state.phase).toBe('humanCast');
    expect(state.playerHp).toBe(3);
    for (let index = 0; index < 2; index += 1) {
      state = reduceBattle(state, { type: 'signAccepted', generation: state.roundGeneration });
      expect(state.phase).toBe('humanCast');
      expect(state.cpuHp).toBe(3);
    }
    state = reduceBattle(state, { type: 'signAccepted', generation: state.roundGeneration });
    expect(state.phase).toBe('humanAttack');
    expect(state.cpuHp).toBe(2);
    const generation = state.roundGeneration;
    state = reduceBattle(state, { type: 'resolveAttack', generation, random: 0.67 });
    expect(state.cpuHp).toBe(2);
    expect(state.phase).toBe('choose');
    state = reduceBattle(state, { type: 'resolveAttack', generation, random: 0.67 });
    expect(state.cpuHp).toBe(2);
  });

  it('CPU wins and applies exactly one damage without signs', () => {
    let state = begin(0);
    state = choose(state, 'scissors');
    state = resolve(state);
    expect(state.phase).toBe('cpuAttack');
    expect(state.playerHp).toBe(3);
    state = reduceBattle(state, { type: 'resolveAttack', generation: state.roundGeneration, random: 0.67 });
    expect(state.playerHp).toBe(2);
    expect(state.phase).toBe('choose');
  });

  it('cancelling a pending CPU attack deals zero damage, while resolve applies once', () => {
    let pending = begin(0);
    pending = resolve(choose(pending, 'scissors'));
    const generation = pending.roundGeneration;
    expect(pending).toMatchObject({ phase: 'cpuAttack', playerHp: 3, attackResolved: false });
    const paused = reduceBattle(pending, { type: 'invalidate', generation });
    expect(paused).toMatchObject({ phase: 'ready', playerHp: 3 });
    expect(reduceBattle(paused, { type: 'resolveAttack', generation, random: 0.67 })).toEqual(paused);

    let lethal = begin(0);
    lethal = { ...resolve(choose(lethal, 'scissors')), playerHp: 1 };
    const resolved = reduceBattle(lethal, { type: 'resolveAttack', generation: lethal.roundGeneration, random: 0.67 });
    expect(resolved).toMatchObject({ phase: 'defeat', playerHp: 0 });
    expect(reduceBattle(resolved, { type: 'resolveAttack', generation: resolved.roundGeneration, random: 0.67 })).toEqual(resolved);
  });

  it('alternates Fireball then Chidori only after successful human attacks', () => {
    let state = humanWinToCast();
    expect(state.nextJutsu).toBe('fireball');
    for (let i = 0; i < 3; i += 1) {
      state = reduceBattle(state, { type: 'signAccepted', generation: state.roundGeneration });
    }
    state = reduceBattle(state, { type: 'resolveAttack', generation: state.roundGeneration, random: 0.67 });
    expect(state.nextJutsu).toBe('chidori');
    expect(state.phase).toBe('choose');
  });

  it('takes the secret same-move ending before normal tie at one HP', () => {
    let state = begin(0);
    state = { ...state, playerHp: 1, cpuHp: 1 };
    state = choose(state, 'rock');
    state = resolve(state);
    expect(state.outcome).toBe('secretEnding');
    expect(state.phase).toBe('secretEnding');
    expect(state.playerHp).toBe(0);
    expect(state.cpuHp).toBe(0);
  });

  it('enters normal victory and defeat only when the single attack reaches zero HP', () => {
    let human: BattleState = { ...humanWinToCast(), cpuHp: 1 };
    for (let index = 0; index < 3; index += 1) human = reduceBattle(human, { type: 'signAccepted', generation: human.roundGeneration });
    expect(human.phase).toBe('humanAttack'); expect(human.cpuHp).toBe(0);
    human = reduceBattle(human, { type: 'resolveAttack', generation: human.roundGeneration, random: .67 });
    expect(human.phase).toBe('victory');
    let cpu: BattleState = begin(0); cpu = { ...choose(cpu, 'scissors'), playerHp: 1 }; cpu = resolve(cpu);
    expect(cpu.phase).toBe('cpuAttack'); expect(cpu.playerHp).toBe(1);
    cpu = reduceBattle(cpu, { type: 'resolveAttack', generation: cpu.roundGeneration, random: .67 });
    expect(cpu.phase).toBe('defeat');
  });

  it('cancelling a failed camera cast returns to ready with unchanged HP and a new generation', () => {
    const cast = humanWinToCast(); const cancelled = reduceBattle(cast, { type: 'cancelCast', generation: cast.roundGeneration });
    expect(cancelled.phase).toBe('ready'); expect(cancelled.playerHp).toBe(3); expect(cancelled.cpuHp).toBe(3); expect(cancelled.roundGeneration).toBe(cast.roundGeneration + 1);
  });

  it('visibility invalidation preserves applied attack damage and terminal result', () => {
    let state = humanWinToCast();
    for (let index = 0; index < 3; index += 1) state = reduceBattle(state, { type: 'signAccepted', generation: state.roundGeneration });
    state = reduceBattle(state, { type: 'invalidate', generation: state.roundGeneration });
    expect(state.phase).toBe('ready'); expect(state.cpuHp).toBe(2); expect(state.nextJutsu).toBe('chidori');
    state = { ...state, phase: 'cpuAttack', playerHp: 1 as const, attackResolved: false };
    const terminal = reduceBattle(state, { type: 'invalidate', generation: state.roundGeneration });
    expect(terminal.phase).toBe('ready'); expect(terminal.playerHp).toBe(1);
  });

  it('rejects stale generation events and terminal callbacks', () => {
    let state = begin(0.9);
    const stale = state.roundGeneration;
    state = reduceBattle(state, { type: 'invalidate', generation: stale });
    expect(state.roundGeneration).toBe(stale + 1);
    const before = state;
    state = reduceBattle(state, { type: 'beginRound', generation: stale, random: 0 });
    expect(state).toEqual(before);
    state = reduceBattle(state, { type: 'chooseMove', generation: stale, move: 'rock' });
    expect(state).toEqual(before);
    state = { ...state, phase: 'victory', cpuHp: 0 };
    const terminal = reduceBattle(state, { type: 'resolveAttack', generation: state.roundGeneration, random: 0.67 });
    expect(terminal).toEqual(state);
  });

  it('does not reroll a locked CPU move or escape an attack with beginRound', () => {
    const locked = begin(0.1);
    const reroll = reduceBattle(locked, { type: 'beginRound', generation: locked.roundGeneration, random: 0.9 });
    expect(reroll).toEqual(locked);
    let attack = humanWinToCast();
    for (let index = 0; index < 3; index += 1) attack = reduceBattle(attack, { type: 'signAccepted', generation: attack.roundGeneration });
    expect(attack.phase).toBe('humanAttack');
    expect(reduceBattle(attack, { type: 'beginRound', generation: attack.roundGeneration, random: 0.9 })).toEqual(attack);
  });

  it('replay resets game state and advances generation', () => {
    const state = { ...begin(), phase: 'defeat' as const, playerHp: 0 as const, cpuHp: 2 as const, nextJutsu: 'chidori' as const };
    const replayed = reduceBattle(state, { type: 'replay', generation: state.roundGeneration });
    expect(replayed).toMatchObject({ phase: 'ready', playerHp: 3, cpuHp: 3, cpuMove: null, playerMove: null, nextJutsu: 'fireball' });
    expect(replayed.roundGeneration).toBe(state.roundGeneration + 1);
  });

  it('back returns to menu while preserving monotonic generation invalidation', () => {
    const state = begin(); const menu = reduceBattle(state, { type: 'back', generation: state.roundGeneration });
    expect(menu.phase).toBe('menu'); expect(menu.roundGeneration).toBe(state.roundGeneration + 1); expect(menu.playerHp).toBe(3);
  });
});
