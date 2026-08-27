const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'apps/web/public');
const source = path.join(publicDir, 'brand/petmol-logo-official.png');

async function foregroundMask(size) {
  const { data, info } = await sharp(source)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, px = 0; i < data.length; i += 3, px += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const whiteness = Math.min(r, g, b);
    const alpha = Math.max(0, Math.min(255, Math.round((whiteness - 172) * 3.05)));
    const o = px * 4;
    rgba[o] = 255;
    rgba[o + 1] = 255;
    rgba[o + 2] = 255;
    rgba[o + 3] = alpha;
  }

  return sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
}

function iconSvg(size) {
  return Buffer.from(`
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="10%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#31B7FF"/>
      <stop offset="34%" stop-color="#006CEB"/>
      <stop offset="72%" stop-color="#003FAE"/>
      <stop offset="100%" stop-color="#02246F"/>
    </linearGradient>
    <radialGradient id="glow" cx="32%" cy="18%" r="74%">
      <stop offset="0%" stop-color="#E5FBFF" stop-opacity=".46"/>
      <stop offset="42%" stop-color="#50C7FF" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#001F74" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="deep" cx="80%" cy="86%" r="58%">
      <stop offset="0%" stop-color="#001748" stop-opacity=".42"/>
      <stop offset="100%" stop-color="#001748" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="${size * 0.028}" stdDeviation="${size * 0.026}" flood-color="#00194F" flood-opacity=".24"/>
      <feDropShadow dx="0" dy="${size * 0.006}" stdDeviation="${size * 0.006}" flood-color="#FFFFFF" flood-opacity=".28"/>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>
  <rect width="${size}" height="${size}" fill="url(#deep)"/>
  <path d="M ${size * 0.08} ${size * 0.09} C ${size * 0.27} ${size * 0.02}, ${size * 0.53} ${size * 0.01}, ${size * 0.72} ${size * 0.10}" fill="none" stroke="#FFFFFF" stroke-width="${size * 0.035}" stroke-linecap="round" opacity=".16"/>
  <ellipse cx="${size * 0.26}" cy="${size * 0.18}" rx="${size * 0.23}" ry="${size * 0.12}" fill="#FFFFFF" opacity=".10" transform="rotate(-22 ${size * 0.26} ${size * 0.18})"/>
</svg>`);
}

async function writeIcon(target, size) {
  const mask = await foregroundMask(size);
  const shadow = await sharp(mask)
    .modulate({ brightness: 0 })
    .blur(Math.max(1.2, size * 0.012))
    .png()
    .toBuffer();

  const image = await sharp(iconSvg(size))
    .composite([
      { input: shadow, left: 0, top: Math.round(size * 0.018), blend: 'multiply' },
      { input: mask, left: 0, top: 0, blend: 'over' },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await fs.writeFile(path.join(publicDir, target), image);
}

async function main() {
  await writeIcon('icons/icon-512.png', 512);
  await writeIcon('icons/icon-512x512.png', 512);
  await writeIcon('icons/icon-192.png', 192);
  await writeIcon('icons/icon-192x192.png', 192);
  await writeIcon('icons/icon-96x96.png', 96);
  await writeIcon('icons/apple-touch-icon.png', 180);
  await writeIcon('apple-touch-icon.png', 180);
  await writeIcon('favicon.png', 32);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
