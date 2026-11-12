# Submitting an asset

Thanks for sharing! Everything in this library is **CC0 (public domain)** — anyone can use it for anything, with no credit required. Only submit models you made yourself (or that are already CC0).

## What's accepted

| File | Rules |
|---|---|
| Model | One `.glb` or `.vrm` per asset, under 95 MB, with all textures embedded (no separate `.bin` or image files) |
| `asset.json` | Required — describes the asset (see below) |
| Thumbnail | Optional — one `.png`, `.jpg` or `.webp`, under 5 MB |

Anything else (zips, `.fbx`, `.blend`, programs, scripts) is rejected automatically.

## Folder layout

```
assets/<category>/<asset-name>/
    my-model.glb        ← or .vrm
    asset.json
    thumb.png           ← optional
```

- **category** — one of: `avatars`, `characters`, `props`, `environments`, `vehicles`, `animations`, `other`
- **asset-name** — lowercase letters, numbers and dashes, e.g. `neon-cat`. Must be a new folder.

## asset.json

```json
{
  "name": "Neon Cat",
  "creator": "YourName",
  "creatorLink": "https://x.com/yourname",
  "description": "Stylised cat avatar with blendshapes.",
  "licence": "CC0-1.0",
  "model": "neon-cat.vrm",
  "thumbnail": "thumb.png",
  "tags": ["cat", "avatar", "stylised"]
}
```

Required: `name`, `creator`, `licence` (must be exactly `"CC0-1.0"`), `model` (the model's file name). The rest are optional — leave out `thumbnail` if you didn't add one.

## How to submit (no Git knowledge needed)

1. On your computer, make a folder named after your asset (e.g. `neon-cat`) and put your model, `asset.json` and thumbnail in it.
2. On this repository's GitHub page, open `assets/` and then your category folder (e.g. `avatars`).
3. Click **Add file → Upload files**.
4. In File Explorer (or Finder), go to the place where you can **see your `neon-cat` folder** — don't open it — and drag **the folder itself** onto the GitHub page.
5. **Check the file list GitHub shows before you continue.** Each file should start with your folder name:

   | ✅ Right — folder name shown | ❌ Wrong — files only |
   |---|---|
   | `neon-cat/neon-cat.vrm` | `neon-cat.vrm` |
   | `neon-cat/asset.json` | `asset.json` |
   | `neon-cat/thumb.png` | `thumb.png` |

   If you see the ❌ version, you dragged the files from *inside* the folder. Remove them (the ✕ next to each file) and drag the folder instead.

   Also watch for a doubled folder like `neon-cat/neon-cat/asset.json` — that happens after unzipping. Drag the *inner* folder.
6. Choose **Create a new branch for this commit and start a pull request**, click **Propose changes**, then **Create pull request**. GitHub makes your own copy (a fork) automatically — that's normal.

> The website uploader handles files up to 25 MB. For bigger models, use Git or GitHub Desktop.
>
> If dragging a folder doesn't work in your browser, try Chrome or Edge, which keep folder structure on upload.

## What happens next

Automatic checks run on your pull request within a few minutes:

- **File check** — only allowed types, in the right place
- **Model check** — the file must really be a glTF/VRM model (renamed files and hidden extra data are caught) and pass the official Khronos glTF Validator
- **Duplicate check** — blocked if the model is already in the library, including copies where only the name or author was changed
- **Virus scan** — every new file is scanned with ClamAV

If something fails, the check's **Summary** page tells you exactly what to fix — push a fix to the same pull request and the checks re-run. Once everything passes, a maintainer reviews it and merges. Your asset appears on the gallery shortly after.
