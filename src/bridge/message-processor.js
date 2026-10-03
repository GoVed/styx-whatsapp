import path from 'node:path';
import fs from 'node:fs';
import config from '../config.js';
import logger from '../utils/logger.js';
import { parseWhatsAppMessageContent } from './parser.js';
import { resolveMentionsInText } from './mentions.js';
import { downloadInboundMedia } from './media.js';
import { applyReactionToHistory } from './history-ops.js';

/**
 * Standardizes and processes a raw Baileys WebMessageInfo object.
 * Resolves contact names, quotes, and resolves @a_long_id mentions into human-readable names.
 *
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {object} msg
 * @param {boolean} [isHistoric=false]
 * @returns {object|null}
 */
export function processRawMessage(bridge, msg, isHistoric = false) {
  if (!msg || !msg.key) return null;
  const remoteJid = msg.key.remoteJid || '';
  if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return null;

  const fromMe = Boolean(msg.key.fromMe);
  const isGroup = remoteJid.endsWith('@g.us');
  const participant = msg.key.participant || (fromMe ? (bridge.userInfo?.id || 'me') : remoteJid);
  const isLid = participant.endsWith('@lid') || remoteJid.endsWith('@lid');
  const cleanParticipant = participant.replace(/@.*$/, '').replace(/:\d+$/, '');
  const cleanPhone = isLid
    ? participant
    : (cleanParticipant.startsWith('+') ? cleanParticipant : `+${cleanParticipant}`);

  const contact = bridge.contacts.get(participant) || bridge.contacts.get(remoteJid);
  const senderName = fromMe
    ? (bridge.userInfo?.name || 'You')
    : (msg.pushName || contact?.name || cleanParticipant);

  const { text: rawContentText, type, quoted, mentions: rawMentions, reaction } = parseWhatsAppMessageContent(msg.message);

  if (type === 'empty' || type === 'other') return null;
  if (!rawContentText && type !== 'reaction') return null;

  if (quoted && quoted.participant) {
    const quotedContact = bridge.contacts.get(quoted.participant) || bridge.chats.get(quoted.participant);
    quoted.senderName = quotedContact?.name || quoted.participant.replace(/@.*$/, '');
  }

  // Resolve @a_long_id mentions into human names
  const resolved = resolveMentionsInText(rawContentText || '', rawMentions, bridge);
  const text = resolved.text;

  const timestamp = typeof msg.messageTimestamp === 'number'
    ? msg.messageTimestamp
    : (typeof msg.messageTimestamp?.low === 'number'
        ? msg.messageTimestamp.low
        : Math.floor(Date.now() / 1000));

  const direction = fromMe ? 'outbound' : 'inbound';
  const existingChat = bridge.chats.get(remoteJid);
  const chatName = isGroup ? (existingChat?.name || '') : senderName;

  const item = {
    messageId: msg.key.id,
    direction,
    type,
    from: fromMe ? (bridge.userInfo?.phone || '+me') : cleanPhone,
    senderJid: participant,
    senderName,
    chatName,
    message: text,
    text,
    rawText: resolved.rawText,
    mentions: resolved.mentions,
    isSelfTagged: resolved.isSelfTagged,
    timestamp,
    date: new Date(timestamp * 1000).toISOString(),
    isGroup,
    chatJid: remoteJid,
    mode: 'live',
    replyTo: quoted || null,
    quotedMessage: quoted || null,
    rawMessage: msg.message
  };

  // Handle incoming reaction message
  if (type === 'reaction') {
    const targetMessageId = reaction?.targetMessageId || msg.message?.reactionMessage?.key?.id;
    const emoji = reaction?.emoji ?? msg.message?.reactionMessage?.text ?? '';
    const isRemoved = Boolean(reaction?.isRemoved || !emoji);

    const target = applyReactionToHistory({
      history: bridge.history,
      targetMessageId,
      emoji,
      senderName,
      senderJid: participant,
      timestamp,
      fromMe
    });
    if (target) bridge.saveHistoryToDisk();

    item.reaction = emoji;
    item.isRemoved = isRemoved;
    item.targetMessageId = targetMessageId;
    item.targetMessageText = target?.text || target?.message || null;
    item.targetSenderName = target?.senderName || null;
    item.message = isRemoved
      ? (target?.text ? `Removed reaction from "${target.text}"` : 'Removed reaction')
      : (target?.text ? `Reacted ${emoji} to "${target.text}"` : `Reacted ${emoji}`);
    item.text = item.message;
  }

  if (!fromMe && senderName && senderName !== 'You' && senderName !== 'Styx Operator') {
    if (isGroup) {
      bridge.recordChat({ jid: remoteJid, lastMessageText: item.message, lastMessageTime: timestamp });
      if (participant && participant !== remoteJid) bridge.recordContact({ id: participant, name: senderName });
    } else {
      bridge.recordChat({ jid: remoteJid, name: senderName, lastMessageText: item.message, lastMessageTime: timestamp });
      if (participant && participant !== remoteJid) bridge.recordContact({ id: participant, name: senderName });
      bridge.recordContact({ id: remoteJid, name: senderName });
    }
  } else if (isGroup) {
    bridge.recordChat({ jid: remoteJid, lastMessageText: item.message, lastMessageTime: timestamp });
  }

  if (type === 'image' || type === 'sticker' || type === 'video') {
    const ext = type === 'sticker' ? 'webp' : (type === 'video' ? 'mp4' : 'jpg');
    const existingFile = path.join(config.mediaDir, `${msg.key.id}.${ext}`);
    if (fs.existsSync(existingFile)) {
      item.mediaUrl = `http://localhost:${config.httpPort}/media/${msg.key.id}.${ext}`;
      item.mediaType = type;
      item.mediaPath = existingFile;
    }
  }

  const isExisting = Boolean(msg.key.id && bridge.history.some(h => h.messageId === msg.key.id));
  if (type !== 'reaction') {
    bridge.recordHistory(item);
  }

  if (!isHistoric && !fromMe && !isExisting) {
    if (type === 'image' || type === 'sticker' || type === 'video') {
      downloadInboundMedia(msg, type, config.mediaDir, bridge.sock)
        .then((media) => {
          if (media) {
            item.mediaUrl = `http://localhost:${config.httpPort}/media/${media.filename}`;
            item.mediaType = media.mediaType;
            item.mediaPath = media.localPath;
            bridge.saveHistoryToDisk();
          }
          bridge.emit('message', item);
        })
        .catch(() => bridge.emit('message', item));
    } else if (type === 'reaction') {
      logger.info({ from: item.from, senderName, emoji: item.reaction, targetMessageId: item.targetMessageId }, 'Inbound WhatsApp reaction received');
      bridge.emit('reaction', item);
      bridge.emit('message', item);
    } else {
      logger.info({ from: item.from, senderName, isGroup, textSnippet: text.substring(0, 50) }, 'Inbound WhatsApp message received');
      bridge.emit('message', item);
    }
  }

  return item;
}

/**
 * Handles Baileys messages.reaction event update.
 *
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {object} r Reaction update object from Baileys
 */
export function processReactionUpdate(bridge, r) {
  if (!r || !r.key) return null;
  const targetMessageId = r.key.id;
  const remoteJid = r.key.remoteJid || r.reaction?.key?.remoteJid || '';
  if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return null;

  const emoji = r.reaction?.text || '';
  const isRemoved = !emoji;
  const isGroup = remoteJid.endsWith('@g.us');
  const participant = r.reaction?.key?.participant || r.key.participant || (r.reaction?.key?.fromMe ? (bridge.userInfo?.id || 'me') : remoteJid);
  const fromMe = Boolean(r.reaction?.key?.fromMe || (bridge.userInfo?.id && participant === bridge.userInfo.id));

  const isLid = participant.endsWith('@lid') || remoteJid.endsWith('@lid');
  const cleanParticipant = participant.replace(/@.*$/, '').replace(/:\d+$/, '');
  const cleanPhone = isLid ? participant : (cleanParticipant.startsWith('+') ? cleanParticipant : `+${cleanParticipant}`);

  const contact = bridge.contacts.get(participant) || bridge.contacts.get(remoteJid);
  const senderName = fromMe ? (bridge.userInfo?.name || 'You') : (contact?.name || cleanParticipant);

  const timestamp = typeof r.reaction?.senderTimestampMs === 'number'
    ? Math.floor(r.reaction.senderTimestampMs / 1000)
    : Math.floor(Date.now() / 1000);

  const target = applyReactionToHistory({
    history: bridge.history,
    targetMessageId,
    emoji,
    senderName,
    senderJid: participant,
    timestamp,
    fromMe
  });
  if (target) bridge.saveHistoryToDisk();

  const existingChat = bridge.chats.get(remoteJid);
  const chatName = isGroup ? (existingChat?.name || '') : senderName;

  const msgText = isRemoved
    ? (target?.text ? `Removed reaction from "${target.text}"` : 'Removed reaction')
    : (target?.text ? `Reacted ${emoji} to "${target.text}"` : `Reacted ${emoji}`);

  const item = {
    messageId: `react_${targetMessageId}_${timestamp}`,
    direction: fromMe ? 'outbound' : 'inbound',
    type: 'reaction',
    reaction: emoji,
    isRemoved,
    targetMessageId,
    targetMessageText: target?.text || target?.message || null,
    targetSenderName: target?.senderName || null,
    from: fromMe ? (bridge.userInfo?.phone || '+me') : cleanPhone,
    senderJid: participant,
    senderName,
    chatName,
    chatJid: remoteJid,
    isGroup,
    message: msgText,
    text: msgText,
    timestamp,
    date: new Date(timestamp * 1000).toISOString(),
    mode: 'live'
  };

  if (!fromMe) {
    logger.info({ from: item.from, senderName, emoji, targetMessageId }, 'Inbound WhatsApp reaction event processed');
    bridge.emit('reaction', item);
    bridge.emit('message', item);
  }

  return item;
}
