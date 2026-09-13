// A direct audio file is configured in data/audio.json; no video or iframe.
const button = document.getElementById('music-toggle');
const music = new Audio();
music.preload = 'auto';
let configured = false;
let enabled = true;
const onHome = () => location.hash !== '#practice' && !document.hidden;
function updateLabel() {
  button.disabled = !configured;
  button.textContent = !configured ? 'Music pending audio' : !enabled ? 'Music off' : music.paused ? 'Enable music' : 'Music on';
  button.setAttribute('aria-pressed', String(configured && enabled && !music.paused));
}
async function syncMusic() {
  if (!configured || !enabled || !onHome()) { music.pause(); updateLabel(); return; }
  try { await music.play(); } catch { /* Autoplay will retry on the next user gesture. */ }
  if (!enabled || !onHome()) music.pause();
  updateLabel();
}
export function stopMusic() { music.pause(); updateLabel(); }
button.addEventListener('click', () => {
  if (music.paused && enabled) syncMusic();
  else { enabled = !enabled; syncMusic(); }
});
for (const event of ['pointerdown','keydown']) document.addEventListener(event, e => {
  if (e.target === button) return;
  if (e.target?.closest?.('a[href="#practice"]')) return;
  if (enabled && music.paused) syncMusic();
}, { capture: true });
window.addEventListener('hashchange', syncMusic);
window.addEventListener('pagehide', stopMusic);
document.addEventListener('visibilitychange', syncMusic);
music.addEventListener('error', () => { button.textContent = 'Music unavailable'; });
fetch('./data/audio.json').then(response => {
  if (!response.ok) throw new Error('Audio configuration unavailable');
  return response.json();
}).then(({ homepageMusic }) => {
  if (homepageMusic.src) {
    configured = true;
    music.src = homepageMusic.src;
    music.loop = homepageMusic.loop !== false;
    music.volume = Math.max(0, Math.min(1, homepageMusic.volume ?? .35));
    enabled = homepageMusic.autoplay !== false;
  }
  syncMusic();
}).catch(() => { button.disabled = true; button.textContent = 'Music configuration unavailable'; });
updateLabel();
