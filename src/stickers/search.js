import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOG_PATH = path.join(__dirname, 'catalog.json');

let catalogCache = null;

/**
 * Loads the sticker catalog from disk or cache.
 * @returns {Array<object>}
 */
export function loadCatalog() {
  if (catalogCache) return catalogCache;
  try {
    if (fs.existsSync(CATALOG_PATH)) {
      const data = fs.readFileSync(CATALOG_PATH, 'utf8');
      catalogCache = JSON.parse(data);
    } else {
      catalogCache = [];
    }
  } catch (err) {
    logger.error({ err }, 'Failed to load sticker catalog');
    catalogCache = [];
  }
  return catalogCache;
}

/**
 * Clears cached catalog (useful for reload / tests).
 */
export function reloadCatalog() {
  catalogCache = null;
  return loadCatalog();
}

/**
 * Tokenizes and normalizes an input string.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Computes match score for a sticker against query tokens and normalized query.
 * @param {object} sticker
 * @param {string} rawQuery
 * @param {string[]} tokens
 * @returns {number}
 */
function calculateScore(sticker, rawQuery, tokens) {
  const normQuery = rawQuery.toLowerCase().trim();
  const stickerId = (sticker.id || '').toLowerCase();
  const name = (sticker.name || '').toLowerCase();
  const category = (sticker.category || '').toLowerCase();
  const emotionalContext = (sticker.emotional_context || '').toLowerCase();
  const description = (sticker.description || '').toLowerCase();
  const tags = (sticker.tags || []).map(t => String(t).toLowerCase());

  let score = 0;

  // 1. Direct ID matches
  if (stickerId === normQuery) {
    score += 150;
  } else if (stickerId.includes(normQuery)) {
    score += 60;
  }

  // 2. Full phrase in name or emotional context
  if (name.includes(normQuery)) {
    score += 80;
  }
  if (emotionalContext.includes(normQuery)) {
    score += 70;
  }

  // 3. Exact tag match
  for (const tag of tags) {
    if (tag === normQuery) {
      score += 75;
    } else if (tag.includes(normQuery) || normQuery.includes(tag)) {
      score += 35;
    }
  }

  // 4. Token-by-token scoring
  for (const token of tokens) {
    if (stickerId.includes(token)) score += 25;
    if (name.includes(token)) score += 20;
    if (category === token) score += 30;
    if (emotionalContext.includes(token)) score += 25;
    if (description.includes(token)) score += 10;

    for (const tag of tags) {
      if (tag === token) {
        score += 30;
      } else if (tag.includes(token)) {
        score += 15;
      }
    }
  }

  return score;
}

/**
 * Finds stickers matching the search query or options.
 * Matches emotional criteria (e.g. "sad cat", "thumbs up", "shrug", "celebrate").
 *
 * @param {string|object} options Query string or options object { query, search, category, limit }
 * @param {number} [defaultLimit=5]
 * @returns {Array<object>}
 */
export function findStickers(options, defaultLimit = 5) {
  const catalog = loadCatalog();

  let query = '';
  let categoryFilter = null;
  let limit = defaultLimit;

  if (typeof options === 'string') {
    query = options;
  } else if (options && typeof options === 'object') {
    query = options.search || options.query || '';
    categoryFilter = options.category || null;
    if (typeof options.limit === 'number' && options.limit > 0) {
      limit = options.limit;
    }
  }

  const tokens = tokenize(query);

  let results = catalog
    .filter(sticker => {
      if (categoryFilter && sticker.category.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }
      return true;
    })
    .map(sticker => {
      const score = calculateScore(sticker, query, tokens);
      return {
        id: sticker.id,
        name: sticker.name,
        category: sticker.category,
        description: sticker.description,
        emotional_context: sticker.emotional_context,
        tags: sticker.tags,
        score
      };
    });

  if (query.trim().length > 0) {
    results = results.filter(s => s.score > 0);
    results.sort((a, b) => b.score - a.score);
  }

  return results.slice(0, limit);
}

/**
 * Retrieves a single sticker by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getSticker(id) {
  if (!id) return null;
  const catalog = loadCatalog();
  const found = catalog.find(s => s.id.toLowerCase() === String(id).toLowerCase().trim());
  return found || null;
}

/**
 * Returns all stickers in the catalog.
 * @returns {Array<object>}
 */
export function getAllStickers() {
  return loadCatalog();
}

/**
 * Returns unique category names.
 * @returns {string[]}
 */
export function listCategories() {
  const catalog = loadCatalog();
  return [...new Set(catalog.map(s => s.category))];
}

export default {
  loadCatalog,
  reloadCatalog,
  findStickers,
  getSticker,
  getAllStickers,
  listCategories
};
