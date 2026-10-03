import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import logger from './utils/logger.js';

// Resolve directory paths relative to package root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Load .env if present
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export const config = {
  // Bridge mode: "live" (Baileys WhatsApp Web socket) or "mock" (offline sandbox)
  mode: process.env.WHATSAPP_MODE || 'mock',

  // Secured session directory
  authDir: path.resolve(ROOT_DIR, process.env.WHATSAPP_AUTH_DIR || './.auth_session'),
  mediaDir: path.resolve(ROOT_DIR, process.env.WHATSAPP_MEDIA_DIR || path.join(process.env.WHATSAPP_AUTH_DIR || './.auth_session', 'media')),

  // Syndae Agent OS integration
  syndaeApiUrl: (process.env.SYNDAE_API_URL || 'http://localhost:3000').replace(/\/$/, ''),
  syndaeAccessKey: process.env.SYNDAE_ACCESS_KEY || '',

  // MCP HTTP Server configuration
  httpPort: parseInt(process.env.HTTP_PORT || '8765', 10),
  httpHost: process.env.HTTP_HOST || '127.0.0.1',

  // Reconnection configuration
  reconnectMaxAttempts: parseInt(process.env.RECONNECT_MAX_ATTEMPTS || '5', 10),
  reconnectIntervalMs: parseInt(process.env.RECONNECT_INTERVAL_MS || '3000', 10),

  // Paths
  rootDir: ROOT_DIR,
  stickersPath: path.join(__dirname, 'stickers', 'catalog.json'),
};

/**
 * Initializes and locks down directory permissions (0700) for security isolation.
 */
export function ensureSecureAuthDir() {
  if (!fs.existsSync(config.authDir)) {
    fs.mkdirSync(config.authDir, { recursive: true, mode: 0o700 });
    logger.debug({ authDir: config.authDir }, 'Created secure WhatsApp session auth directory');
  } else {
    try {
      fs.chmodSync(config.authDir, 0o700);
    } catch {
      // In non-POSIX environments, chmod might be a no-op
    }
  }
}

export default config;
