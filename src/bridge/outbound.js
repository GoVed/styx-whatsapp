import fs from 'node:fs';
import { getSticker, getStickerBuffer } from '../stickers/index.js';
import sharp from 'sharp';
import logger from '../utils/logger.js';

/**
 * Dispatches an outbound plain text WhatsApp message via Baileys socket.
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {string} to
 * @param {string} text
 * @returns {Promise<object>}
 */
export async function sendLiveMessage(bridge, to, text) {
  if (!bridge.sock || bridge.status !== 'connected') {
    throw new Error(`WhatsApp is not connected (current state: ${bridge.status})`);
  }
  if (!text || typeof text !== 'string') {
    throw new Error('Message text is required');
  }

  const jid = bridge.formatJid(to);
  const sent = await bridge.sock.sendMessage(jid, { text });
  const messageId = sent?.key?.id || `LIVE_OUT_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const targetContact = bridge.contacts.get(jid) || bridge.chats.get(jid);
  const record = {
    direction: 'outbound',
    type: 'text',
    messageId,
    to: jid,
    chatJid: jid,
    senderName: 'You',
    targetName: (targetContact?.name && targetContact.name !== jid)
      ? targetContact.name
      : (!to.includes('@') && !/^\+?\d+$/.test(to) ? to : (targetContact?.name || jid)),
    text,
    message: text,
    timestamp,
    status: 'sent'
  };

  bridge.recordHistory(record);
  logger.info({ to: jid, messageId, text }, 'Outbound WhatsApp text dispatched');

  return {
    success: true,
    messageId,
    to: jid,
    text,
    timestamp,
    mode: 'live'
  };
}

/**
 * Dispatches a sticker WebP image via Baileys socket.
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {string} to
 * @param {string|Buffer} stickerIdOrBuffer
 * @returns {Promise<object>}
 */
export async function sendLiveSticker(bridge, to, stickerIdOrBuffer) {
  if (!bridge.sock || bridge.status !== 'connected') {
    throw new Error(`WhatsApp is not connected (current state: ${bridge.status})`);
  }

  const jid = bridge.formatJid(to);
  let stickerBuffer;
  let stickerId = 'buffer';
  let stickerName = 'Custom Sticker';

  if (Buffer.isBuffer(stickerIdOrBuffer)) {
    stickerBuffer = stickerIdOrBuffer;
  } else if (typeof stickerIdOrBuffer === 'string') {
    stickerId = stickerIdOrBuffer.trim();

    // Check if target is an HTTP(S) URL
    if (stickerId.startsWith('http://') || stickerId.startsWith('https://')) {
      try {
        let fetchUrl = stickerId;
        // In Docker container, map localhost/127.0.0.1 on tool ports to host.docker.internal
        fetchUrl = fetchUrl
          .replace('http://localhost:', 'http://host.docker.internal:')
          .replace('http://127.0.0.1:', 'http://host.docker.internal:');
        const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          const buf = Buffer.from(ab);
          // If already a valid WebP container
          if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
            stickerBuffer = buf;
          } else {
            // Convert PNG, JPG, or GIF to WhatsApp 512x512 WebP Sticker
            stickerBuffer = await sharp(buf)
              .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
              .webp({ quality: 90 })
              .toBuffer();
          }
          stickerName = 'Online Sticker';
        } else {
          logger.warn({ status: res.status, url: fetchUrl }, 'Sticker URL fetch failed');
        }
      } catch (err) {
        logger.warn({ err: err?.message, url: stickerId }, 'Failed to fetch sticker from URL');
      }
    }

    if (!stickerBuffer) {
      const found = getSticker(stickerId);
      if (found) {
        stickerName = found.name;
        stickerBuffer = getStickerBuffer(stickerId);
      } else if (fs.existsSync(stickerId)) {
        stickerBuffer = fs.readFileSync(stickerId);
      }
    }
  } else {
    throw new Error('Valid stickerId (string) or WebP Buffer is required');
  }

  if (!stickerBuffer) {
    throw new Error(`Sticker '${stickerId}' not found. Please provide a valid catalog sticker ID from find_stickers or an image/WebP/GIF URL.`);
  }

  const sent = await bridge.sock.sendMessage(jid, { sticker: stickerBuffer });
  const messageId = sent?.key?.id || `LIVE_STK_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const record = {
    direction: 'outbound',
    type: 'sticker',
    messageId,
    to: jid,
    stickerId,
    stickerName,
    timestamp,
    status: 'sent'
  };

  bridge.recordHistory(record);
  logger.info({ to: jid, stickerId, stickerName, messageId }, 'Outbound WhatsApp sticker dispatched');

  return {
    success: true,
    messageId,
    to: jid,
    stickerId,
    stickerName,
    timestamp,
    mode: 'live'
  };
}

/**
 * Dispatches an emoji reaction via Baileys socket.
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {string} to
 * @param {string} messageId
 * @param {string} emoji
 * @returns {Promise<object>}
 */
export async function sendLiveReaction(bridge, to, messageId, emoji) {
  if (!bridge.sock || bridge.status !== 'connected') {
    throw new Error(`WhatsApp is not connected (current state: ${bridge.status})`);
  }
  if (!messageId) {
    throw new Error('Target messageId is required for reaction');
  }
  if (!emoji) {
    throw new Error('Reaction emoji is required');
  }

  const jid = bridge.formatJid(to);
  await bridge.sock.sendMessage(jid, {
    react: {
      text: emoji,
      key: {
        remoteJid: jid,
        id: messageId
      }
    }
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const record = {
    direction: 'outbound',
    type: 'reaction',
    to: jid,
    targetMessageId: messageId,
    emoji,
    timestamp
  };

  bridge.recordHistory(record);
  logger.info({ to: jid, messageId, emoji }, 'Outbound WhatsApp reaction dispatched');

  return {
    success: true,
    to: jid,
    messageId,
    emoji,
    timestamp,
    mode: 'live'
  };
}
