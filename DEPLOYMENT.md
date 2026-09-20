# Deployment

GitHub Actions builds **Windows**, **macOS** (Apple Silicon DMG), and **Linux** (AppImage) when you push a version tag.

A normal `git push` does **not** create a release.

## 1. Pull

```sh
git pull
```

## 2. Bump the version (if this is a new release)

Set the same version in:

- `backend/tauri.conf.json`
- `backend/Cargo.toml`
- `frontend/package.json`

Example: `0.1.3` → `0.1.4`

## 3. Commit and push the code

```sh
git add .
git commit -m "Release v0.1.4"
git push
```

## 4. Tag and push the tag

The tag must match the version, with a `v` prefix.

```sh
git tag v0.1.4
git push origin v0.1.4
```

## 5. Wait for CI

1. Open **Actions** → **Build and Release**
2. Wait until all three platform jobs are green
3. Download installers from **Releases**

| Platform | File |
|----------|------|
| Windows | `Arcane-Webb-Apps-*-windows-setup.exe` |
| macOS | `Arcane-Webb-Apps-*-macos.dmg` |
| Linux | `Arcane-Webb-Apps-*-linux.AppImage` |

Builds are unsigned. Windows: **More info → Run anyway**. macOS: control-click → **Open**. Linux: `chmod +x` the AppImage, then run it.

## Notes

- Next release: bump the number (`v0.1.5`, `v0.2.0`, …)
- Do not reuse a tag that already exists
- To test a build without a release: **Actions → Build and Release → Run workflow**
