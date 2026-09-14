/**
 * Copy full Electron runtime to build/electron-dev/ and embed app icon.
 * (Copying only electron.exe breaks ICU/resources — the whole dist folder is required.)
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

async function main() {
  const projectDir = path.join(__dirname, '..');
  const iconPath = path.join(projectDir, 'build', 'icon.ico');
  const electronExe = require('electron');
  const electronDir = path.dirname(electronExe);
  const destDir = path.join(projectDir, 'build', 'electron-dev');
  const destExe = path.join(destDir, path.basename(electronExe));

  if (!fs.existsSync(iconPath)) {
    console.error('[prepare-dev-electron] Missing build/icon.ico — run npm run prepare:icons');
    process.exit(1);
  }

  if (!fs.existsSync(destExe)) {
    console.log('[prepare-dev-electron] copying Electron runtime →', destDir);
    copyDir(electronDir, destDir);
  }

  if (process.platform === 'win32') {
    const rcedit = require('rcedit');
    try {
      await rcedit(destExe, {
        icon: path.resolve(iconPath),
        'version-string': {
          ProductName: 'Umer Farooq & Brothers',
          FileDescription: 'Umer Farooq & Brothers',
          CompanyName: 'Umer Farooq & Brothers',
          InternalName: 'UmerFarooqPOS',
          OriginalFilename: 'electron.exe',
        },
      });
      console.log('[prepare-dev-electron] app icon applied to', destExe);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unable to commit') || message.includes('EBUSY')) {
        console.warn(
          '[prepare-dev-electron] icon not updated (close running Electron windows first). Using existing exe.',
        );
      } else {
        throw err;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
