import path from 'node:path';
import config from '../config.js';
import logger from './logger.js';

/**
 * Registers the WhatsApp MCP server into Syndae Agent OS via POST /api/tools/servers.
 *
 * @param {object} [options]
 * @param {string} [options.syndaeUrl]
 * @param {string} [options.accessKey]
 * @param {'stdio' | 'http'} [options.transport='stdio']
 * @param {string} [options.serverName='whatsapp']
 * @param {'live' | 'mock'} [options.mode]
 * @param {number} [options.port]
 * @returns {Promise<object>}
 */
export async function registerWithSyndae(options = {}) {
  const syndaeUrl = (options.syndaeUrl || config.syndaeApiUrl).replace(/\/$/, '');
  const accessKey = options.accessKey !== undefined ? options.accessKey : config.syndaeAccessKey;
  const transport = (options.transport || 'stdio').toLowerCase();
  const serverName = options.serverName || 'whatsapp';
  const mode = options.mode || config.mode;
  const port = options.port || config.httpPort;

  const binPath = path.resolve(config.rootDir, 'bin', 'syndae-whatsapp');

  let requestBody;
  if (transport === 'http') {
    requestBody = {
      name: serverName,
      transport_type: 'http',
      url: `http://${config.httpHost}:${port}/mcp`
    };
  } else {
    requestBody = {
      name: serverName,
      transport_type: 'stdio',
      command: process.execPath, // path to current node binary
      args: [binPath, 'mcp'],
      env: {
        WHATSAPP_MODE: mode,
        WHATSAPP_AUTH_DIR: config.authDir,
        SYNDAE_API_URL: syndaeUrl,
        SYNDAE_ACCESS_KEY: accessKey,
        LOG_LEVEL: 'warn'
      }
    };
  }

  const endpoint = `${syndaeUrl}/api/tools/servers`;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Syndae-WhatsApp-Register/1.0.0'
  };

  if (accessKey) {
    headers['Authorization'] = `Bearer ${accessKey}`;
    headers['X-Syndae-Access-Key'] = accessKey;
  }

  logger.info({ endpoint, transport, serverName }, 'Registering WhatsApp MCP tool with Syndae OS');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000)
    });

    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = `Syndae server registration rejected (HTTP ${response.status}): ${JSON.stringify(responseData)}`;
      logger.error({ status: response.status, responseData }, errorMsg);
      return {
        success: false,
        status: response.status,
        error: errorMsg
      };
    }

    logger.info({ serverName, responseData }, 'Successfully registered WhatsApp MCP Server with Syndae Agent OS!');
    return {
      success: true,
      data: responseData
    };
  } catch (err) {
    const errorMsg = `Failed to connect to Syndae OS at ${endpoint}: ${err.message}`;
    logger.error({ err: err.message }, errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
}

export default {
  registerWithSyndae
};
