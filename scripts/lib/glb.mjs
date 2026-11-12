// Strict GLB (binary glTF 2.0) reader and fingerprinting. No dependencies.
import { createHash } from 'node:crypto';

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Parse a GLB strictly. Rejects anything that is not exactly a valid GLB:
 * wrong magic, wrong version, declared length != file size (catches data
 * appended after the model), unknown chunk types, malformed JSON.
 * Returns { ok: true, json, bin } or { ok: false, error }.
 */
export function parseGlb(buf) {
  if (buf.length < 20) return { ok: false, error: 'File is too small to be a GLB model.' };
  const magic = buf.readUInt32LE(0);
  if (magic !== MAGIC) {
    return { ok: false, error: `Not a binary glTF file (header is ${describeHeader(buf)}). The extension does not match the contents.` };
  }
  const version = buf.readUInt32LE(4);
  if (version !== 2) return { ok: false, error: `Unsupported glTF version ${version} (must be 2).` };
  const declared = buf.readUInt32LE(8);
  if (declared !== buf.length) {
    return {
      ok: false,
      error: declared < buf.length
        ? `File has ${buf.length - declared} extra bytes hidden after the end of the model.`
        : 'File is truncated (shorter than its header says).',
    };
  }

  let offset = 12;
  let json = null;
  let bin = null;
  let index = 0;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) return { ok: false, error: 'Malformed chunk header.' };
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + len;
    if (end > buf.length) return { ok: false, error: 'Chunk runs past the end of the file.' };
    if (len % 4 !== 0) return { ok: false, error: 'Chunk length is not 4-byte aligned.' };
    const data = buf.subarray(start, end);

    if (index === 0) {
      if (type !== CHUNK_JSON) return { ok: false, error: 'First chunk must be JSON.' };
      try {
        json = JSON.parse(data.toString('utf8').replace(/[\u0000 ]+$/, ''));
      } catch {
        return { ok: false, error: 'JSON chunk is not valid JSON.' };
      }
    } else if (index === 1 && type === CHUNK_BIN) {
      bin = data;
    } else {
      return { ok: false, error: `Unexpected extra chunk (type 0x${type.toString(16)}). Only one JSON and one BIN chunk are allowed.` };
    }
    offset = end;
    index++;
  }
  if (!json || typeof json !== 'object') return { ok: false, error: 'Missing JSON chunk.' };
  return { ok: true, json, bin };
}

function describeHeader(buf) {
  const head = buf.subarray(0, 4);
  if (head[0] === 0x4d && head[1] === 0x5a) return '"MZ" — a Windows program';
  if (head[0] === 0x50 && head[1] === 0x4b) return '"PK" — a zip archive';
  if (head[0] === 0x7f && head.toString('latin1', 1, 4) === 'ELF') return '"ELF" — a Linux program';
  if (head.toString('latin1', 0, 2) === '#!') return '"#!" — a script';
  const printable = [...head].every((b) => b >= 0x20 && b < 0x7f);
  return printable ? `"${head.toString('latin1')}"` : head.toString('hex');
}

/**
 * Fingerprints for duplicate detection.
 *  - fileHash: the whole file. Same = byte-for-byte identical upload.
 *  - dataHash: the binary chunk (meshes, textures, animations). Same = the
 *    same model with only names/author/metadata edited.
 *  - geometryHash: just the vertex/animation data, ignoring images. Same =
 *    the same mesh with different textures (often a recolour).
 */
export function fingerprints(buf, parsed) {
  const out = { fileHash: sha256(buf), dataHash: null, geometryHash: null };
  if (!parsed?.ok || !parsed.bin) return out;
  out.dataHash = sha256(parsed.bin);

  const { json, bin } = parsed;
  const views = json.bufferViews || [];
  const imageViews = new Set((json.images || []).map((i) => i.bufferView).filter(Number.isInteger));
  const used = new Set();
  for (const acc of json.accessors || []) {
    if (Number.isInteger(acc.bufferView) && !imageViews.has(acc.bufferView)) used.add(acc.bufferView);
    const sparse = acc.sparse;
    if (sparse?.indices && Number.isInteger(sparse.indices.bufferView)) used.add(sparse.indices.bufferView);
    if (sparse?.values && Number.isInteger(sparse.values.bufferView)) used.add(sparse.values.bufferView);
  }
  if (used.size === 0) return out;

  const h = createHash('sha256');
  for (const i of [...used].sort((a, b) => a - b)) {
    const v = views[i];
    if (!v || (v.buffer ?? 0) !== 0) continue; // only the embedded buffer
    const start = v.byteOffset || 0;
    const end = start + (v.byteLength || 0);
    if (end > bin.length) continue;
    const slice = bin.subarray(start, end);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(slice.length);
    h.update(len).update(slice);
  }
  out.geometryHash = h.digest('hex');
  return out;
}

/** Image magic-byte check so a "thumbnail" can't be something else. */
export function imageMatchesExtension(buf, ext) {
  const png = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  if (ext === '.png') return png;
  if (ext === '.jpg' || ext === '.jpeg') return jpg;
  if (ext === '.webp') return webp;
  return false;
}
