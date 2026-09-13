import './styles.css';
import { loadAssetManifest, loadOptionalImage, type AssetManifest } from './assets';
import { SynthAudio } from './audio';
import { CameraController } from './cv/camera';
import { advanceSign, type HoldState, type SignLabel } from './cv/core';
import { calloutEvents, renderClock, secretScene } from './presentation';
import { createInitialState, reduceBattle, type BattleState, type Move } from './game/reducer';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('App root missing');
root.innerHTML = `<div class="shell">
  <header class="masthead"><div class="mode"><strong>SINGLE PLAYER</strong>VALLEY OF THE END<br><small>MULTI PLAYER / SURVIVAL</small></div></header>
  <section class="hp-row" aria-label="fighter health"><div class="fighter-name">SASUKE <span>UCHIHA // PLAYER</span></div><div class="fighter-name" style="text-align:right">NARUTO <span>UZUMAKI // CPU</span></div></section>
  <section class="hp-row"><div class="hp" id="player-hp" aria-label="Sasuke health"></div><div class="hp cpu" id="cpu-hp" aria-label="Naruto health"></div></section>
  <div class="arena-wrap"><canvas id="arena" width="960" height="540" aria-label="Valley of the End battle arena"></canvas><div class="arena-callout" id="callout"></div></div>
  <section class="hud"><article class="panel camera-panel"><h2 class="panel-title">FIELD CAMERA / LOCAL</h2><video id="webcam" autoplay muted playsinline></video><button class="camera-retry" id="camera-retry">RETRY CAMERA</button><div class="camera-status" id="camera-status">Camera idle • your frames stay on this device</div></article><article class="panel lower-title"><div class="logo">NARUTO<span class="shippuden">SHIPPUDEN</span><span class="dattebayo">DATTEBAYO</span></div><div class="title-rule">VALLEY OF THE END</div></article><article class="panel choice-panel"><h2 class="panel-title">RPS // CHOOSE</h2><div class="rps" id="rps"><button data-move="rock">ROCK</button><button data-move="paper">PAPER</button><button data-move="scissors">SCISSORS</button></div></article></section>
  <div class="actions"><button class="gold" id="play">PLAY</button><button class="gold" id="sound">SOUND: ON</button><button class="gold" id="back">BACK</button><button class="gold" id="replay" disabled>REPLAY</button><div class="status" id="status" aria-live="polite">Press PLAY to enter the arena.</div></div>
  <p class="footer-note"><span class="greybox-badge">TEMPORARY GREYBOX ART</span> // Original sprite art is pending. Camera frames stay on this device.</p>
</div>`;

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const ctx = canvas.getContext('2d')!;
const stateEls = { playerHp: document.querySelector<HTMLDivElement>('#player-hp')!, cpuHp: document.querySelector<HTMLDivElement>('#cpu-hp')!, status: document.querySelector<HTMLDivElement>('#status')!, cameraStatus: document.querySelector<HTMLDivElement>('#camera-status')!, rps: document.querySelector<HTMLElement>('#rps')!, panelTitle: document.querySelector<HTMLElement>('.choice-panel .panel-title')!, callout: document.querySelector<HTMLDivElement>('#callout')!, play: document.querySelector<HTMLButtonElement>('#play')!, replay: document.querySelector<HTMLButtonElement>('#replay')!, sound: document.querySelector<HTMLButtonElement>('#sound')!, cameraRetry: document.querySelector<HTMLButtonElement>('#camera-retry')! };
const video = document.querySelector<HTMLVideoElement>('#webcam')!;
let state: BattleState = createInitialState();
let assetManifest: AssetManifest | null = null;
let valleyImage: HTMLImageElement | null = null;
let hold: HoldState = { label: null, startedAt: null, progress: 0, completed: false };
let holdLastAt: number | null = null;
let pendingAttackTimer: number | null = null;
let pendingCalloutTimer: number | null = null;
let hitstopUntil = 0;
let hitstopAt = 0;
let shakeUntil = 0;
let secretStartedAt: number | null = null;
const audio = new SynthAudio({ getGeneration: () => state.roundGeneration });
const signsByJutsu: Record<'fireball' | 'chidori', SignLabel[]> = { fireball: ['serpent', 'ram', 'tiger'], chidori: ['ox', 'hare', 'monkey'] };
const signNotes: Record<SignLabel, string> = { rat: 'fingers interlaced', ox: 'hands stacked', tiger: 'palms together', hare: 'index fingers raised', dragon: 'hands cupped', serpent: 'palms crossed', horse: 'fists aligned', ram: 'fists together', monkey: 'wrists crossed', bird: 'thumbs linked', dog: 'one fist covered', boar: 'knuckles together' };
const camera = new CameraController(video, { getRoundGeneration: () => state.roundGeneration, onStatus: (status) => { stateEls.cameraStatus.textContent = status; }, onPrediction: handlePrediction });

function renderHp(element: HTMLElement, hp: number): void { element.innerHTML = [0, 1, 2].map((index) => `<i class="${index >= hp ? 'lost' : ''}" aria-hidden="true"></i>`).join(''); }
function drawArena(now: number): void {
  const w = canvas.width, h = canvas.height, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = renderClock(now, { hitstopAt, hitstopUntil });
  ctx.save();
  const shake = !reduced && now < shakeUntil ? 3 : 0; if (shake) ctx.translate(Math.sin(now) * shake, Math.cos(now) * shake);
  if (valleyImage) ctx.drawImage(valleyImage, 0, 0, w, h); else { const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#202b4c'); sky.addColorStop(.58, '#56637d'); sky.addColorStop(.59, '#263e55'); sky.addColorStop(1, '#142335'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h); }
  ctx.globalAlpha = .25; ctx.fillStyle = '#b8c0bd'; ctx.fillRect(0, 120, w, 92); ctx.fillStyle = '#68738a';
  ctx.beginPath(); ctx.moveTo(90, 212); ctx.lineTo(170, 66); ctx.lineTo(250, 212); ctx.lineTo(300, 212); ctx.lineTo(382, 80); ctx.lineTo(454, 212); ctx.fill(); ctx.beginPath(); ctx.moveTo(510, 212); ctx.lineTo(590, 70); ctx.lineTo(666, 212); ctx.lineTo(720, 212); ctx.lineTo(810, 88); ctx.lineTo(900, 212); ctx.fill();
  ctx.globalAlpha = .4; ctx.fillStyle = '#d5e0db'; ctx.fillRect(470, 28, 28, 190); ctx.fillRect(498, 52, 10, 167);
  ctx.globalAlpha = 1; const water = ctx.createLinearGradient(0, 235, 0, h); water.addColorStop(0, '#254c61'); water.addColorStop(1, '#0d2136'); ctx.fillStyle = water; ctx.fillRect(0, 235, w, h - 235);
  ctx.strokeStyle = '#6fa0a1'; ctx.globalAlpha = .42; for (let y = 262; y < h; y += 36) { for (let x = -30; x < w + 30; x += 110) { const drift = reduced ? 0 : Math.sin(now / 1100 + y) * 12; ctx.beginPath(); ctx.ellipse(x + drift, y, 34, 4, 0, 0, Math.PI * 2); ctx.stroke(); } } ctx.globalAlpha = 1;
  if (state.phase === 'secretEnding') {
    if (secretStartedAt !== null && secretScene(secretStartedAt, now) === 'clash') drawSecretClash(now - secretStartedAt);
    else drawSecretEnding();
  } else { drawFighter(245, 238, '#76839c', '#b8c4d3', '#8067bb', 'SASUKE', true); drawFighter(715, 238, '#d8783b', '#f2b35e', '#1b2032', 'NARUTO', false); }
  ctx.fillStyle = '#fff0bc'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.fillText(state.phase === 'choose' ? '?' : state.cpuMove?.toUpperCase() ?? '?', 812, 93); if (state.phase === 'reveal' || state.phase === 'humanCast' || state.phase === 'humanAttack' || state.phase === 'cpuAttack') ctx.fillText(state.playerMove?.toUpperCase() ?? '', 148, 93);
  if (state.phase === 'humanAttack') drawOrb(470, 265, state.nextJutsu === 'fireball' ? '#f39b45' : '#80d8ff', state.nextJutsu === 'fireball' ? '#ffd9a1' : '#d5fbff', clock); if (state.phase === 'cpuAttack') drawOrb(490, 265, '#66b8ff', '#d5efff', clock);
  ctx.restore();
  requestAnimationFrame(drawArena);
}
function drawSecretEnding(): void {
  ctx.fillStyle = '#4e5669'; ctx.beginPath(); ctx.moveTo(90, 448); ctx.lineTo(210, 388); ctx.lineTo(340, 430); ctx.lineTo(448, 401); ctx.lineTo(575, 446); ctx.lineTo(720, 389); ctx.lineTo(884, 450); ctx.lineTo(884, 540); ctx.lineTo(90, 540); ctx.fill();
  ctx.fillStyle = '#76839c'; ctx.fillRect(220, 410, 165, 28); ctx.fillStyle = '#d8783b'; ctx.fillRect(590, 410, 165, 28); ctx.fillStyle = '#c6ccd3'; ctx.fillRect(270, 425, 42, 18); ctx.fillStyle = '#e9d7c0'; ctx.fillRect(662, 425, 42, 18); ctx.fillStyle = '#ffdb8a'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.fillText('SECRET ENDING', 480, 292); ctx.font = '11px monospace'; ctx.fillText('EXHAUSTED // ARMS WRAPPED', 480, 316);
}
function drawSecretClash(elapsed: number): void {
  drawFighter(245 + Math.min(90, elapsed / 4), 238, '#76839c', '#b8c4d3', '#8067bb', 'SASUKE', true);
  drawFighter(715 - Math.min(90, elapsed / 4), 238, '#d8783b', '#f2b35e', '#1b2032', 'NARUTO', false);
  drawOrb(440, 280, '#80d8ff', '#d5fbff', elapsed);
  drawOrb(520, 280, '#66b8ff', '#d5efff', elapsed);
  ctx.strokeStyle = '#fff0bc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(458, 280); ctx.lineTo(502, 280); ctx.stroke();
}
function drawFighter(x: number, y: number, body: string, light: string, accent: string, name: string, facingRight: boolean): void {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#09142188'; ctx.beginPath(); ctx.ellipse(0, 252, 88, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = body; ctx.fillRect(-32, 105, 64, 105); ctx.fillStyle = light; ctx.fillRect(-25, 88, 50, 60); ctx.fillStyle = '#f0c09f'; ctx.fillRect(-21, 52, 42, 42); ctx.fillStyle = accent; ctx.fillRect(-28, 43, 56, 14); ctx.fillRect(-36, 60, 13, 10); ctx.fillStyle = body; ctx.fillRect(-53, 120, 20, 84); ctx.fillRect(33, 120, 20, 84); ctx.fillStyle = accent; ctx.fillRect(-44, 199, 31, 12); ctx.fillRect(14, 199, 31, 12); ctx.fillStyle = '#141825'; ctx.fillRect(facingRight ? 8 : -16, 66, 5, 5); ctx.fillStyle = '#ffe09d'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText(name, 0, -4); ctx.restore();
}
function drawOrb(x: number, y: number, color: string, glow: string, clock: number): void { ctx.save(); ctx.globalAlpha = .75; ctx.shadowBlur = 25; ctx.shadowColor = glow; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 28 + Math.sin(clock / 80) * 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function setState(next: BattleState, reason?: string): void {
  const previous = state; state = next;
  if (state.roundGeneration !== previous.roundGeneration) { audio.stop(); audio.unlock(); }
  if (state.phase === 'secretEnding' && previous.phase !== 'secretEnding') secretStartedAt = performance.now();
  if (state.phase !== 'secretEnding') secretStartedAt = null;
  renderHp(stateEls.playerHp, state.playerHp); renderHp(stateEls.cpuHp, state.cpuHp);
  stateEls.play.disabled = state.phase !== 'menu' && state.phase !== 'ready'; stateEls.replay.disabled = !['victory', 'defeat', 'secretEnding'].includes(state.phase);
  stateEls.rps.querySelectorAll('button').forEach((button) => { (button as HTMLButtonElement).disabled = state.phase !== 'choose'; });
  if (state.phase === 'choose' && state.roundGeneration !== previous.roundGeneration) showRoundCallout(state.roundGeneration);
  if (state.phase === 'humanCast' && previous.phase !== 'humanCast') { hold = { label: null, startedAt: null, progress: 0, completed: false }; holdLastAt = null; void camera.start(state.roundGeneration); stateEls.status.textContent = `${state.nextJutsu.toUpperCase()} sequence • hold each sign for 450ms`; }
  if (state.phase !== 'humanCast' && previous.phase === 'humanCast') camera.stop();
  if ((state.phase === 'humanAttack' || state.phase === 'cpuAttack') && previous.phase !== state.phase) {
    audio.cue('cast'); hitstopAt = performance.now(); hitstopUntil = hitstopAt + 100; shakeUntil = hitstopUntil; const generation = state.roundGeneration; if (pendingAttackTimer !== null) window.clearTimeout(pendingAttackTimer); pendingAttackTimer = window.setTimeout(() => { pendingAttackTimer = null; if (state.roundGeneration !== generation || (state.phase !== 'humanAttack' && state.phase !== 'cpuAttack')) return; audio.cue('hit'); setState(reduceBattle(state, { type: 'resolveAttack', generation, random: Math.random() })); }, 180);
  }
  if (state.phase === 'victory') { stateEls.status.textContent = 'VICTORY // Naruto has fallen'; audio.cue('victory'); }
  else if (state.phase === 'defeat') { stateEls.status.textContent = 'DEFEAT // Naruto wins'; audio.cue('defeat'); }
  else if (state.phase === 'secretEnding') { stateEls.status.textContent = 'SECRET ENDING // The valley falls silent'; audio.cue('secret'); }
  else if (reason) stateEls.status.textContent = reason;
  updatePanel();
}
function showRoundCallout(generation: number): void {
  if (pendingCalloutTimer !== null) window.clearTimeout(pendingCalloutTimer);
  const [round, fight] = calloutEvents();
  stateEls.callout.textContent = `${round.text} ${String(state.round).padStart(2, '0')}`;
  stateEls.callout.classList.remove('show'); void stateEls.callout.offsetWidth; stateEls.callout.classList.add('show');
  pendingCalloutTimer = window.setTimeout(() => {
    pendingCalloutTimer = null;
    if (state.roundGeneration !== generation || state.phase !== 'choose') return;
    stateEls.callout.textContent = fight.text; stateEls.callout.classList.remove('show'); void stateEls.callout.offsetWidth; stateEls.callout.classList.add('show');
  }, fight.delayMs);
}
function updatePanel(): void {
  if (state.phase === 'humanCast') { const sequence = signsByJutsu[state.nextJutsu]; const cards = sequence.map((sign, index) => `<div class="sign-step ${index === state.acceptedSigns ? 'active' : ''}"><b>${index + 1}. ${sign.toUpperCase()}</b><small>${signNotes[sign]}</small>${index < state.acceptedSigns ? ' ✓' : index === state.acceptedSigns ? ' • HOLD 450MS' : ''}</div>`).join(''); stateEls.panelTitle.textContent = 'SEAL SEQUENCE // HOLD'; stateEls.rps.innerHTML = `<div class="signs">${cards}</div><button class="gold" id="cancel-cast">CANCEL CAST</button>`; document.querySelector<HTMLButtonElement>('#cancel-cast')?.addEventListener('click', () => setState(reduceBattle(state, { type: 'cancelCast', generation: state.roundGeneration }), 'Cast cancelled • no damage')); }
  else { stateEls.panelTitle.textContent = 'RPS // CHOOSE'; stateEls.rps.innerHTML = '<button data-move="rock">ROCK</button><button data-move="paper">PAPER</button><button data-move="scissors">SCISSORS</button>'; }
}
function handlePrediction(label: SignLabel | null, confidence: number, time: number, generation: number): void { if (state.phase !== 'humanCast' || generation !== state.roundGeneration) return; const target = signsByJutsu[state.nextJutsu][state.acceptedSigns]; const progressed = advanceSign(hold, holdLastAt, { label, score: confidence, now: time, target }); hold = progressed.hold; holdLastAt = progressed.lastAt; if (hold.completed) { const current = state; hold = { label: null, startedAt: null, progress: 0, completed: false }; holdLastAt = null; setState(reduceBattle(current, { type: 'signAccepted', generation: current.roundGeneration })); } }

stateEls.play.addEventListener('click', () => { audio.unlock(); let next = reduceBattle(state, { type: 'start', generation: state.roundGeneration }); next = reduceBattle(next, { type: 'beginRound', generation: next.roundGeneration, random: Math.random() }); setState(next, 'ROUND 01 // choose your move'); stateEls.callout.textContent = 'ROUND 01'; stateEls.callout.classList.remove('show'); void stateEls.callout.offsetWidth; stateEls.callout.classList.add('show'); if (pendingCalloutTimer !== null) window.clearTimeout(pendingCalloutTimer); pendingCalloutTimer = window.setTimeout(() => { if (state.phase === 'choose') { stateEls.callout.textContent = 'FIGHT'; stateEls.callout.classList.remove('show'); void stateEls.callout.offsetWidth; stateEls.callout.classList.add('show'); } }, 480); });
stateEls.sound.addEventListener('click', () => { const muted = audio.toggle(); stateEls.sound.textContent = `SOUND: ${muted ? 'OFF' : 'ON'}`; });
stateEls.cameraRetry.addEventListener('click', () => { if (state.phase === 'humanCast') { stateEls.cameraStatus.textContent = 'Retrying camera…'; void camera.retry(state.roundGeneration); } else stateEls.cameraStatus.textContent = 'Start a round before using the camera'; });
stateEls.replay.addEventListener('click', () => { if (pendingAttackTimer !== null) window.clearTimeout(pendingAttackTimer); if (pendingCalloutTimer !== null) window.clearTimeout(pendingCalloutTimer); hold = { label: null, startedAt: null, progress: 0, completed: false }; holdLastAt = null; audio.stop(); setState(reduceBattle(state, { type: 'replay', generation: state.roundGeneration }), 'New game ready'); audio.unlock(); });
document.querySelector<HTMLButtonElement>('#back')?.addEventListener('click', () => { camera.stop('Camera paused'); if (pendingAttackTimer !== null) window.clearTimeout(pendingAttackTimer); if (pendingCalloutTimer !== null) window.clearTimeout(pendingCalloutTimer); setState(reduceBattle(state, { type: 'back', generation: state.roundGeneration }), 'Press PLAY to enter the arena.'); });
stateEls.rps.addEventListener('click', (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-move]'); const move = button?.dataset.move as Move | undefined; if (!move || state.phase !== 'choose') return; audio.cue('select'); const generation = state.roundGeneration; setState(reduceBattle(state, { type: 'chooseMove', generation, move }), 'REVEAL // both moves locked'); setTimeout(() => { if (state.roundGeneration !== generation || state.phase !== 'reveal') return; audio.cue('reveal'); setState(reduceBattle(state, { type: 'resolveReveal', generation, random: Math.random() })); }, 420); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { camera.stop('Camera paused while tab is hidden'); if (pendingAttackTimer !== null) window.clearTimeout(pendingAttackTimer); if (pendingCalloutTimer !== null) window.clearTimeout(pendingCalloutTimer); hold = { label: null, startedAt: null, progress: 0, completed: false }; holdLastAt = null; audio.stop(); if (!['menu', 'victory', 'defeat', 'secretEnding'].includes(state.phase)) setState(reduceBattle(state, { type: 'invalidate', generation: state.roundGeneration }), 'Tab hidden • round paused safely'); } });
renderHp(stateEls.playerHp, state.playerHp); renderHp(stateEls.cpuHp, state.cpuHp); updatePanel(); void loadAssetManifest().then(async (manifest) => { assetManifest = manifest; valleyImage = await loadOptionalImage(assetManifest, 'valley-background'); }); requestAnimationFrame(drawArena);
