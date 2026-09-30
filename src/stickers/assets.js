import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard 1x1 transparent WebP image buffer (RFC 6386 / WebP container)
// Used as fallback asset so Baileys sticker pipeline never fails on missing raw binary
const FALLBACK_WEBP_BASE64 = 'UklGRkAAAABXRUJQVlA4IDQAAACyAgCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA/v56QAAAAA==';

function getDefaultFallback() {
  const defaultFallbackPath = path.join(__dirname, 'assets', 'thumbs_up_classic.webp');
  if (fs.existsSync(defaultFallbackPath)) {
    return fs.readFileSync(defaultFallbackPath);
  }
  const catShrugPath = path.join(__dirname, 'assets', 'cat_shrug.webp');
  if (fs.existsSync(catShrugPath)) {
    return fs.readFileSync(catShrugPath);
  }
  return Buffer.from(FALLBACK_WEBP_BASE64, 'base64');
}

/**
 * Returns a valid WebP Buffer for the given sticker ID or file path.
 * If a custom asset or disk file exists, it reads it; otherwise returns default fallback WebP buffer.
 * @param {string} stickerId
 * @returns {Buffer}
 */
export function getStickerBuffer(stickerId) {
  if (!stickerId || typeof stickerId !== 'string') {
    return getDefaultFallback();
  }

  // 1. Direct file path on disk
  if (fs.existsSync(stickerId)) {
    try {
      return fs.readFileSync(stickerId);
    } catch {
      // ignore
    }
  }

  // 2. Named catalog sticker
  const cleanId = stickerId.replace(/\.webp$/, '');
  const customAssetPath = path.join(__dirname, 'assets', `${cleanId}.webp`);
  if (fs.existsSync(customAssetPath)) {
    return fs.readFileSync(customAssetPath);
  }

  return getDefaultFallback();
}

export default {
  getStickerBuffer,
  FALLBACK_WEBP_BASE64
};
