# CC0 Asset Library

A public, community-built library of free 3D models (`.glb` and `.vrm`) for games and animation. Every asset is CC0 — public domain.

- **Browse:** the gallery website (GitHub Pages) lets you spin each model in 3D and download it.
- **Submit:** see [CONTRIBUTING.md](CONTRIBUTING.md).

## How submissions are protected

Nobody can add files directly. Every submission is a pull request, and these checks run automatically before a maintainer reviews it:

| Check | What it stops |
|---|---|
| **Allowlist** | Anything that isn't a `.glb`/`.vrm` model, an `asset.json`, or a thumbnail image. Submissions can only *add* new asset folders — not edit, delete or touch anything outside `assets/`. |
| **Real-format check** | Programs or archives renamed to `.glb`, data hidden after the end of a model, external file references, fake thumbnails. Every byte of the GLB container is accounted for. |
| **Khronos glTF Validator** | Corrupt or malformed models (the official validator from the glTF standards body). |
| **Duplicate detection** | Exact copies of an asset already in the library or in the same submission — **blocked**. Copies where someone only changed the name, author or other metadata — **blocked** (the model data is compared, not just the file). Same mesh with different textures — **flagged for the reviewer** (could be a legitimate recolour). |
| **ClamAV virus scan** | Known malware in any new file, using an up-to-date virus database. |
| **Licence check** | `asset.json` must declare CC0. VRMs whose own embedded licence says something else are flagged. |

The checker always runs from `main`, never from the pull request, so a submitter can't edit the checks to let their files through. Submissions from forks get a read-only token and no secrets.

## Setting it up (one time)

1. **Create the repository** on GitHub (e.g. `asset-library`), public, and push these files to `main`:
   ```
   git init -b main
   git add .
   git commit -m "Set up asset library"
   git remote add origin https://github.com/<you>/asset-library.git
   git push -u origin main
   ```
2. **Turn on the gallery:** *Settings → Pages → Build and deployment → Source:* **GitHub Actions**. The "Publish gallery" workflow then deploys on every push to `main` (run it once by hand from the *Actions* tab the first time).
3. **Make the checks mandatory:** *Settings → Rules → Rulesets → New branch ruleset*, target `main`, and enable:
   - *Require a pull request before merging* — set required approvals to **0** (GitHub won't let you approve your own PRs; outsiders still can't merge, so you remain the gatekeeper)
   - *Require status checks to pass* → add **check**
   - *Block force pushes*
   - Under *Bypass list*, add **Repository admin** and set it to **For pull requests only** — this lets you merge your own maintenance changes (which the submission check rejects by design)
4. **Require approval before running workflows from strangers:** *Settings → Actions → General → Approval for running fork pull request workflows* → **Require approval for all external contributors**. You'll click "Approve and run" on each new submission — a quick glance first stops spam from using your Actions minutes.

## Reviewing a submission

1. Open the pull request → *Checks* → **check** → *Summary*. You'll see ✅/❌, any **"For the reviewer"** notes (possible recolours, licence mismatches) and the ClamAV result.
2. Glance at the model: download it from the PR's *Files changed* tab and drop it into a browser viewer such as [gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com) (works for VRM too).
3. Merge. The gallery updates within a couple of minutes.

## Making maintainer changes

Changes outside `assets/` (scripts, website, docs) or fixes to existing assets go through a pull request like everything else. The submission check will fail on purpose, because only new asset folders are allowed from submitters. Thanks to the bypass list, you'll see a **"Merge without waiting for requirements to be met (bypass rules)"** tickbox on the PR — tick it and merge. Only you can see that option.

## Limits

- GitHub blocks files over 100 MB, so models are capped at 95 MB (25 MB through the website uploader).
- GitHub recommends repositories stay under about 5 GB. If the library grows beyond that, large packs can move to GitHub Releases.
- Downloads come straight from `raw.githubusercontent.com` — fine for a community library; if a file ever goes viral, GitHub may rate-limit it.

## Changing the rules

Everything adjustable — categories, allowed file types, size limits, licence — is in [`scripts/config.mjs`](scripts/config.mjs). After changing anything, run the self-test:

```
npm install
npm test          # 22 scenarios: valid files, clones, renamed .exe files, hidden data, etc.
npm run preview   # gallery at http://localhost:8080/site/ using your local assets
```
