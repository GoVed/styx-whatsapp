import { TOOL_DEFINITIONS, executeTool } from './tools.js';
import logger from '../utils/logger.js';

export const PROTOCOL_VERSION = '2024-11-05';
export const SERVER_INFO = {
  name: 'styx-whatsapp',
  version: '1.0.0'
};

/**
 * Handles a JSON-RPC 2.0 request or notification according to MCP 2024-11-05 specification.
 *
 * @param {object} req Parsed JSON-RPC request object
 * @param {import('../bridge/base.js').WhatsAppBridgeBase} bridge
 * @returns {Promise<object|null>} JSON-RPC response object or null for notifications
 */
export async function handleJsonRpc(req, bridge) {
  if (!req || typeof req !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: Request is not a valid JSON object' }
    };
  }

  const { id, method, params } = req;

  // JSON-RPC Notification (no response needed)
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized' || method === 'initialized') {
      logger.debug('Received MCP initialized notification');
    }
    return null;
  }

  try {
    switch (method) {
      case 'initialize': {
        const clientVersion = params?.protocolVersion || PROTOCOL_VERSION;
        logger.info({ clientVersion, client: params?.clientInfo }, 'MCP Client initializing');

        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: SERVER_INFO
          }
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOL_DEFINITIONS
          }
        };
      }

      case 'tools/call': {
        if (!params || !params.name) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Invalid params: "name" is required for tools/call'
            }
          };
        }

        const toolResult = await executeTool(params.name, params.arguments || {}, bridge);
        return {
          jsonrpc: '2.0',
          id,
          result: toolResult
        };
      }

      case 'ping': {
        return {
          jsonrpc: '2.0',
          id,
          result: {}
        };
      }

      default:
        logger.warn({ method }, 'Unknown MCP method received');
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: "${method}"`
          }
        };
    }
  } catch (err) {
    logger.error({ err, method }, 'Internal error handling JSON-RPC request');
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${err.message}`
      }
    };
  }
}

export default {
  handleJsonRpc,
  PROTOCOL_VERSION,
  SERVER_INFO
};
