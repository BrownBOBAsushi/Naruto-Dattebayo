export interface AssetManifestItem { id: string; file: string; frames: number; dimensions: [number, number]; fps: number; facing: string; pivot: [number, number]; trimmed: boolean; source: string }
export interface AssetManifest { status: string; items: AssetManifestItem[] }

export async function loadAssetManifest(): Promise<AssetManifest | null> {
  try { const response = await fetch('./assets/manifest.json'); if (!response.ok) return null; return await response.json() as AssetManifest; } catch { return null; }
}

export async function loadOptionalImage(manifest: AssetManifest | null, id: string): Promise<HTMLImageElement | null> {
  const item = manifest?.items.find((candidate) => candidate.id === id);
  if (!item || item.source === 'pending-gpt-image-2.5' || item.file.includes('{')) return null;
  try { const image = new Image(); image.src = `./assets/${item.file}`; await image.decode(); return image; } catch { return null; }
}
