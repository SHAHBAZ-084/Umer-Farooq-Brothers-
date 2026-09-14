/**
 * Build Windows/desktop icons from frontend/public/app-logo.png.
 * Multi-resolution ICO (16–256px) is required for taskbar/desktop on Windows.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const pngToIco = (await import('png-to-ico')).default;
  const src = path.join(__dirname, '../frontend/public/app-logo.png');
  const buildDir = path.join(__dirname, '../build');
  const publicDir = path.join(__dirname, '../frontend/public');
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  if (!fs.existsSync(src)) {
    console.error('[generate-icons] Missing frontend/public/app-logo.png');
    process.exit(1);
  }

  fs.mkdirSync(buildDir, { recursive: true });

  // Logo artwork is circular on white — keep white for favicon/taskbar clarity.
  const iconBg = { r: 255, g: 255, b: 255, alpha: 1 };

  const masterPng = await sharp(src)
    .ensureAlpha()
    .resize(512, 512, { fit: 'contain', background: iconBg })
    .flatten({ background: iconBg })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(buildDir, 'icon.png'), masterPng);

  const favicon = await sharp(masterPng)
    .resize(64, 64, { fit: 'contain', background: iconBg })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon);

  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(masterPng)
        .resize(size, size, { fit: 'contain', background: iconBg })
        .png()
        .toBuffer(),
    ),
  );

  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  console.log('[generate-icons] build/icon.png + build/icon.ico + favicon.png', `(${sizes.join(',')}px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
