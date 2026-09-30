#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import createCli from './cli.js';

export * from './bridge/index.js';
export * from './mcp/index.js';
export * from './stickers/index.js';
export * from './webhook/index.js';
export * from './utils/register.js';
export * from './config.js';

// If run directly via node src/index.js
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const cli = createCli();
  cli.parse(process.argv);
}
