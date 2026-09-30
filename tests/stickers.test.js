import assert from 'node:assert/strict';
import {
  findStickers,
  getSticker,
  getAllStickers,
  listCategories,
  getStickerBuffer
} from '../src/stickers/index.js';

console.log('Testing Stickers Module...');

// 1. Catalog loading
const all = getAllStickers();
assert.ok(all.length >= 10, 'Catalog should contain at least 10 stickers');
console.log(`✓ Catalog loaded with ${all.length} stickers`);

// 2. Categories
const categories = listCategories();
assert.ok(categories.includes('cat'), 'Categories must include "cat"');
assert.ok(categories.includes('reaction'), 'Categories must include "reaction"');
console.log(`✓ Categories verified: ${categories.join(', ')}`);

// 3. Search for "sad cat" (matching memory/skills/whatsapp_tone.md)
const sadCatResults = findStickers('sad cat', 5);
assert.ok(sadCatResults.length > 0, 'Should find matches for "sad cat"');
assert.equal(sadCatResults[0].id, 'cat_sad_crying', 'Top result for "sad cat" must be cat_sad_crying');
assert.ok(sadCatResults[0].emotional_context.includes('declining'), 'Emotional context must mention decline');
console.log('✓ "sad cat" search correctly prioritized cat_sad_crying');

// 4. Search for "shrug"
const shrugResults = findStickers('shrug', 3);
assert.ok(shrugResults.length > 0, 'Should find matches for "shrug"');
assert.equal(shrugResults[0].id, 'cat_shrug', 'Top result for "shrug" must be cat_shrug');
console.log('✓ "shrug" search correctly prioritized cat_shrug');

// 5. Search for "celebrate"
const celebrateResults = findStickers('celebrate', 3);
assert.ok(celebrateResults.length > 0, 'Should find matches for "celebrate"');
assert.ok(celebrateResults[0].tags.includes('celebrate'), 'Result should have celebrate tag');
console.log('✓ "celebrate" search verified');

// 6. Category filter
const catOnly = findStickers({ search: '', category: 'cat', limit: 50 });
assert.ok(catOnly.every(s => s.category === 'cat'), 'All filtered stickers must have category "cat"');
console.log(`✓ Category filtering verified (${catOnly.length} cat stickers)`);

// 7. Get single sticker
const specific = getSticker('cat_thumbs_up');
assert.ok(specific, 'Should find cat_thumbs_up');
assert.equal(specific.name, 'Thumbs Up Cat');
console.log('✓ getSticker retrieval verified');

// 8. Sticker Buffer retrieval & verification
const buffer = getStickerBuffer('cat_sad_crying');
assert.ok(Buffer.isBuffer(buffer), 'Sticker buffer must be a valid Buffer');
assert.ok(buffer.length > 5000, 'Buffer must be a real high-res sticker asset (> 5KB)');
assert.equal(buffer.subarray(0, 4).toString(), 'RIFF', 'WebP must start with RIFF header');
assert.equal(buffer.subarray(8, 12).toString(), 'WEBP', 'WebP container must identify as WEBP');
console.log(`✓ WebP sticker asset buffer verified (${buffer.length} bytes, RIFF/WEBP)`);

// 9. Verify cat_shrug sticker buffer (real 512x512 with Exif)
const shrugBuf = getStickerBuffer('cat_shrug');
assert.ok(Buffer.isBuffer(shrugBuf), 'cat_shrug buffer must be valid');
assert.ok(shrugBuf.length > 10000, 'cat_shrug must be a rich sticker asset (> 10KB)');
assert.equal(shrugBuf.subarray(0, 4).toString(), 'RIFF');
console.log(`✓ cat_shrug sticker verified (${shrugBuf.length} bytes)`);

// 10. Unknown sticker fallback returns real non-empty sticker
const unknownBuf = getStickerBuffer('non_existent_sticker');
assert.ok(Buffer.isBuffer(unknownBuf), 'Fallback must return valid Buffer');
assert.ok(unknownBuf.length > 5000, 'Fallback must never return empty 1x1 buffer');
console.log(`✓ Fallback sticker verified (${unknownBuf.length} bytes)`);

console.log('All Sticker Tests Passed Successfully!\n');
