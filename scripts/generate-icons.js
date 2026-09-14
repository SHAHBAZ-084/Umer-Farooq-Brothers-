/**
 * Build Windows/desktop icons from the app logo.
 * Multi-resolution ICO (16–256px) is required for taskbar/desktop on Windows.
 *
 * Place the new client logo at frontend/public/app-logo.png before running.
 * Until then, existing build/icon.png and build/icon.ico are left unchanged
 * (they still carry the previous client's mark and must be replaced).
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
    console.warn(
      '[generate-icons] No frontend/public/app-logo.png yet — skipping regen. ' +
        'Existing build/icon.* still use the previous client mark; provide new artwork.',
    );
    process.exit(0);
  }

  fs.mkdirSync(buildDir, { recursive: true });

  // Flatten onto brand charcoal so JPEG/partial-alpha sources never leave checkerboard.
  const brandBg = { r: 26, g: 26, b: 26, alpha: 1 };

  const masterPng = await sharp(src)
    .ensureAlpha()
    .resize(512, 512, { fit: 'contain', background: brandBg })
    .flatten({ background: brandBg })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(buildDir, 'icon.png'), masterPng);

  // Browser tab favicon (same mark, smaller).
  const favicon = await sharp(masterPng).resize(64, 64, { fit: 'contain', background: brandBg }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon);

  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(masterPng)
        .resize(size, size, { fit: 'contain', background: brandBg })
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
