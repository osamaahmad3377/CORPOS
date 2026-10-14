#!/bin/zsh
# Build every installer for this version and put them in "<repo>/Version <x.y.z>":
#   Windows (7–11, 32- and 64-bit, one setup), Mac (universal), Linux x64 + arm64.
# Run on a Mac from the desktop folder:  zsh scripts/release.sh
set -u
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
OUT="../Version $VERSION"
UPD="$OUT/Update files (not needed for installing)"
B=./node_modules/.bin/electron-builder
X=-c.win.signAndEditExecutable=false

npm run prepare:app >/dev/null 2>&1 && echo "prepare ok" || { echo "prepare FAILED"; exit 1; }
$B --mac dmg --universal >/dev/null 2>&1 && echo "mac ok" || echo "mac FAILED"
$B --config build/windows-all.config.cjs --win nsis --x64 --ia32 $X >/dev/null 2>&1 && echo "windows ok" || echo "windows FAILED"
$B --linux AppImage --x64 --arm64 >/dev/null 2>&1 && echo "linux ok" || echo "linux FAILED"

mkdir -p "$UPD"
for f in "dist/CorePOS-Setup-$VERSION-Windows.exe" "dist/CorePOS-$VERSION-Mac.dmg" "dist/CorePOS-$VERSION-Linux-x86_64.AppImage" "dist/CorePOS-$VERSION-Linux-arm64.AppImage"; do
  [ -f "$f" ] && mv -f "$f" "$OUT/"
done
for f in dist/*"$VERSION"*.blockmap(N); do mv -f "$f" "$UPD/"; done
echo "copied to $OUT"
echo done
