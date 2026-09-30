import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { stickers } from './svg-templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, 'assets');
const tmpDir = path.join(__dirname, 'tmp_svgs');

if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

async function buildAll() {
  console.log(`Generating ${Object.keys(stickers).length} stickers...`);
  for (const [id, svg] of Object.entries(stickers)) {
    const svgPath = path.join(tmpDir, `${id}.svg`);
    const pngPath = path.join(tmpDir, `${id}.png`);
    const outWebpPath = path.join(assetsDir, `${id}.webp`);

    fs.writeFileSync(svgPath, svg.trim());
    // Convert SVG to clean 512x512 PNG with alpha
    execSync(`magick -background none -density 300 "${svgPath}" -resize 512x512 "${pngPath}"`);

    // Format into standard WhatsApp WebP Sticker with Exif
    const pngBuf = fs.readFileSync(pngPath);
    const sticker = new Sticker(pngBuf, {
      pack: 'Styx Assistant',
      author: 'Styx',
      type: StickerTypes.DEFAULT,
      quality: 90
    });
    const webpBuf = await sticker.toBuffer();
    fs.writeFileSync(outWebpPath, webpBuf);
    console.log(`✓ Generated ${id}.webp (${webpBuf.length} bytes)`);
  }
  // Cleanup tmp svgs
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('All stickers successfully generated with standard WhatsApp WebP + EXIF!');
}

buildAll().catch(err => {
  console.error('Failed generating stickers:', err);
  process.exit(1);
});
