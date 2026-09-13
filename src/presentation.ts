import type { HoldState } from './cv/core';

export type CalloutText = 'ROUND' | 'FIGHT';

export function resetHoldState(): HoldState {
  return { label: null, startedAt: null, progress: 0, completed: false };
}

export interface HitstopClock { hitstopAt: number; hitstopUntil: number }

export function startHitstop(now: number, duration = 100): HitstopClock {
  return { hitstopAt: now, hitstopUntil: now + duration };
}

export function renderClock(now: number, clock: HitstopClock): number {
  return now < clock.hitstopUntil ? clock.hitstopAt : now;
}

export function calloutEvents(): readonly { text: CalloutText; delayMs: number }[] {
  return [{ text: 'ROUND', delayMs: 0 }, { text: 'FIGHT', delayMs: 420 }];
}

export function secretScene(startedAt: number, now: number, clashDuration = 700): 'clash' | 'collapse' {
  return now - startedAt < clashDuration ? 'clash' : 'collapse';
}
