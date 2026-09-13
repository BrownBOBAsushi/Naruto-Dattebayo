// Original synthesized game cues plus sourced, unmodified jutsu callouts.
export class GameAudio {
  constructor(onState = () => {}) {
    this.context = null;
    this.muted = false;
    this.buffers = new Map();
    this.active = new Set();
    this.revision = 0;
    this.onState = onState;
  }
  unlock() {
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === 'suspended') this.context.resume().then(() => this.onState()).catch(() => {});
    this.onState();
  }
  toggle() {
    this.muted = !this.muted;
    if (this.muted) this.cancel(); else this.unlock();
    this.onState();
  }
  get ready() { return !this.muted && this.context?.state === 'running'; }
  cancel() {
    this.revision++;
    for (const source of this.active) { try { source.stop(); } catch {} }
    this.active.clear();
  }
  async load(url) {
    if (!url || !this.context) return null;
    if (!this.buffers.has(url)) {
      const pending = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('Audio unavailable');
          return await this.context.decodeAudioData(await response.arrayBuffer());
        } finally { clearTimeout(timeout); }
      })().catch(() => { this.buffers.delete(url); return null; });
      this.buffers.set(url, pending);
    }
    return this.buffers.get(url);
  }
  track(source) {
    this.active.add(source);
    source.addEventListener('ended', () => { this.active.delete(source); source.disconnect(); }, { once: true });
  }
  weave() {
    if (!this.ready) return;
    const c = this.context, now = c.currentTime;
    const buffer = c.createBuffer(1, Math.floor(c.sampleRate * .12), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass'; filter.frequency.setValueAtTime(1700, now); filter.frequency.exponentialRampToValueAtTime(450, now + .11);
    gain.gain.value = .35;
    source.connect(filter).connect(gain).connect(c.destination);
    this.track(source); source.start(now);
    source.addEventListener('ended', () => { filter.disconnect(); gain.disconnect(); }, { once: true });
  }
  deng(at) {
    const c = this.context;
    for (const [frequency, volume] of [[660,.16],[1324,.065],[1810,.025]]) {
      const source = c.createOscillator(), gain = c.createGain();
      source.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .44);
      source.connect(gain).connect(c.destination);
      this.track(source); source.start(at); source.stop(at + .46);
      source.addEventListener('ended', () => gain.disconnect(), { once: true });
    }
  }
  async complete(url) {
    if (!this.ready) return { played: false, blocked: !this.muted };
    const revision = this.revision;
    const start = this.context.currentTime;
    this.deng(start + .14); // Let the third weave finish first.
    const buffer = await this.load(url);
    if (revision !== this.revision || !this.ready) return { cancelled: true };
    if (!buffer) return { missing: true };
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; gain.gain.value = .8;
    source.connect(gain).connect(this.context.destination);
    this.track(source);
    return new Promise(resolve => {
      source.addEventListener('ended', () => { gain.disconnect(); resolve({ played: true }); }, { once: true });
      source.start(Math.max(this.context.currentTime, start + .65));
    });
  }
}
