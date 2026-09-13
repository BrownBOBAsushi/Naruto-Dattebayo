import { mkdirSync, copyFileSync, cpSync, rmSync, readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const { LABELS } = await import('../src/probe-core.js');
const catalog = JSON.parse(readFileSync(new URL('data/jutsus.json', root), 'utf8'));
const ids = new Set();
for (const jutsu of catalog.jutsus) {
  if (!jutsu.id || ids.has(jutsu.id) || !jutsu.name) throw new Error('Jutsu IDs must be unique and names are required.');
  ids.add(jutsu.id);
  if (!['fire','lightning','water','wind','earth'].includes(jutsu.type)) throw new Error(`Invalid type: ${jutsu.id}`);
  if (jutsu.handSigns?.length !== 3 || jutsu.handSigns.some(sign => !LABELS.includes(sign))) throw new Error(`Use three supported signs: ${jutsu.id}`);
  if (jutsu.completionSoundtrack !== null && (typeof jutsu.completionSoundtrack !== 'string' || !existsSync(new URL(jutsu.completionSoundtrack, root)))) throw new Error(`Missing completion audio: ${jutsu.id}`);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'probe.html']) {
  copyFileSync(new URL(file, root), new URL(file, output));
}
cpSync(new URL('src/', root), new URL('src/', output), { recursive: true });
cpSync(new URL('assets/', root), new URL('assets/', output), { recursive: true });

cpSync(new URL('data/', root), new URL('data/', output), { recursive: true });
