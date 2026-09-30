import fs from 'node:fs';
import path from 'node:path';
import { parseWhatsAppChatExport } from '../../utils/chat-export-parser.js';
import logger from '../../utils/logger.js';

/**
 * Handles the import_chat_export MCP tool invocation.
 * @param {object} args
 * @param {import('../../bridge/base.js').WhatsAppBridgeBase} bridge
 * @returns {Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>}
 */
export async function handleImportChatExport(args, bridge) {
  let rawContent = args.content;
  const filePath = args.file_path || args.filePath || args.path;

  if (!rawContent && filePath) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`WhatsApp chat export file not found at path: "${resolvedPath}"`);
    }
    rawContent = fs.readFileSync(resolvedPath, 'utf8');
  }

  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Either "file_path" or "content" containing exported WhatsApp chat text is required.');
  }

  const targetIdentifier = args.chat || args.chat_jid || args.chatJid || args.chat_name || args.chatName || '';
  let resolvedJid = args.chat_jid || args.chatJid;
  let resolvedName = args.chat_name || args.chatName;

  // Attempt to match against known active chats
  if (targetIdentifier && bridge?.chats) {
    const lower = targetIdentifier.toLowerCase();
    for (const chat of bridge.chats.values()) {
      if ((chat.name && chat.name.toLowerCase() === lower) || chat.jid.toLowerCase() === lower) {
        resolvedJid = resolvedJid || chat.jid;
        resolvedName = resolvedName || chat.name;
        break;
      }
    }
  }

  const parsed = parseWhatsAppChatExport(rawContent, {
    chatJid: resolvedJid,
    chatName: resolvedName,
    myName: bridge?.userInfo?.name,
    myPhone: bridge?.userInfo?.phone
  });

  const chatName = resolvedName || parsed.chatName || 'Exported Chat';
  const chatJid = resolvedJid || parsed.chatJid;

  if (bridge) {
    if (chatJid) {
      bridge.recordChat({
        jid: chatJid,
        name: chatName
      });
    }

    if (Array.isArray(parsed.participants)) {
      for (const p of parsed.participants) {
        const cleanPhone = p.replace(/\D/g, '');
        if (cleanPhone.length >= 7) {
          bridge.recordContact({ id: `${cleanPhone}@s.whatsapp.net`, name: p });
        }
      }
    }
  }

  const ingestedCount = bridge?.recordHistoryBatch ? bridge.recordHistoryBatch(parsed.messages) : parsed.messages.length;

  logger.info(
    { chatName, chatJid, totalParsed: parsed.messages.length, newIngested: ingestedCount },
    'Ingested historical WhatsApp chat export'
  );

  const responseObj = {
    success: true,
    chat_name: chatName,
    chat_jid: chatJid,
    is_group: parsed.isGroup,
    total_parsed_messages: parsed.messages.length,
    new_messages_ingested: ingestedCount,
    total_messages_in_bridge: bridge?.history ? bridge.history.length : ingestedCount,
    participants_count: parsed.participants.length,
    participants: parsed.participants.slice(0, 30),
    time_range: {
      start: parsed.startDate,
      end: parsed.endDate
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(responseObj, null, 2)
      }
    ],
    isError: false
  };
}
