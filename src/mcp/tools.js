import { findStickers, listCategories } from '../stickers/search.js';
import logger from '../utils/logger.js';
import { TOOL_DEFINITIONS } from './definitions.js';
import { handleImportChatExport } from './handlers/chat-export.js';
import { handleGetChatHistory, handleFetchOlderMessages } from './handlers/history.js';

export { TOOL_DEFINITIONS };

/**
 * Normalizes tool names allowing for whatsapp_ prefixes or direct names.
 * @param {string} toolName
 * @returns {string}
 */
export function normalizeToolName(toolName) {
  if (!toolName) return '';
  const cleaned = toolName.toLowerCase().trim();
  if (cleaned.startsWith('whatsapp_')) {
    const stripped = cleaned.replace(/^whatsapp_/, '');
    if (stripped === 'status') return 'get_whatsapp_status';
    if (stripped === 'history') return 'get_chat_history';
    if (stripped === 'chats' || stripped === 'list_chats') return 'list_chats';
    if (stripped === 'fetch_older' || stripped === 'fetch_older_messages' || stripped === 'sync_history') return 'fetch_older_messages';
    if (stripped === 'simulate_inbound') return 'simulate_inbound_message';
    if (stripped === 'import_export' || stripped === 'import_chat' || stripped === 'import_history') return 'import_chat_export';
    return stripped;
  }
  return cleaned;
}

/**
 * Executes a tool call given the tool name, arguments, and active bridge instance.
 * @param {string} rawToolName
 * @param {object} args
 * @param {import('../bridge/base.js').WhatsAppBridgeBase} bridge
 * @returns {Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>}
 */
export async function executeTool(rawToolName, args = {}, bridge) {
  const toolName = normalizeToolName(rawToolName);
  logger.info({ tool: toolName, args }, 'Executing MCP tool call');

  try {
    switch (toolName) {
      case 'find_stickers': {
        const query = args.search || args.query || '';
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        const category = args.category || null;

        const results = findStickers({ search: query, limit, category });
        const categories = listCategories();

        const output = {
          query,
          count: results.length,
          available_categories: categories,
          stickers: results
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(output, null, 2)
            }
          ],
          isError: false
        };
      }

      case 'send_sticker': {
        const { to, sticker_id, stickerId } = args;
        const targetSticker = sticker_id || stickerId;
        if (!to) {
          throw new Error('Missing required argument: "to"');
        }
        if (!targetSticker) {
          throw new Error('Missing required argument: "sticker_id"');
        }

        const res = await bridge.sendSticker(to, targetSticker);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res, null, 2)
            }
          ],
          isError: false
        };
      }

      case 'send_message': {
        const { to, message, text } = args;
        const msgContent = message || text;
        if (!to) {
          throw new Error('Missing required argument: "to"');
        }
        if (!msgContent) {
          throw new Error('Missing required argument: "message"');
        }

        const res = await bridge.sendMessage(to, msgContent);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res, null, 2)
            }
          ],
          isError: false
        };
      }

      case 'send_reaction': {
        const { to, message_id, messageId, emoji } = args;
        const targetMsgId = message_id || messageId;
        if (!to) {
          throw new Error('Missing required argument: "to"');
        }
        if (!targetMsgId) {
          throw new Error('Missing required argument: "message_id"');
        }
        if (!emoji) {
          throw new Error('Missing required argument: "emoji"');
        }

        const res = await bridge.sendReaction(to, targetMsgId, emoji);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res, null, 2)
            }
          ],
          isError: false
        };
      }

      case 'get_whatsapp_status': {
        const status = bridge.getStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2)
            }
          ],
          isError: false
        };
      }

      case 'get_chat_history': {
        return await handleGetChatHistory(args, bridge);
      }

      case 'fetch_older_messages': {
        return await handleFetchOlderMessages(args, bridge);
      }

      case 'list_chats': {
        const limit = typeof args.limit === 'number' ? Math.min(args.limit, 50) : 20;
        const chats = typeof bridge.getChats === 'function' ? bridge.getChats(limit) : [];
        const status = bridge.getStatus ? bridge.getStatus() : { status: bridge.status };

        const formattedChats = chats.map(c => ({
          jid: c.jid,
          name: c.name || c.jid.replace(/@.*$/, ''),
          unread_count: c.unreadCount || 0,
          last_message: c.lastMessageText || '',
          last_message_time: c.lastMessageTime ? new Date(c.lastMessageTime * 1000).toISOString() : null
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: formattedChats.length,
                bridge_status: status.status,
                connected_phone: bridge.userInfo?.phone || 'unknown',
                chats: formattedChats
              }, null, 2)
            }
          ],
          isError: false
        };
      }

      case 'simulate_inbound_message': {
        const { from, message, sender_name, senderName, is_group, isGroup, group_id, groupId } = args;
        if (!from) {
          throw new Error('Missing required argument: "from"');
        }
        if (!message) {
          throw new Error('Missing required argument: "message"');
        }

        let dispatched;
        if (typeof bridge.simulateInboundMessage === 'function') {
          dispatched = bridge.simulateInboundMessage({
            from,
            message,
            senderName: sender_name || senderName || 'Alice',
            isGroup: Boolean(is_group || isGroup),
            groupId: group_id || groupId
          });
        } else {
          dispatched = {
            from: from.replace(/@.*$/, ''),
            senderJid: bridge.formatJid(from),
            senderName: sender_name || senderName || 'Alice',
            message,
            messageId: `SIM_${Date.now()}`,
            timestamp: Math.floor(Date.now() / 1000),
            isGroup: Boolean(is_group || isGroup),
            chatJid: bridge.formatJid(from)
          };
          bridge.emit('message', dispatched);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, simulated_event: dispatched }, null, 2)
            }
          ],
          isError: false
        };
      }

      case 'import_chat_export': {
        return await handleImportChatExport(args, bridge);
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: "${rawToolName}". Available tools: ${TOOL_DEFINITIONS.map(t => t.name).join(', ')}`
            }
          ],
          isError: true
        };
    }
  } catch (err) {
    logger.error({ err, tool: rawToolName }, 'Tool execution failed');
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool "${rawToolName}": ${err.message}`
        }
      ],
      isError: true
    };
  }
}
