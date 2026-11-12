// Walks the assets folder and builds a duplicate-detection index.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { CONFIG } from '../config.mjs';
import { parseGlb, fingerprints } from './glb.mjs';

/** List every asset folder as { dir, category, slug, files[] } (paths relative to root). */
export function listAssets(root) {
  const base = join(root, CONFIG.assetsDir);
  const out = [];
  if (!existsSync(base)) return out;
  for (const category of readdirSync(base)) {
    const catDir = join(base, category);
    if (!statSync(catDir).isDirectory()) continue;
    for (const slug of readdirSync(catDir)) {
      const dir = join(catDir, slug);
      if (!statSync(dir).isDirectory()) continue;
      const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());
      out.push({ dir: relative(root, dir).split('\\').join('/'), category, slug, files });
    }
  }
  return out;
}

/** Fingerprint every model already in the library. */
export function buildIndex(root) {
  const index = [];
  for (const asset of listAssets(root)) {
    for (const f of asset.files) {
      if (!CONFIG.modelExtensions.includes(extname(f).toLowerCase())) continue;
      const path = `${asset.dir}/${f}`;
      const buf = readFileSync(join(root, path));
      index.push({ path, ...fingerprints(buf, parseGlb(buf)) });
    }
  }
  return index;
}
