import { GameAudio } from './game-audio.js';
import './home-music.js';
import { buildTensor, classifyScores } from './probe-core.js';
import { newPractice, detectSign } from './practice-core.js';
const $ = id => document.getElementById(id);
const catalogResponse = await fetch('./data/jutsus.json');
if (!catalogResponse.ok) throw new Error('Could not load the jutsu catalog.');
const catalog = await catalogResponse.json();
const JUTSU = Object.fromEntries(catalog.jutsus.map(jutsu => [jutsu.id, {
  name: jutsu.name, signs: jutsu.handSigns, voice: jutsu.completionSoundtrack,
  speaker: jutsu.completionSoundtrack ? 'Completion audio ready' : 'Completion audio pending',
  type: jutsu.type, element: jutsu.type === 'fire' ? 'fireball' : jutsu.type,
}]));
const ASSETS = 'https://raw.githubusercontent.com/bunkerapps/Jutsu-Hero/10c5a914f9f14b4427d988d253048bf0fae8eb52/public/assets/';
const FILES = { rat:'Ne.jpg', ox:'Ushi.jpg', tiger:'Tora.jpg', hare:'U.jpg', dragon:'Tatsu.jpg', serpent:'Mi.jpg', horse:'Uma.jpg', ram:'Hitsuji.jpg', monkey:'Saru.jpg', bird:'Tori.jpg', dog:'Inu.jpg', boar:'I.jpg' };
const NAMES = { sasuke:'Sasuke Uchiha', naruto:'Naruto Uzumaki' };
let character = 'sasuke';
let state = newPractice();
let running = false;
let stream = null;
let modelPromise = null;
let detector, session, ort;
let generation = 0;
let animationTimer;
let frameHandle;
let lastVideoTime = -1;
let total = 0;
let busy = false;
let cameraWanted = false;
let selectionRevision = 0;
const sound = new GameAudio(updateSoundUi);
function updateSoundUi() {
  $('sound-toggle').textContent = sound.muted ? 'Sound off' : sound.ready ? 'Sound on' : 'Enable sound';
  $('sound-toggle').setAttribute('aria-pressed', String(!sound.muted && sound.ready));
}
function unlockSound(event) {
  if (event?.target?.closest?.('#sound-toggle')) return;
  try { sound.unlock(); sound.load(selected().voice); } catch { $('sound-status').textContent = 'Audio unavailable in this browser.'; }
}
document.addEventListener('pointerdown', unlockSound, { capture: true });
document.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') unlockSound(event); }, { capture: true });
$('sound-toggle').addEventListener('click', () => {
  try {
    if (!sound.context || (!sound.muted && !sound.ready)) sound.unlock(); else sound.toggle();
    sound.load(selected().voice);
  } catch { $('sound-status').textContent = 'Audio unavailable in this browser.'; }
});

function showError(text = '') { $('error').textContent = text; $('error').hidden = !text; }
function selected() { return JUTSU[$('jutsu').value]; }
function renderSigns() {
  $('jutsu-name').textContent = selected().name;
  $('signs').replaceChildren(...selected().signs.map((sign, i) => {
    const li = document.createElement('li');
    li.className = 'sign-card';
    li.innerHTML = `<div class="sign-image"><img src="${ASSETS}art/seals/${FILES[sign]}" alt="${sign} hand sign"></div><div class="sign-meta"><small>0${i+1}</small><strong>${sign}</strong><span class="sign-state">Waiting</span></div><div class="sign-progress"><span></span></div>`;
    li.querySelector('img').addEventListener('error', () => showError('A hand-sign image could not load. Check your connection and reload the page.'));
    return li;
  }));
  updateSigns();
}
function updateSigns() {
  [...$('signs').children].forEach((card,i) => {
    const done = i < state.index;
    const active = i === state.index && !state.completed;
    card.classList.toggle('active',active);
    card.classList.toggle('done',done);
    if (active) card.setAttribute('aria-current','step'); else card.removeAttribute('aria-current');
    card.querySelector('.sign-state').textContent = done ? '✓ Complete' : active ? 'Your next sign' : 'Up next';
    card.querySelector('.sign-progress span').style.width = `${done ? 100 : active ? (state.hold.progress || 0)*100 : 0}%`;
  });
  $('sequence-count').textContent = `${state.index} / 3 complete`;
}
function resetPractice() {
  selectionRevision++;
  sound.cancel();
  running = Boolean(stream);
  state = newPractice();
  clearTimeout(animationTimer);
  $('arena').classList.remove('casting','fireball','earth','water','clone','lightning','wind');
  $('sound-status').textContent = selected().voice ? `${selected().speaker} callout · 3-sign training` : `${selected().speaker} · 3-sign training`;
  sound.load(selected().voice);
  $('action-label').textContent = 'Ready to train.';
  $('action-hint').textContent = 'Complete all three signs to release your jutsu.';
  $('instruction').textContent = stream ? `Hold ${selected().signs[0]} until the card fills, then follow the next sign.` : 'Waiting for your camera…';
  updateSigns();
}
function setCharacter(name) {
  character = name;
  $('sprite').src = `./assets/${name}.png`;
  $('sprite').alt = `${NAMES[name]} in a ready stance`;
  $('character-name').textContent = NAMES[name].toUpperCase();
  document.querySelectorAll('[data-character]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.character === name)));
  resetPractice();
}
async function castJutsu() {
  const revision = selectionRevision;
  const started = performance.now();
  running = false;
  total++;
  $('completed-count').textContent = `${total} jutsu performed`;
  $('instruction').textContent = `${selected().name} released! All three signs complete.`;
  $('action-label').textContent = `${selected().name}!`;
  $('action-hint').textContent = `${NAMES[character]} releases the jutsu.`;
  $('arena').classList.add('casting');
  $('arena').classList.add(selected().element);
  const outcome = await sound.complete(selected().voice);
  if (revision !== selectionRevision) return;
  if (outcome.missing) $('sound-status').textContent = selected().voice ? 'Callout unavailable. Try again.' : selected().speaker;
  if (outcome.blocked) $('sound-status').textContent = 'Tap Enable sound to hear jutsu.';
  animationTimer = setTimeout(resetPractice, Math.max(0, 1800 - (performance.now() - started)));
}
function acceptPrediction(label, score, now, revision) {
  if (!running || revision !== selectionRevision) return;
  const oldIndex = state.index;
  state = detectSign(state,{label,score,now},selected().signs);
  updateSigns();
  if (state.index !== oldIndex) sound.weave();
  if (state.completed) castJutsu();
  else if (state.index !== oldIndex) $('instruction').textContent = `Good. Now hold ${selected().signs[state.index]}.`;
}
async function loadModels() {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    $('camera-message').textContent = 'Loading hand recognition. The first load may take a moment…';
    const [vision, onnx] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/+esm'),
      import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/+esm'),
    ]);
    ort = onnx;
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/';
    ort.env.wasm.numThreads = 1;
    const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm');
    const options = { baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2 };
    let nextDetector;
    try { nextDetector = await vision.HandLandmarker.createFromOptions(files,options); }
    catch { options.baseOptions.delegate = 'CPU'; nextDetector = await vision.HandLandmarker.createFromOptions(files,options); }
    try {
      const response = await fetch(`${ASSETS}seal_classifier.onnx`);
      if (!response.ok) throw new Error('The recognition model is unavailable.');
      session = await ort.InferenceSession.create(await response.arrayBuffer(),{executionProviders:['wasm']});
      detector = nextDetector;
    } catch(error) { nextDetector.close(); throw error; }
  })().catch(error => { modelPromise = null; throw error; });
  return modelPromise;
}
async function startCamera() {
  if (busy || stream || !cameraWanted || document.hidden) return;
  busy = true;
  const current = ++generation;
  $('enable-camera').disabled = true;
  $('enable-camera').textContent = 'Preparing camera…';
  $('camera-status').textContent = 'Loading…';
  showError();
  let acquired;
  try {
    await loadModels();
    if (current !== generation) return;
    $('camera-message').textContent = 'Allow camera access to start practicing.';
    acquired = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'user'},audio:false });
    if (current !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    $('camera').srcObject = stream;
    await $('camera').play();
    if (current !== generation) return;
    lastVideoTime = -1;
    $('camera-placeholder').hidden = true;
    $('live-overlay').hidden = false;
    $('camera-status').textContent = 'Camera live';
    $('camera-message').textContent = 'Keep both hands in frame. Camera processing stays in your browser.';
    resetPractice();
    acquired.getVideoTracks()[0].addEventListener('ended', () => { if(stream === acquired) stopCamera(); });
    frameHandle = requestAnimationFrame(() => processFrame(current));
  } catch(error) {
    acquired?.getTracks().forEach(t => t.stop());
    if (current === generation) {
      stopCamera();
      showError(error.name === 'NotAllowedError' ? 'Camera access was blocked. Allow camera access in your browser, then try again.' : `Could not start recognition: ${error.message}`);
      $('camera-message').textContent = 'Check your camera and connection, then try again.';
    }
  } finally {
    busy = false;
    $('enable-camera').disabled = false;
    $('enable-camera').textContent = 'Retry camera';
    // Re-entering practice during an older pending camera request must still start.
    if (cameraWanted && current !== generation) startCamera();
  }
}
function stopCamera() {
  cameraWanted = false;
  generation++;
  cancelAnimationFrame(frameHandle);
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  $('camera').srcObject = null;
  $('camera-placeholder').hidden = false;
  $('live-overlay').hidden = true;
  $('camera-status').textContent = 'Camera off';
  $('prediction').textContent = 'Show a hand sign';
  $('camera-message').textContent = 'Camera processing stays in your browser. Nothing is recorded or uploaded.';
  resetPractice();
}
async function processFrame(current) {
  if (!stream || current !== generation) return;
  try {
    const video = $('camera');
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const revision = selectionRevision;
      const results = detector.detectForVideo(video,now);
      const hands = (results.landmarks || []).map((landmarks,i) => ({landmarks,handedness:results.handednesses?.[i]?.[0]?.categoryName || ''}));
      let prediction = null;
      if (hands.length) {
        const tensor = new ort.Tensor('float32',Float32Array.from(buildTensor(hands)),[1,84]);
        const output = await session.run({[session.inputNames[0]]:tensor});
        prediction = classifyScores(output[session.outputNames[0]].data);
      }
      if (current !== generation || !stream) return;
      $('prediction').textContent = prediction ? `Detected: ${prediction.label}` : hands.length ? 'Adjust your hand sign' : 'Bring both hands into view';
      acceptPrediction(prediction?.label || null,prediction?.score || 0,now,revision);
    }
  } catch(error) {
    if (current === generation) { stopCamera(); showError(`Recognition stopped: ${error.message}. Try enabling your camera again.`); }
    return;
  }
  if (current === generation && stream) frameHandle = requestAnimationFrame(() => processFrame(current));
}
function route() {
  const practice = location.hash === '#practice';
  $('home').hidden = practice;
  $('practice').hidden = !practice;
  if (!practice) stopCamera();
  else { cameraWanted = true; startCamera(); }
  window.scrollTo(0,0);
}
$('enable-camera').addEventListener('click',() => { cameraWanted = true; startCamera(); });
$('stop-camera').addEventListener('click',stopCamera);
$('jutsu').addEventListener('change',() => { resetPractice(); renderSigns(); });
document.querySelectorAll('[data-character]').forEach(b => b.addEventListener('click',() => setCharacter(b.dataset.character)));
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',stopCamera);
document.addEventListener('visibilitychange',() => { if(document.hidden) stopCamera(); });
$('sprite').addEventListener('error',() => showError('The character image could not load. Reload the page to try again.'));
$('jutsu').replaceChildren(...Object.entries(JUTSU).map(([id, jutsu]) => new Option(`${jutsu.type[0].toUpperCase() + jutsu.type.slice(1)} · ${jutsu.name}`, id)));
setCharacter(character);
renderSigns();
route();
