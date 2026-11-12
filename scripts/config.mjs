// Library rules. Edit these to change what the library accepts.
export const CONFIG = {
  // Where assets live, and the allowed category folders inside it.
  assetsDir: 'assets',
  categories: ['avatars', 'characters', 'props', 'environments', 'vehicles', 'animations', 'other'],

  // Allowed file types. Models must be self-contained binary glTF.
  modelExtensions: ['.glb', '.vrm'],
  imageExtensions: ['.png', '.jpg', '.jpeg', '.webp'], // optional thumbnail
  metadataFile: 'asset.json',

  // GitHub blocks pushes of files over 100 MiB, so stay under it.
  maxModelBytes: 95 * 1024 * 1024,
  maxImageBytes: 5 * 1024 * 1024,

  // Every asset must be released under this licence.
  licence: 'CC0-1.0',

  // Branch the gallery and download links point at.
  branch: 'main',
};
