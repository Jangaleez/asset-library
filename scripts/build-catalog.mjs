#!/usr/bin/env node
// Builds site/catalog.json — the list of every asset the gallery shows.
// Run automatically by the "Publish gallery" workflow.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { CONFIG } from './config.mjs';
import { listAssets } from './lib/library.mjs';
import { sha256, parseGlb, fingerprints } from './lib/glb.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function repoName() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execSync('git remote get-url origin', { cwd: root }).toString().trim();
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    if (m) return m[1];
  } catch {}
  return 'OWNER/REPO';
}

const repo = repoName();
// --local: link files relatively so you can preview the gallery with a local web server.
const local = process.argv.includes('--local');
const rawBase = local ? '..' : `https://raw.githubusercontent.com/${repo}/${CONFIG.branch}`;
const items = [];
const dupes = new Map();

for (const a of listAssets(root)) {
  if (!a.files.includes(CONFIG.metadataFile)) continue;
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(root, a.dir, CONFIG.metadataFile), 'utf8'));
  } catch {
    console.warn(`Skipping ${a.dir}: bad ${CONFIG.metadataFile}`);
    continue;
  }
  if (!meta.model || !a.files.includes(meta.model)) {
    console.warn(`Skipping ${a.dir}: model file missing`);
    continue;
  }
  const modelPath = `${a.dir}/${meta.model}`;
  const buf = readFileSync(join(root, modelPath));
  const fp = fingerprints(buf, parseGlb(buf));
  if (fp.dataHash) {
    if (dupes.has(fp.dataHash)) console.warn(`Duplicate model data: ${modelPath} and ${dupes.get(fp.dataHash)}`);
    else dupes.set(fp.dataHash, modelPath);
  }
  items.push({
    id: `${a.category}/${a.slug}`,
    name: meta.name,
    creator: meta.creator,
    creatorLink: meta.creatorLink || null,
    description: meta.description || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    category: a.category,
    format: meta.model.toLowerCase().endsWith('.vrm') ? 'VRM' : 'GLB',
    licence: meta.licence,
    size: statSync(join(root, modelPath)).size,
    sha256: sha256(buf),
    model: `${rawBase}/${encodeURI(modelPath)}`,
    thumbnail: meta.thumbnail && a.files.includes(meta.thumbnail) ? `${rawBase}/${encodeURI(`${a.dir}/${meta.thumbnail}`)}` : null,
    page: `https://github.com/${repo}/tree/${CONFIG.branch}/${encodeURI(a.dir)}`,
  });
}

items.sort((x, y) => x.name.localeCompare(y.name));
const catalog = { repo, categories: CONFIG.categories, generated: new Date().toISOString(), count: items.length, assets: items };
writeFileSync(join(root, 'site/catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`Catalogue built: ${items.length} asset(s) for ${repo}`);
