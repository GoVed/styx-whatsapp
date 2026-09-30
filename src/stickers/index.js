export * from './search.js';
export * from './assets.js';
import search from './search.js';
import assets from './assets.js';

export default {
  ...search,
  ...assets
};
