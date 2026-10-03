import readline from 'node:readline';
import { handleJsonRpc } from './server.js';
import { getBridge } from '../bridge/index.js';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Starts the MCP Server using stdio transport (Line-delimited JSON-RPC over stdin/stdout).
 * Perfect for direct subprocess integration with Syndae Agent OS (McpTransport::connect_stdio).
 *
 * @param {object} [options]
 * @param {'live' | 'mock'} [options.mode]
 * @returns {Promise<void>}
 */
export async function startStdioServer(options = {}) {
  const mode = options.mode || config.mode;
  logger.info({ mode }, 'Starting Syndae WhatsApp MCP Server (stdio transport)...');

  const bridge = getBridge(mode);
  await bridge.connect().catch(err => {
    logger.error({ err }, 'Failed to initialize bridge during stdio startup');
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      const errResp = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: Invalid JSON' }
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
      return;
    }

    try {
      const resp = await handleJsonRpc(req, bridge);
      if (resp) {
        // Must be a single line followed by newline
        process.stdout.write(JSON.stringify(resp) + '\n');
      }
    } catch (err) {
      logger.error({ err }, 'Error processing stdio JSON-RPC line');
      const errResp = {
        jsonrpc: '2.0',
        id: req?.id ?? null,
        error: { code: -32603, message: `Internal server error: ${err.message}` }
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
    }
  });

  rl.on('close', async () => {
    logger.info('Stdin stream closed, shutting down stdio MCP server');
    await bridge.disconnect().catch(() => {});
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await bridge.disconnect().catch(() => {});
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await bridge.disconnect().catch(() => {});
    process.exit(0);
  });
}

export default {
  startStdioServer
};
