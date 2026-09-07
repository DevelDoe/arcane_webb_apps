#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 <version>  (example: $0 0.1.0)" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
tag="v$version"

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required." >&2; exit 1; }
command -v cargo >/dev/null || { echo "Rust/Cargo is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "Node.js/npm is required." >&2; exit 1; }
gh auth status >/dev/null

configured_version="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$root_dir/backend/tauri.conf.json" | head -1)"
if [[ "$configured_version" != "$version" ]]; then
  echo "Version mismatch: tauri.conf.json is $configured_version, requested $version." >&2
  exit 1
fi

if [[ -n "$(git -C "$root_dir" status --porcelain)" ]]; then
  echo "Commit or stash your changes before releasing." >&2
  exit 1
fi

npm --prefix "$root_dir/frontend" install
npm --prefix "$root_dir/frontend" run typecheck

bundle_dir="$root_dir/backend/target/release/bundle"
case "$(uname -s)" in
  Darwin)
    (cd "$root_dir/backend" && cargo tauri build --bundles app)
    architecture="$(uname -m)"
    archive="$bundle_dir/Arcane-Webb-Apps_${version}_macOS_${architecture}.zip"
    ditto -c -k --sequesterRsrc --keepParent \
      "$bundle_dir/macos/Arcane Webb Apps.app" "$archive"
    ;;
  Linux)
    (cd "$root_dir/backend" && cargo tauri build --bundles appimage deb)
    ;;
  MINGW*|MSYS*|CYGWIN*)
    (cd "$root_dir/backend" && cargo tauri build --bundles nsis)
    ;;
  *)
    echo "Unsupported operating system: $(uname -s)" >&2
    exit 1
    ;;
esac

artifacts=()
while IFS= read -r -d '' artifact; do
  artifacts+=("$artifact")
done < <(find "$bundle_dir" -type f \( \
  -name 'Arcane-Webb-Apps_*_macOS_*.zip' -o -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' -o \
  -name '*.msi' -o -name '*-setup.exe' \
\) -print0)

if [[ ${#artifacts[@]} -eq 0 ]]; then
  echo "No installer artifacts found under $bundle_dir." >&2
  exit 1
fi

if gh release view "$tag" >/dev/null 2>&1; then
  gh release upload "$tag" "${artifacts[@]}" --clobber
else
  gh release create "$tag" "${artifacts[@]}" --generate-notes --title "Arcane Webb Apps $version"
fi

echo "Published ${#artifacts[@]} installer(s) to GitHub release $tag."
