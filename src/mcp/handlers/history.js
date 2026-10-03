import fs from 'node:fs';
import path from 'node:path';
import config from '../../config.js';
import logger from '../../utils/logger.js';

import { resolveMentionsInText } from '../../bridge/mentions.js';

/**
 * Handles the get_chat_history MCP tool call.
 * Formats messages and includes media_url for stickers/images.
 *
 * @param {object} args
 * @param {import('../../bridge/base.js').WhatsAppBridgeBase} bridge
 * @returns {Promise<{ content: Array<{ type: string, text: string }>, isError: boolean }>}
 */
export async function handleGetChatHistory(args, bridge) {
  const limit = typeof args.limit === 'number' ? Math.min(args.limit, 1000) : 20;
  const chatJid = args.chat_jid || args.chat || args.to || args.phone || null;
  const search = args.search || args.query || null;
  const direction = args.direction || 'all';
  const shouldFetchOlder = Boolean(args.fetch_older || args.sync_more);

  // If explicitly requested to fetch older history from phone, trigger on-demand sync
  if (chatJid && shouldFetchOlder && typeof bridge.fetchEarlierMessages === 'function' && bridge.status === 'connected') {
    try {
      await bridge.fetchEarlierMessages(chatJid, limit);
    } catch (err) {
      logger.debug({ err: err?.message, chatJid }, 'Notice: On-demand history fetch from phone');
    }
  }

  let history = bridge.getHistory({ limit, chatJid, search });
  if (direction === 'inbound') {
    history = history.filter(h => h.direction === 'inbound');
  } else if (direction === 'outbound') {
    history = history.filter(h => h.direction === 'outbound');
  }
  history = history.slice(0, limit);

  const status = bridge.getStatus ? bridge.getStatus() : { status: bridge.status };
  const userPhone = bridge.userInfo?.phone || 'unknown';

  const formatted = history.map(h => {
    let mediaUrl = h.mediaUrl;
    if (!mediaUrl && (h.type === 'sticker' || h.type === 'image') && h.messageId) {
      const ext = h.type === 'sticker' ? 'webp' : 'jpg';
      const localFile = path.join(config.mediaDir, `${h.messageId}.${ext}`);
      if (fs.existsSync(localFile)) {
        mediaUrl = `http://localhost:${config.httpPort}/media/${h.messageId}.${ext}`;
        h.mediaUrl = mediaUrl;
      }
    }

    const rawText = h.rawText || h.message || h.text || '';
    let text = h.message || h.text || '';
    let mentions = h.mentions;

    // Dynamically resolve mentions for historical records if not already resolved or if text has @digits
    if ((!mentions || mentions.length === 0 || text.includes('@')) && rawText) {
      const resolved = resolveMentionsInText(rawText, h.mentions || [], bridge);
      text = resolved.text;
      if (resolved.mentions && resolved.mentions.length > 0) {
        mentions = resolved.mentions;
      }
    }

    return {
      id: h.messageId,
      direction: h.direction,
      from: h.from,
      sender: h.senderName,
      chat_name: h.chatName || bridge.chats?.get(h.chatJid)?.name || undefined,
      chat_jid: h.chatJid || h.to || h.senderJid || '',
      text,
      raw_text: rawText !== text ? rawText : undefined,
      mentions: mentions && mentions.length > 0 ? mentions : undefined,
      type: h.type || 'text',
      media_url: mediaUrl || undefined,
      reply_to: h.replyTo || h.quotedMessage || undefined,
      timestamp: h.timestamp,
      datetime: h.timestamp ? new Date(h.timestamp * 1000).toISOString() : null
    };
  });

  const responseObj = {
    count: formatted.length,
    bridge_status: status.status,
    connected_phone: userPhone,
    messages: formatted
  };

  if (formatted.length === 0) {
    responseObj.notice = `No messages recorded in history yet. The WhatsApp bridge is connected to ${userPhone}. Any new messages received or sent will appear here in real-time.`;
    const recentChats = typeof bridge.getChats === 'function' ? bridge.getChats(5) : [];
    if (recentChats.length > 0) {
      responseObj.active_chats = recentChats;
    }
  }

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

/**
 * Handles the fetch_older_messages MCP tool call.
 *
 * @param {object} args
 * @param {import('../../bridge/base.js').WhatsAppBridgeBase} bridge
 * @returns {Promise<{ content: Array<{ type: string, text: string }>, isError: boolean }>}
 */
export async function handleFetchOlderMessages(args, bridge) {
  const target = args.chat || args.chat_jid || args.to || args.phone;
  const count = typeof args.count === 'number' ? Math.min(args.count, 100) : 50;
  if (!target) {
    throw new Error('Target "chat" name, phone number, or JID is required');
  }

  let res;
  if (typeof bridge.fetchEarlierMessages === 'function') {
    res = await bridge.fetchEarlierMessages(target, count);
  } else {
    res = {
      success: true,
      chat: target,
      requestedCount: count,
      mode: bridge.mode,
      notice: 'Mock mode does not require phone sync'
    };
  }

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

export default {
  handleGetChatHistory,
  handleFetchOlderMessages
};
