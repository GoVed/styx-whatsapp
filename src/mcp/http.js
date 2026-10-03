import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleJsonRpc, SERVER_INFO } from './server.js';
import { getBridge } from '../bridge/index.js';
import { findStickers, getAllStickers, listCategories } from '../stickers/search.js';
import { handleImportChatExport } from './handlers/chat-export.js';
import { renderQrPage } from './qr-template.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates and configures the Express application for MCP HTTP transport & management.
 * @param {import('../bridge/base.js').WhatsAppBridgeBase} bridge
 * @param {import('../webhook/relay.js').SyndaeRelay} [relay]
 * @returns {import('express').Express}
 */
export function createHttpApp(bridge, relay = null) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.text({ limit: '50mb' }));

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Syndae-Access-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // MCP JSON-RPC 2.0 Handler (compatible with Syndae McpTransport::connect_http)
  const jsonRpcHandler = async (req, res) => {
    try {
      const resp = await handleJsonRpc(req.body, bridge);
      if (resp) {
        return res.json(resp);
      }
      return res.status(204).end();
    } catch (err) {
      logger.error({ err }, 'Error in HTTP JSON-RPC handler');
      return res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: err.message }
      });
    }
  };

  app.post('/', jsonRpcHandler);
  app.post('/mcp', jsonRpcHandler);

  // Health and Status check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      mode: bridge.getStatus().mode,
      bridgeStatus: bridge.getStatus().status,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/instructions', (req, res) => {
    try {
      const p = path.resolve(__dirname, '../../instructions.md');
      if (fs.existsSync(p)) {
        return res.json({
          success: true,
          name: 'whatsapp',
          title: 'Skillset: WhatsApp Connector & Messaging Integration',
          instructions: fs.readFileSync(p, 'utf8')
        });
      }
      return res.status(404).json({ success: false, error: 'instructions.md not found' });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/status', (req, res) => {
    res.json({
      server: SERVER_INFO,
      bridge: bridge.getStatus(),
      history: bridge.getHistory(10),
      relay: relay ? relay.getStats() : null,
      config: {
        mode: config.mode,
        syndaeApiUrl: config.syndaeApiUrl,
        hasSyndaeAccessKey: Boolean(config.syndaeAccessKey),
        httpPort: config.httpPort,
        httpHost: config.httpHost
      }
    });
  });

  // Syndae Session cache inspect and clear endpoints
  app.get('/sessions', (req, res) => {
    if (!relay) {
      return res.status(404).json({ success: false, error: 'Relay not attached to HTTP server' });
    }
    res.json({
      success: true,
      count: relay.sessions.size,
      sessions: Object.fromEntries(relay.sessions)
    });
  });

  app.post('/sessions/clear', (req, res) => {
    if (!relay) {
      return res.status(404).json({ success: false, error: 'Relay not attached to HTTP server' });
    }
    relay.clearSessions();
    res.json({ success: true, message: 'Sessions cache cleared successfully' });
  });

  // Live QR data polling endpoint
  app.get('/qr/raw', async (req, res) => {
    const status = bridge.getStatus();
    let qrDataUrl = null;
    if (bridge.latestQr) {
      try {
        qrDataUrl = await QRCode.toDataURL(bridge.latestQr, { margin: 2, scale: 8 });
      } catch (err) {
        logger.debug({ err: err.message }, 'Failed to generate QR data URL');
      }
    }

    res.json({
      status: status.status,
      mode: status.mode,
      connected: status.status === 'connected',
      user: bridge.userInfo,
      qr: bridge.latestQr,
      qrDataUrl
    });
  });

  // Static media route for downloaded inbound images and stickers
  const mediaDir = config.mediaDir || path.join(config.authDir, 'media');
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }
  app.use('/media', express.static(mediaDir));

  // Browser / Mobile QR Pairing Page
  app.get('/qr', async (req, res) => {
    const status = bridge.getStatus();

    // If bridge is disconnected, automatically trigger connect()!
    if (status.status === 'disconnected') {
      bridge.connect().catch((err) => logger.debug({ err: err.message }, 'Auto-reconnect on /qr visit'));
    }

    let initialQrUrl = '';
    if (bridge.latestQr) {
      try {
        initialQrUrl = await QRCode.toDataURL(bridge.latestQr, { margin: 2, scale: 8 });
      } catch {}
    }

    return res.send(renderQrPage(status, initialQrUrl, bridge.latestQr || ''));
  });

  // REST Stickers helper
  app.get('/stickers', (req, res) => {
    const { search, query, category, limit } = req.query;
    const q = search || query || '';
    if (q) {
      const results = findStickers({
        search: q,
        category: category || null,
        limit: limit ? parseInt(limit, 10) : 10
      });
      return res.json({ query: q, count: results.length, stickers: results });
    }
    return res.json({
      count: getAllStickers().length,
      categories: listCategories(),
      stickers: getAllStickers()
    });
  });

  // REST Trigger endpoint (simulate incoming message via HTTP)
  app.post('/trigger', (req, res) => {
    const { from, message, sender_name, senderName, is_group, isGroup } = req.body || {};
    if (!from || !message) {
      return res.status(400).json({
        error: 'Missing required fields: "from" and "message"'
      });
    }

    let dispatched;
    if (typeof bridge.simulateInboundMessage === 'function') {
      dispatched = bridge.simulateInboundMessage({
        from,
        message,
        senderName: sender_name || senderName || 'Alice',
        isGroup: Boolean(is_group || isGroup)
      });
    } else {
      dispatched = {
        from: from.replace(/@.*$/, ''),
        senderJid: bridge.formatJid(from),
        senderName: sender_name || senderName || 'Alice',
        message,
        messageId: `HTTP_SIM_${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
        isGroup: Boolean(is_group || isGroup),
        chatJid: bridge.formatJid(from)
      };
      bridge.emit('message', dispatched);
    }

    return res.json({
      success: true,
      simulated_event: dispatched
    });
  });

  // WhatsApp Chat Export Ingestion endpoint
  const handleExportImport = async (req, res) => {
    try {
      const args = typeof req.body === 'string' ? { content: req.body } : (req.body || {});
      const result = await handleImportChatExport(args, bridge);
      const parsed = JSON.parse(result.content[0].text);
      return res.json(parsed);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  };

  app.post('/import-export', handleExportImport);
  app.post('/export/import', handleExportImport);

  return app;
}

/**
 * Starts the HTTP server on configured port and host.
 * @param {object} [options]
 * @param {number} [options.port]
 * @param {string} [options.host]
 * @param {'live' | 'mock'} [options.mode]
 * @returns {Promise<{ server: import('node:http').Server, app: import('express').Express, port: number, host: string }>}
 */
export async function startHttpServer(options = {}) {
  const port = options.port || config.httpPort;
  const host = options.host || config.httpHost;
  const mode = options.mode || config.mode;

  const bridge = options.bridge || getBridge(mode);
  if (bridge.status === 'disconnected') {
    await bridge.connect().catch(err => {
      logger.error({ err }, 'Failed to connect bridge during HTTP server startup');
    });
  }

  const relay = options.relay || null;
  const app = createHttpApp(bridge, relay);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      logger.info(
        { port, host, mode },
        `Syndae WhatsApp MCP HTTP Server listening at http://${host}:${port}`
      );
      resolve({ server, app, port, host, bridge, relay });
    });

    server.on('error', (err) => {
      logger.error({ err, port, host }, 'HTTP server listen error');
      reject(err);
    });
  });
}

export default {
  createHttpApp,
  startHttpServer
};
