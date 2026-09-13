import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('temporary asset manifest', () => {
  it('keeps the complete fixed-facing inventory relative and visibly pending', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8')) as { status: string; items: Array<{ id: string; file: string; frames: number; dimensions: number[]; fps: number; facing: string; pivot: number[]; trimmed: boolean; source: string; phaseMapping?: { charge: number[]; release: number[] } }> };
    expect(manifest.status).toBe('temporary-greybox');
    expect(manifest.items.length).toBeGreaterThanOrEqual(22);
    for (const item of manifest.items) {
      expect(item.file.startsWith('/')).toBe(false); expect(item.frames).toBeGreaterThan(0); expect(item.dimensions).toHaveLength(2); expect(item.pivot).toHaveLength(2); expect(item.source).toBe('pending-gpt-image-2.5');
    }
    expect(manifest.items.map((item) => item.id)).toEqual(expect.arrayContaining(['sasuke-idle', 'naruto-idle', 'fireball-vfx', 'chidori-vfx', 'rasengan-vfx', 'valley-background', 'ending-secret']));
    for (const id of ['fireball-vfx', 'chidori-vfx', 'rasengan-vfx']) {
      const item = manifest.items.find((entry) => entry.id === id)!;
      expect(item.phaseMapping).toEqual({ charge: [0, 1], release: [2, 3] });
    }
  });
});
