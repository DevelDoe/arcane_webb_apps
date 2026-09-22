# Deployment

GitHub Actions builds **Windows**, **macOS** (Apple Silicon DMG), and **Linux** (AppImage) when you push a version tag.

A normal `git push` does **not** create a release.

## One-command release (recommended)

From the repo root:

```bash
git pull
node scripts/release.mjs --version 0.1.4 --publish
```

That bumps the version, commits, tags `v0.1.4`, and pushes. CI then builds the installers.

## Version files

The script keeps these in sync:

- `backend/tauri.conf.json`
- `backend/Cargo.toml`
- `frontend/package.json`

Use a new version each release. Do not reuse a tag that already exists.

## Manual fallback (no `--publish`)

```bash
git pull
node scripts/release.mjs --version 0.1.4
git add backend/tauri.conf.json backend/Cargo.toml frontend/package.json
git commit -m "Release v0.1.4"
git tag -a v0.1.4 -m "Release v0.1.4"
git push
git push origin --follow-tags
```

## Wait for CI

1. Open **Actions** → **Build and Release**
2. Wait until all three platform jobs are green
3. Download installers from **Releases**

| Platform | File |
|----------|------|
| Windows | `Arcane-Web-Apps-*-windows-setup.exe` |
| macOS | `Arcane-Web-Apps-*-macos.dmg` |
| Linux | `Arcane-Web-Apps-*-linux.AppImage` |

Builds are unsigned. Windows: **More info → Run anyway**. macOS: control-click → **Open**. Linux: `chmod +x` the AppImage, then run it.

To test a build without a release: **Actions → Build and Release → Run workflow**.
