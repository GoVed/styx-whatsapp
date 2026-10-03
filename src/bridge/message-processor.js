import path from 'node:path';
import fs from 'node:fs';
import config from '../config.js';
import logger from '../utils/logger.js';
import { parseWhatsAppMessageContent } from './parser.js';
import { resolveMentionsInText } from './mentions.js';
import { downloadInboundMedia } from './media.js';

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

  const { text: rawContentText, type, quoted, mentions: rawMentions } = parseWhatsAppMessageContent(msg.message);

  if (!rawContentText || type === 'empty' || type === 'other') return null;

  if (quoted && quoted.participant) {
    const quotedContact = bridge.contacts.get(quoted.participant) || bridge.chats.get(quoted.participant);
    quoted.senderName = quotedContact?.name || quoted.participant.replace(/@.*$/, '');
  }

  // Resolve @a_long_id mentions into human names (e.g. @155500011122233 -> @Alice)
  const resolved = resolveMentionsInText(rawContentText, rawMentions, bridge);
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

  if (!fromMe && senderName && senderName !== 'You' && senderName !== 'Styx Operator') {
    if (isGroup) {
      bridge.recordChat({
        jid: remoteJid,
        lastMessageText: text,
        lastMessageTime: timestamp
      });
      if (participant && participant !== remoteJid) {
        bridge.recordContact({ id: participant, name: senderName });
      }
    } else {
      bridge.recordChat({
        jid: remoteJid,
        name: senderName,
        lastMessageText: text,
        lastMessageTime: timestamp
      });
      if (participant && participant !== remoteJid) {
        bridge.recordContact({ id: participant, name: senderName });
      }
      bridge.recordContact({ id: remoteJid, name: senderName });
    }
  } else if (isGroup) {
    bridge.recordChat({
      jid: remoteJid,
      lastMessageText: text,
      lastMessageTime: timestamp
    });
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
  bridge.recordHistory(item);

  if (!isHistoric && !fromMe && text && !isExisting) {
    if (type === 'image' || type === 'sticker' || type === 'video') {
      downloadInboundMedia(msg, type, config.mediaDir, bridge.sock)
        .then((media) => {
          if (media) {
            item.mediaUrl = `http://localhost:${config.httpPort}/media/${media.filename}`;
            item.mediaType = media.mediaType;
            item.mediaPath = media.localPath;
            bridge.saveHistoryToDisk();
          }
          logger.info(
            { from: item.from, senderName, isGroup, textSnippet: text.substring(0, 50), mediaUrl: item.mediaUrl },
            'Inbound WhatsApp media message received and ready'
          );
          bridge.emit('message', item);
        })
        .catch((err) => {
          logger.warn({ err: err.message }, 'Failed downloading media for inbound message');
          bridge.emit('message', item);
        });
    } else {
      logger.info(
        { from: item.from, senderName, isGroup, textSnippet: text.substring(0, 50), mentionsCount: resolved.mentions.length },
        'Inbound WhatsApp message received'
      );
      bridge.emit('message', item);
    }
  }

  return item;
}
