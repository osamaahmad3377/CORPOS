// Build for Windows 7, 8 and 8.1 (32-bit and 64-bit).
// Electron 23+ needs Windows 10, and PHP 8.3+ needs Windows 8, so this build
// uses Electron 22 (the last for Windows 7/8) and PHP 8.2 (the backend's
// packages are pinned to run on PHP 8.2). Everything else is the same app.
//
//   electron-builder --config build/legacy.config.cjs --win nsis --x64
//   electron-builder --config build/legacy.config.cjs --win nsis --ia32
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
  nsis: { ...base.nsis, artifactName: 'CorePOS-Setup-${version}-Windows7-8-${arch}.${ext}' },
};
