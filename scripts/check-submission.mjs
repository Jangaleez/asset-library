#!/usr/bin/env node
// Checks a pull request's files before they can join the library.
//
//   node scripts/check-submission.mjs --base <dir> --pr <dir> --changes <file>
//
//   --base     checkout of the library as it is now (trusted, used for duplicates)
//   --pr       checkout of the submission
//   --changes  output of `git diff --name-status -z --no-renames` (NUL separated)
//
// Exits 1 if anything blocks the submission. Writes a Markdown report to
// $GITHUB_STEP_SUMMARY when running in GitHub Actions.

import { readFileSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import validator from 'gltf-validator';
import { CONFIG } from './config.mjs';
import { parseGlb, fingerprints, imageMatchesExtension } from './lib/glb.mjs';
import { buildIndex } from './lib/library.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
for (const k of ['base', 'pr', 'changes']) {
  if (!args[k]) {
    console.error(`Missing --${k}`);
    process.exit(2);
  }
}

const errors = []; // block the submission
const warnings = []; // shown to the reviewer, don't block
const passed = [];
const err = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });

// ---------- 1. What changed ----------
const raw = readFileSync(args.changes, 'utf8').split('\0').filter(Boolean);
const changes = [];
for (let i = 0; i < raw.length; i += 2) changes.push({ status: raw[i], path: raw[i + 1] });

if (changes.length === 0) err('submission', 'No files changed.');

const added = [];
for (const { status, path } of changes) {
  if (!path.startsWith(`${CONFIG.assetsDir}/`)) {
    err(path, `Submissions may only add files inside \`${CONFIG.assetsDir}/\`. Changes to anything else must come from a maintainer.`);
  } else if (status !== 'A') {
    err(path, status === 'D' ? 'Submissions cannot delete existing files.' : 'Submissions cannot change existing files — only add new ones.');
  } else {
    added.push(path);
  }
}

// ---------- 2. Folder layout and file types ----------
const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;
const assets = new Map(); // dir -> { category, slug, model, meta, image }

for (const path of added) {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  if (parts.length !== 4) {
    err(path, `Wrong location. Use \`${CONFIG.assetsDir}/<category>/<asset-name>/<file>\`.`);
    continue;
  }
  const [, category, slug] = parts;
  if (!CONFIG.categories.includes(category)) {
    err(path, `Unknown category \`${category}\`. Use one of: ${CONFIG.categories.join(', ')}.`);
    continue;
  }
  if (!SLUG.test(slug)) {
    err(path, `Folder name \`${slug}\` must be 2–61 lowercase letters, numbers and dashes (e.g. \`neon-cat\`).`);
    continue;
  }
  if (name.startsWith('.')) {
    err(path, 'Hidden files are not allowed.');
    continue;
  }
  const dir = parts.slice(0, 3).join('/');
  if (!assets.has(dir)) assets.set(dir, { category, slug, models: [], metas: [], images: [] });
  const a = assets.get(dir);
  const ext = extname(name).toLowerCase();
  if (name === CONFIG.metadataFile) a.metas.push(path);
  else if (CONFIG.modelExtensions.includes(ext)) a.models.push(path);
  else if (CONFIG.imageExtensions.includes(ext)) a.images.push(path);
  else err(path, `File type \`${ext || name}\` is not allowed. Allowed: ${[...CONFIG.modelExtensions, ...CONFIG.imageExtensions].join(', ')} and ${CONFIG.metadataFile}.`);
}

// ---------- 3. Each asset folder ----------
const index = buildIndex(args.base); // fingerprints of the existing library
const seenInPr = [];

for (const [dir, a] of assets) {
  if (existsSync(join(args.base, dir))) {
    err(dir, 'This folder already exists in the library. Pick a different folder name.');
    continue;
  }
  if (a.models.length !== 1) err(dir, `Each asset folder needs exactly one model (.glb or .vrm); found ${a.models.length}.`);
  if (a.metas.length !== 1) err(dir, `Each asset folder needs an \`${CONFIG.metadataFile}\` file.`);
  if (a.images.length > 1) err(dir, 'Only one thumbnail image per asset.');

  const modelPath = a.models[0];
  const imagePath = a.images[0];
  if (a.metas[0]) checkMetadata(a.metas[0], modelPath, imagePath);
  if (imagePath) checkImage(imagePath);
  if (modelPath) await checkModel(modelPath);
}

function checkMetadata(path, modelPath, imagePath) {
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(args.pr, path), 'utf8'));
  } catch (e) {
    return err(path, `Not valid JSON: ${e.message}`);
  }
  if (typeof meta !== 'object' || Array.isArray(meta) || meta === null) return err(path, 'Must be a JSON object.');

  const str = (k, max, required = true) => {
    const v = meta[k];
    if (v === undefined || v === '') return required ? err(path, `\`${k}\` is required.`) : undefined;
    if (typeof v !== 'string' || v.length > max) err(path, `\`${k}\` must be text up to ${max} characters.`);
  };
  str('name', 80);
  str('creator', 60);
  str('description', 500, false);

  if (meta.licence !== CONFIG.licence) err(path, `\`licence\` must be \`"${CONFIG.licence}"\` — this library only accepts public-domain (CC0) assets.`);
  if (modelPath && meta.model !== basename(modelPath)) err(path, `\`model\` must be the model's file name: \`"${basename(modelPath)}"\`.`);
  if (imagePath && meta.thumbnail !== basename(imagePath)) err(path, `\`thumbnail\` must be the image's file name: \`"${basename(imagePath)}"\`.`);
  if (!imagePath && meta.thumbnail) err(path, `\`thumbnail\` names \`${meta.thumbnail}\` but no image was added.`);
  if (meta.tags !== undefined && (!Array.isArray(meta.tags) || meta.tags.length > 10 || meta.tags.some((t) => typeof t !== 'string' || t.length > 30))) {
    err(path, '`tags` must be a list of up to 10 short words.');
  }
  if (meta.creatorLink !== undefined && !/^https:\/\/[^\s]+$/.test(meta.creatorLink)) err(path, '`creatorLink` must be an https:// link.');

  const known = ['name', 'creator', 'creatorLink', 'description', 'licence', 'model', 'thumbnail', 'tags'];
  const extra = Object.keys(meta).filter((k) => !known.includes(k));
  if (extra.length) warn(path, `Unrecognised fields ignored: ${extra.join(', ')}.`);
}

function checkImage(path) {
  const full = join(args.pr, path);
  const size = statSync(full).size;
  if (size > CONFIG.maxImageBytes) return err(path, `Thumbnail is ${mb(size)}; the limit is ${mb(CONFIG.maxImageBytes)}.`);
  if (!imageMatchesExtension(readFileSync(full), extname(path).toLowerCase())) err(path, 'File contents are not the image type its extension says.');
}

async function checkModel(path) {
  const full = join(args.pr, path);
  const size = statSync(full).size;
  if (size > CONFIG.maxModelBytes) return err(path, `Model is ${mb(size)}; the limit is ${mb(CONFIG.maxModelBytes)}.`);
  const buf = readFileSync(full);

  // Structure: is this really a self-contained GLB?
  const parsed = parseGlb(buf);
  if (!parsed.ok) return err(path, parsed.error);
  const { json } = parsed;
  if (json.asset?.version !== '2.0') return err(path, 'glTF `asset.version` must be "2.0".');
  for (const kind of ['buffers', 'images']) {
    for (const item of json[kind] || []) {
      if (item.uri && !item.uri.startsWith('data:')) {
        err(path, `References an external file (\`${item.uri}\`). Models must be self-contained — embed all textures.`);
      }
    }
  }

  // VRM-specific checks.
  const isVrm = extname(path).toLowerCase() === '.vrm';
  const ext = json.extensions || {};
  if (isVrm && !ext.VRM && !ext.VRMC_vrm) err(path, 'Named .vrm but contains no VRM data. Rename it to .glb.');
  const vrm0Licence = ext.VRM?.meta?.licenseName;
  if (vrm0Licence && vrm0Licence !== 'CC0') {
    warn(path, `The licence embedded in this VRM says \`${vrm0Licence}\`, not CC0. Reviewer: confirm the creator really released it as CC0.`);
  }

  // Full spec validation with the official Khronos validator.
  try {
    const report = await validator.validateBytes(new Uint8Array(buf), {
      uri: basename(path),
      maxIssues: 50,
      externalResourceFunction: () => Promise.reject(new Error('External resources are not allowed.')),
    });
    const n = report.issues.numErrors;
    if (n > 0) {
      const list = report.issues.messages
        .filter((m) => m.severity === 0)
        .slice(0, 5)
        .map((m) => `${m.code}: ${m.message}${m.pointer ? ` (${m.pointer})` : ''}`);
      err(path, `glTF Validator found ${n} error(s):\n${list.map((l) => `    - ${l}`).join('\n')}`);
    } else {
      passed.push(`${path}: valid glTF 2.0${isVrm ? ' / VRM' : ''} (${report.issues.numWarnings} warnings)`);
    }
  } catch (e) {
    err(path, `glTF Validator could not read the file: ${e.message || e}`);
  }

  // Duplicate detection against the library and the rest of this submission.
  const fp = fingerprints(buf, parsed);
  for (const other of [...index, ...seenInPr]) {
    if (fp.fileHash === other.fileHash) {
      err(path, `Identical to \`${other.path}\` which is already ${other.inPr ? 'in this submission' : 'in the library'}.`);
    } else if (fp.dataHash && fp.dataHash === other.dataHash) {
      err(path, `Same model as \`${other.path}\` — only the name or metadata has been changed.`);
    } else if (fp.geometryHash && fp.geometryHash === other.geometryHash) {
      warn(path, `Same mesh as \`${other.path}\` but with different textures or materials. Probably a recolour — reviewer decides if it's different enough.`);
    }
  }
  seenInPr.push({ path, inPr: true, ...fp });
}

// ---------- 4. Report ----------
function mb(n) {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const lines = [];
lines.push(errors.length ? '## ❌ Submission blocked' : '## ✅ Submission passed automated checks');
lines.push('');
if (errors.length) {
  lines.push('### Problems to fix');
  for (const e of errors) lines.push(`- **${e.where}** — ${e.msg}`);
  lines.push('');
}
if (warnings.length) {
  lines.push('### For the reviewer');
  for (const w of warnings) lines.push(`- **${w.where}** — ${w.msg}`);
  lines.push('');
}
if (passed.length) {
  lines.push('### Passed');
  for (const p of passed) lines.push(`- ${p}`);
  lines.push('');
}
lines.push(`Checked ${added.length} new file(s) in ${assets.size} asset folder(s) against ${index.length} model(s) already in the library.`);

const report = lines.join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exit(errors.length ? 1 : 0);
