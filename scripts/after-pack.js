/**
 * electron-builder afterPack: Prisma unpack + Windows .exe icon (SOLE embed path).
 *
 * We intentionally set `win.signAndEditExecutable: false` in package.json so
 * electron-builder does NOT also rcedit the exe. Builder’s path pulls
 * winCodeSign (symlink extract often fails without admin on Windows) and a
 * second embed would be redundant/conflicting. This hook is the only place
 * that writes build/icon.ico into the packaged .exe — missing ico or rcedit
 * failure MUST fail the build.
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.endsWith('.tmp') || entry.name.includes('.tmp')) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Embed build/icon.ico into the packaged .exe — authoritative Windows icon step. */
async function applyWindowsExeIcon(appOutDir, projectDir, productFilename) {
  const iconPath = path.resolve(projectDir, 'build', 'icon.ico');
  const exePath = path.resolve(appOutDir, `${productFilename}.exe`);

  if (!fs.existsSync(iconPath)) {
    throw new Error(
      `[afterPack] build/icon.ico is missing at ${iconPath}. ` +
        'Run `npm run prepare:icons` before packaging. Refusing to ship without an icon.',
    );
  }
  if (!fs.existsSync(exePath)) {
    throw new Error(`[afterPack] packaged exe missing at ${exePath} — cannot embed icon.`);
  }

  const rcedit = require('rcedit');
  try {
    await rcedit(exePath, {
      icon: iconPath,
      'version-string': {
        ProductName: 'Umer Farooq & Brothers',
        FileDescription: 'Umer Farooq & Brothers',
        CompanyName: 'Umer Farooq & Brothers',
        InternalName: 'UmerFarooqPOS',
        OriginalFilename: 'Umer Farooq & Brothers.exe',
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`[afterPack] rcedit failed embedding icon into ${exePath}: ${detail}`);
  }
  console.log('[afterPack] applied Umer Farooq & Brothers icon to', exePath);
}

exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const resourcesDir = path.join(context.appOutDir, 'resources');
  const source = path.join(projectDir, 'node_modules', '.prisma');

  if (!fs.existsSync(source)) {
    console.warn('[afterPack] node_modules/.prisma missing — run prisma generate');
  } else {
    const targets = [
      path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', '.prisma'),
      path.join(resourcesDir, 'node_modules', '.prisma'),
      path.join(resourcesDir, 'backend', 'node_modules', '.prisma'),
    ];

    for (const dest of targets) {
      copyDir(source, dest);
      console.log('[afterPack] copied .prisma →', dest);
    }
  }

  if (context.electronPlatformName === 'win32') {
    await applyWindowsExeIcon(
      context.appOutDir,
      projectDir,
      context.packager.appInfo.productFilename,
    );
  }
};
