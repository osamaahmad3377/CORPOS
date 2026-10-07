// Ad-hoc signs the macOS app (no Apple Developer certificate needed).
// Without any valid signature, Apple Silicon Macs report a downloaded app as
// "damaged"; ad-hoc signed, they show the normal "Open Anyway" prompt.
// Replace with a real Developer ID identity + notarization when available.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Universal builds pack x64 + arm64 into temp dirs and merge them; sign
  // only the merged app (signing the halves breaks the merge).
  if (/-temp$/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed ${path.basename(app)} (${['ia32', 'x64', 'armv7l', 'arm64', 'universal'][context.arch] || context.arch})`);
};
