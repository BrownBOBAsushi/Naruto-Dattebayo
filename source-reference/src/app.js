import {
  LABELS,
  advanceHold,
  advanceSequence,
  buildTensor,
  classifyScores,
  createTrialLog,
} from './probe-core.js';

const MODEL_URL = 'https://raw.githubusercontent.com/bunkerapps/Jutsu-Hero/10c5a914f9f14b4427d988d253048bf0fae8eb52/public/assets/seal_classifier.onnx';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const REFERENCE_BASE = 'https://raw.githubusercontent.com/bunkerapps/Jutsu-Hero/10c5a914f9f14b4427d988d253048bf0fae8eb52/public/assets/art/seals/';
const REFERENCE_FILES = { rat: 'Ne.jpg', ox: 'Ushi.jpg', tiger: 'Tora.jpg', hare: 'U.jpg', dragon: 'Tatsu.jpg', serpent: 'Mi.jpg', horse: 'Uma.jpg', ram: 'Hitsuji.jpg', monkey: 'Saru.jpg', bird: 'Tori.jpg', dog: 'Inu.jpg', boar: 'I.jpg' };
const TRIAL_TIMEOUT_MS = 15000;

const $ = (id) => document.getElementById(id);
const els = {
  camera: $('camera'), cameraStatus: $('camera-status'), videoWrap: document.querySelector('.video-wrap'),
  videoPlaceholder: $('video-placeholder'), loadModel: $('load-model'), startCamera: $('start-camera'), stopCamera: $('stop-camera'),
  modelStatus: $('model-status'), errorStatus: $('error-status'), prediction: $('prediction'), predictionScore: $('prediction-score'),
  handCount: $('hand-count'), recentLabels: $('recent-labels'), latency: $('inference-latency'), reference: $('seal-reference'), referenceName: $('reference-name'),
  target: $('target-seal'), choices: [...document.querySelectorAll('.sequence-choice')], startTrial: $('start-trial'), startSingleTrial: $('start-single-trial'), trialStatus: $('trial-status'),
  holdProgress: $('hold-progress'), holdStatus: $('hold-status'), successCount: $('success-count'), elapsed: $('trial-elapsed'), log: $('trial-log'), exportLog: $('export-log'),
};

let ort;
let handLandmarker;
let stream;
let frameHandle;
let lastVideoTime = -1;
let processing = false;
let processingGeneration = 0;
let recent = [];
let hold = { label: null, startedAt: null, progress: 0, completed: false };
let trial = null;
let successCount = 0;
const logs = [];

function showError(message) {
  els.errorStatus.hidden = !message;
  els.errorStatus.textContent = message || '';
}

function setStatus(element, text, tone = 'neutral') {
  element.textContent = text;
  element.dataset.tone = tone;
}

function populateSelect(select, selected) {
  select.replaceChildren(...LABELS.map((label) => {
    const option = new Option(label, label);
    option.selected = label === selected;
    return option;
  }));
}

function updateReference(label) {
  els.reference.src = `${REFERENCE_BASE}${encodeURIComponent(REFERENCE_FILES[label])}`;
  els.reference.alt = `${label} seal reference`;
  els.referenceName.textContent = label[0].toUpperCase() + label.slice(1);
}

function resetReadout() {
  els.prediction.textContent = '—';
  els.predictionScore.textContent = '—';
  els.handCount.textContent = '0';
  els.recentLabels.textContent = '—';
  els.latency.textContent = '— ms';
  els.holdProgress.style.width = '0%';
}

async function loadModel() {
  els.loadModel.disabled = true;
  showError('');
  els.modelStatus.textContent = 'Loading browser libraries and model…';
  try {
    const [{ FilesetResolver, HandLandmarker }, onnx] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/+esm'),
      import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/+esm'),
    ]);
    ort = onnx;
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/';
    ort.env.wasm.numThreads = 1;
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 4, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`Seal classifier request failed (${response.status}).`);
    const modelBuffer = await response.arrayBuffer();
    const session = await ort.InferenceSession.create(modelBuffer, { executionProviders: ['wasm'] });
    handLandmarker.__sealSession = session;
    els.modelStatus.textContent = 'Model loaded. Camera permission is still required to start.';
    els.startCamera.disabled = false;
    els.startTrial.disabled = false;
    els.startSingleTrial.disabled = false;
    setStatus(els.cameraStatus, 'Ready', 'good');
  } catch (error) {
    els.loadModel.disabled = false;
    els.modelStatus.textContent = 'Model did not load.';
    showError(`Could not load the model: ${error.message}`);
  }
}

async function startCamera() {
  if (!handLandmarker) return;
  showError('');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    els.camera.srcObject = stream;
    await els.camera.play();
    els.videoWrap.classList.add('is-live');
    processingGeneration += 1;
    els.startCamera.disabled = true;
    els.stopCamera.disabled = false;
    setStatus(els.cameraStatus, 'Running', 'good');
    frameHandle = requestAnimationFrame(processFrame);
  } catch (error) {
    showError(`Camera could not start: ${error.message}`);
    setStatus(els.cameraStatus, 'Camera error', 'bad');
  }
}

function stopCamera() {
  processingGeneration += 1;
  if (frameHandle) cancelAnimationFrame(frameHandle);
  frameHandle = undefined;
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  els.camera.srcObject = null;
  els.videoWrap.classList.remove('is-live');
  els.startCamera.disabled = !handLandmarker;
  els.stopCamera.disabled = true;
  setStatus(els.cameraStatus, 'Stopped', 'neutral');
  resetReadout();
  recent = [];
  hold = { label: null, startedAt: null, progress: 0, completed: false };
  if (trial) finishTrial(false, 'Stopped');
}

function resultHands(result) {
  return (result.landmarks ?? []).map((landmarks, index) => ({
    landmarks,
    handedness: result.handednesses?.[index]?.[0]?.categoryName ?? '',
  }));
}

async function runClassifier(tensor) {
  const inputName = handLandmarker.__sealSession.inputNames[0];
  const outputName = handLandmarker.__sealSession.outputNames[0];
  const input = new ort.Tensor('float32', Float32Array.from(tensor), [1, 84]);
  const output = await handLandmarker.__sealSession.run({ [inputName]: input });
  return classifyScores(output[outputName].data);
}

function updateTrial(label, score, now) {
  if (!trial) return;
  if (now - trial.startedAt >= TRIAL_TIMEOUT_MS) {
    finishTrial(false, 'Timed out');
    return;
  }
  hold = advanceHold(hold, { label, score, now, target: trial.sequence[trial.sequenceState.index] });
  els.holdProgress.style.width = `${Math.round(hold.progress * 100)}%`;
  els.holdStatus.textContent = `Hold ${trial.sequence[trial.sequenceState.index]} · ${Math.round(hold.progress * 100)}%`;
  if (hold.completed) {
    trial.sequenceState = advanceSequence(trial.sequenceState, trial.sequence[trial.sequenceState.index], trial.sequence);
    if (trial.sequenceState.completed) finishTrial(true, 'Sequence complete');
    else {
      hold = { label: null, startedAt: null, progress: 0, completed: false };
      updateReference(trial.sequence[trial.sequenceState.index]);
      els.holdStatus.textContent = `Hold ${trial.sequence[trial.sequenceState.index]} for about 350 ms.`;
    }
  }
}

function processFrame(now) {
  if (!stream || !handLandmarker || els.camera.readyState < 2) {
    frameHandle = requestAnimationFrame(processFrame);
    return;
  }
  if (!processing && els.camera.currentTime !== lastVideoTime) {
    lastVideoTime = els.camera.currentTime;
    const result = handLandmarker.detectForVideo(els.camera, now);
    const hands = resultHands(result);
    if (!hands.length) {
      recent = [];
      hold = advanceHold(hold, { label: null, score: 0, now, target: trial?.sequence[trial.sequenceState.index] });
      els.prediction.textContent = 'No hand detected';
      els.predictionScore.textContent = '—';
      els.handCount.textContent = '0';
      els.recentLabels.textContent = '—';
      els.latency.textContent = '— ms';
      els.holdProgress.style.width = '0%';
      frameHandle = requestAnimationFrame(processFrame);
      return;
    }
    const started = performance.now();
    const generation = processingGeneration;
    const trialAtInference = trial;
    const trialIdAtInference = trialAtInference?.id;
    processing = true;
    runClassifier(buildTensor(hands)).then((prediction) => {
      if (generation !== processingGeneration || !stream) return;
      const latency = performance.now() - started;
      const label = prediction?.label ?? null;
      recent = [...recent, label].slice(-3);
      els.prediction.textContent = label ?? 'No confident label';
      els.predictionScore.textContent = prediction ? prediction.score.toFixed(3) : '—';
      els.handCount.textContent = String(hands.length);
      els.recentLabels.textContent = recent.map((value) => value ?? '—').join(' · ');
      els.latency.textContent = `${latency.toFixed(1)} ms`;
      if (trialAtInference && trial?.id === trialIdAtInference && now >= trial.startedAt) {
        trial.inferenceMs.push(latency);
        updateTrial(label, prediction?.score ?? 0, now);
      }
    }).catch((error) => {
      if (generation === processingGeneration) showError(`Inference failed: ${error.message}`);
    }).finally(() => {
      processing = false;
      if (stream && generation === processingGeneration) frameHandle = requestAnimationFrame(processFrame);
    });
    return;
  }
  frameHandle = requestAnimationFrame(processFrame);
}

function startTrial(sequence = els.choices.map((choice) => choice.value)) {
  if (!stream) {
    showError('Start the camera before starting a trial.');
    return;
  }
  if (trial) finishTrial(false, 'Restarted');
  trial = { id: `trial-${Date.now()}`, sequence, startedAt: performance.now(), sequenceState: { index: 0, successes: 0, completed: false }, inferenceMs: [] };
  const trialId = trial.id;
  trial.timeoutHandle = window.setTimeout(() => {
    if (trial?.id === trialId) finishTrial(false, 'Timed out');
  }, TRIAL_TIMEOUT_MS);
  hold = { label: null, startedAt: null, progress: 0, completed: false };
  updateReference(sequence[0]);
  setStatus(els.trialStatus, 'Running', 'good');
  els.holdStatus.textContent = `Hold ${sequence[0]} for about 350 ms.`;
  els.elapsed.textContent = '0 ms';
}

function finishTrial(success, reason) {
  if (!trial) return;
  window.clearTimeout(trial.timeoutHandle);
  const endedAt = performance.now();
  const record = createTrialLog({ id: trial.id, sequence: trial.sequence, startedAt: trial.startedAt, endedAt, success, inferenceMs: trial.inferenceMs });
  logs.push(record);
  successCount += success ? 1 : 0;
  els.successCount.textContent = String(successCount);
  els.elapsed.textContent = `${Math.round(record.elapsedMs)} ms`;
  els.holdProgress.style.width = success ? '100%' : '0%';
  els.holdStatus.textContent = `${reason}.`;
  setStatus(els.trialStatus, success ? 'Success' : 'Ended', success ? 'good' : 'bad');
  trial = null;
  renderLog();
}

function renderLog() {
  if (!logs.length) return;
  els.log.replaceChildren(...logs.map((record) => {
    const row = document.createElement('tr');
    const mean = record.inferenceMs.length ? record.inferenceMs.reduce((sum, value) => sum + value, 0) / record.inferenceMs.length : 0;
    row.innerHTML = `<td>${record.sequence.join(' → ')}</td><td>${record.success ? 'Success' : 'Timeout / stopped'}</td><td>${Math.round(record.elapsedMs)} ms</td><td>${mean.toFixed(1)} ms</td>`;
    return row;
  }));
}

function exportLog() {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'seal-probe-trials.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

populateSelect(els.target, 'rat');
els.choices.forEach((choice, index) => populateSelect(choice, ['rat', 'ox', 'tiger'][index]));
updateReference(els.target.value);
els.target.addEventListener('change', () => {
  updateReference(els.target.value);
  if (!trial) els.choices[0].value = els.target.value;
});
els.loadModel.addEventListener('click', loadModel);
els.startCamera.addEventListener('click', startCamera);
els.stopCamera.addEventListener('click', stopCamera);
els.startTrial.addEventListener('click', () => startTrial());
els.startSingleTrial.addEventListener('click', () => startTrial([els.target.value]));
els.exportLog.addEventListener('click', exportLog);
