// ONE Windows installer for every Windows PC: Windows 7, 8, 8.1, 10 and 11,
// 32-bit and 64-bit. The installer carries both the 64-bit and the 32-bit
// app and installs the right one by itself.
// Electron 22 is the last Electron that runs on Windows 7/8, and PHP 8.2 the
// last PHP for them (the backend's packages are pinned to PHP 8.2), so this
// build uses those on every Windows version. Everything else is the same app.
//
//   electron-builder --config build/windows-all.config.cjs --win nsis --x64 --ia32
const base = require('../package.json').build;

module.exports = {
  ...base,
  electronVersion: '22.3.27',
  win: {
    ...base.win,
    extraResources: [
      { from: 'resources/php-win7-${arch}', to: 'php' },
      { from: 'resources/vc_redist-${arch}.exe', to: 'vc_redist.exe' },
    ],
  },
  nsis: { ...base.nsis, artifactName: 'CorePOS-Setup-${version}-Windows.${ext}' },
};
