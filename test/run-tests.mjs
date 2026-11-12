#!/usr/bin/env node
// Self-test for the submission checker: builds fake submissions in temporary
// git repos and confirms each one is passed or blocked as expected.
//   npm test
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- Minimal GLB builder ----
function glb({ name = 'Thing', vrm = false, vrmLicence = 'CC0', shift = 0, image = null, extraBytes = 0 } = {}) {
  // One triangle; `shift` moves a vertex so geometry differs.
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1 + shift, 0]);
  const posBuf = Buffer.from(pos.buffer);
  const parts = [posBuf];
  const json = {
    asset: { version: '2.0', generator: 'test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1 + shift, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBuf.length }],
    buffers: [{ byteLength: 0 }],
  };
  if (image) {
    const off = posBuf.length;
    const img = Buffer.concat([image, Buffer.alloc((4 - (image.length % 4)) % 4)]);
    parts.push(img);
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: image.length });
    json.images = [{ bufferView: 1, mimeType: 'image/png' }];
  }
  if (vrm) {
    json.extensionsUsed = ['VRM'];
    json.extensions = { VRM: { meta: { title: name, author: 'tester', licenseName: vrmLicence } } };
  }
  const bin = Buffer.concat(parts);
  json.buffers[0].byteLength = bin.length;
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBuf, bh, bin, Buffer.alloc(extraBytes, 0x41)]);
}

// 1x1 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c1b1d80000000049454e44ae426082', 'hex');
const PNG2 = Buffer.from(PNG);
PNG2[PNG2.length - 20] ^= 1; // different bytes, still starts with PNG magic

const meta = (model, extra = {}) => JSON.stringify({ name: 'Test', creator: 'tester', licence: 'CC0-1.0', model, tags: ['test'], ...extra }, null, 2);

// ---- Harness ----
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

function scenario(existing, submission, deletes = []) {
  const work = mkdtempSync(join(tmpdir(), 'assetcheck-'));
  const repo = join(work, 'pr');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'config', 'user.name', 't');
  writeFileSync(join(repo, 'README.md'), 'x');
  for (const [p, c] of Object.entries(existing)) put(repo, p, c);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');
  for (const [p, c] of Object.entries(submission)) put(repo, p, c);
  for (const p of deletes) rmSync(join(repo, p));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'pr', '--allow-empty');
  git(repo, 'worktree', 'add', '-q', '--detach', '../base', 'HEAD^1');
  writeFileSync(join(work, 'changes.txt'), execFileSync('git', ['diff', '--name-status', '-z', '--no-renames', 'HEAD^1', 'HEAD'], { cwd: repo }));
  const r = spawnSync('node', [join(root, 'scripts/check-submission.mjs'), '--base', join(work, 'base'), '--pr', repo, '--changes', join(work, 'changes.txt')], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
  rmSync(work, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
}
function put(repo, p, c) {
  mkdirSync(dirname(join(repo, p)), { recursive: true });
  writeFileSync(join(repo, p), c);
}

const base = {
  'assets/props/crate/crate.glb': glb({ name: 'Crate', image: PNG }),
  'assets/props/crate/asset.json': meta('crate.glb'),
  'assets/avatars/robo/robo.vrm': glb({ name: 'Robo', vrm: true, shift: 0.5 }),
  'assets/avatars/robo/asset.json': meta('robo.vrm'),
};

const cases = [
  ['valid new GLB with thumbnail', 0, 'passed automated checks', { 'assets/props/lamp/lamp.glb': glb({ shift: 2 }), 'assets/props/lamp/asset.json': meta('lamp.glb', { thumbnail: 'thumb.png' }), 'assets/props/lamp/thumb.png': PNG }],
  ['valid new VRM', 0, 'valid glTF 2.0 / VRM', { 'assets/avatars/cat/cat.vrm': glb({ vrm: true, shift: 3 }), 'assets/avatars/cat/asset.json': meta('cat.vrm') }],
  ['exact clone of existing asset', 1, 'Identical to `assets/props/crate/crate.glb`', { 'assets/props/crate-copy/crate.glb': base['assets/props/crate/crate.glb'], 'assets/props/crate-copy/asset.json': meta('crate.glb') }],
  ['clone with only metadata renamed', 1, 'only the name or metadata has been changed', { 'assets/avatars/robo2/robo2.vrm': glb({ name: 'My Robot!!', vrm: true, shift: 0.5 }), 'assets/avatars/robo2/asset.json': meta('robo2.vrm') }],
  ['recolour (same mesh, new texture) is flagged not blocked', 0, 'Probably a recolour', { 'assets/props/crate-blue/crate.glb': glb({ name: 'Crate', image: PNG2 }), 'assets/props/crate-blue/asset.json': meta('crate.glb') }],
  ['same file uploaded twice in one PR', 1, 'already in this submission', { 'assets/props/a1/a.glb': glb({ shift: 7 }), 'assets/props/a1/asset.json': meta('a.glb'), 'assets/props/a2/a.glb': glb({ shift: 7 }), 'assets/props/a2/asset.json': meta('a.glb') }],
  ['Windows program renamed to .glb', 1, 'a Windows program', { 'assets/props/evil/evil.glb': Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]), 'assets/props/evil/asset.json': meta('evil.glb') }],
  ['valid model with data hidden after it', 1, 'extra bytes hidden after the end', { 'assets/props/sneaky/s.glb': glb({ shift: 4, extraBytes: 64 }), 'assets/props/sneaky/asset.json': meta('s.glb') }],
  ['disallowed file type', 1, 'is not allowed', { 'assets/props/tool/tool.glb': glb({ shift: 5 }), 'assets/props/tool/asset.json': meta('tool.glb'), 'assets/props/tool/run.exe': Buffer.from('MZ') }],
  ['not CC0', 1, 'licence', { 'assets/props/not-cc0/x.glb': glb({ shift: 6 }), 'assets/props/not-cc0/asset.json': meta('x.glb', { licence: 'CC-BY-4.0' }) }],
  ['missing asset.json', 1, 'needs an `asset.json`', { 'assets/props/nometa/n.glb': glb({ shift: 8 }) }],
  ['plain GLB named .vrm', 1, 'contains no VRM data', { 'assets/avatars/fake/f.vrm': glb({ shift: 9 }), 'assets/avatars/fake/asset.json': meta('f.vrm') }],
  ['VRM claiming non-CC0 inside is flagged', 0, 'not CC0', { 'assets/avatars/lic/l.vrm': glb({ vrm: true, vrmLicence: 'Redistribution_Prohibited', shift: 10 }), 'assets/avatars/lic/asset.json': meta('l.vrm') }],
  ['fake PNG thumbnail', 1, 'not the image type', { 'assets/props/fake-thumb/t.glb': glb({ shift: 11 }), 'assets/props/fake-thumb/asset.json': meta('t.glb', { thumbnail: 'p.png' }), 'assets/props/fake-thumb/p.png': Buffer.from('MZnotapng') }],
  ['touching workflow files', 1, 'may only add files inside', { '.github/workflows/check-assets.yml': 'hacked' }],
  ['adding into an existing asset folder', 1, 'already exists', { 'assets/props/crate/extra.png': PNG }],
  ['unknown category', 1, 'Unknown category', { 'assets/weapons/gun/g.glb': glb({ shift: 12 }), 'assets/weapons/gun/asset.json': meta('g.glb') }],
];

let fail = 0;
for (const [label, code, expect, files] of cases) {
  const r = scenario(base, files);
  const ok = r.code === code && r.out.includes(expect);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      expected exit ${code} containing "${expect}", got ${r.code}:\n${r.out.replace(/^/gm, '      ')}`);
}
{
  const r = scenario(base, {}, ['assets/props/crate/asset.json']);
  const ok = r.code === 1 && r.out.includes('cannot delete');
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  deleting someone else's asset`);
}
console.log(fail ? `\n${fail} test(s) failed` : '\nAll tests passed');
process.exit(fail ? 1 : 0);
