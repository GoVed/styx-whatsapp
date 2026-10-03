import fs from 'node:fs';
import { getSticker, getStickerBuffer } from '../stickers/index.js';
import sharp from 'sharp';
import logger from '../utils/logger.js';
import {
  resolveMediaSource,
  detectMediaType,
  convertGifToMp4,
  saveMediaToCache,
  recordOutboundMedia
} from './media.js';
import { resolveOutboundMentions } from './mentions.js';

/**
 * Dispatches an outbound plain text WhatsApp message via Baileys socket.
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {string} to
 * @param {string} text
 * @returns {Promise<object>}
 */
export async function sendLiveMessage(bridge, to, text, options = {}) {
  if (!bridge.sock || bridge.status !== 'connected') {
    throw new Error(`WhatsApp is not connected (current state: ${bridge.status})`);
  }
  if (!text || typeof text !== 'string') {
    throw new Error('Message text is required');
  }

  const jid = bridge.formatJid(to);
  let mentions = Array.isArray(options?.mentions) ? options.mentions : [];
  if (mentions.length === 0 && (jid.endsWith('@g.us') || text.includes('@'))) {
    mentions = resolveOutboundMentions(text, bridge).mentions;
  }
  const sendPayload = mentions.length > 0 ? { text, mentions } : { text };
  const sent = await bridge.sock.sendMessage(jid, sendPayload);
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
    mentions,
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

/**
 * Dispatches an outbound image (JPEG, PNG, WebP) via Baileys socket.
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {string} to
 * @param {string|Buffer} imageSource File path, HTTP(S) URL, base64, or Buffer
 * @param {string} [caption]
 * @returns {Promise<object>}
 */
export async function sendLiveImage(bridge, to, imageSource, caption = '') {
  if (!bridge.sock || bridge.status !== 'connected') {
    throw new Error(`WhatsApp is not connected (current state: ${bridge.status})`);
  }
  if (!imageSource) {
    throw new Error('Image source (URL, file path, base64, or Buffer) is required');
  }

  const jid = bridge.formatJid(to);
  const { buffer, hint } = await resolveMediaSource(imageSource);
  const detected = detectMediaType(buffer, hint);

  // If source is an animated GIF, forward to sendLiveGif for looping video playback
  if (detected.type === 'gif') {
    return sendLiveGif(bridge, to, buffer, caption);
  }

  const sent = await bridge.sock.sendMessage(jid, {
    image: buffer,
    caption: caption || undefined,
    mimetype: detected.mimetype
  });

  const messageId = sent?.key?.id || `LIVE_IMG_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const { mediaPath, mediaUrl } = saveMediaToCache(buffer, messageId, detected.ext);

  recordOutboundMedia(bridge, {
    jid, to, type: 'image', messageId, caption, mediaUrl, mediaPath, timestamp
  });
  logger.info({ to: jid, messageId, caption }, 'Outbound WhatsApp image dispatched');

  return {
    success: true,
    messageId,
    to: jid,
    caption: caption || '',
    mediaUrl,
    timestamp,
    mode: 'live'
  };
}

/**
 * Dispatches an outbound animated GIF or looping MP4 clip via Baileys socket.
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {string} to
 * @param {string|Buffer} gifSource File path, HTTP(S) URL, base64, or Buffer
 * @param {string} [caption]
 * @returns {Promise<object>}
 */
export async function sendLiveGif(bridge, to, gifSource, caption = '') {
  if (!bridge.sock || bridge.status !== 'connected') {
    throw new Error(`WhatsApp is not connected (current state: ${bridge.status})`);
  }
  if (!gifSource) {
    throw new Error('GIF source (URL, file path, base64, or Buffer) is required');
  }

  const jid = bridge.formatJid(to);
  const { buffer, hint } = await resolveMediaSource(gifSource);
  const detected = detectMediaType(buffer, hint);

  let videoBuffer;
  if (detected.type === 'video' || detected.ext === 'mp4') {
    videoBuffer = buffer;
  } else {
    videoBuffer = await convertGifToMp4(buffer);
  }

  const sent = await bridge.sock.sendMessage(jid, {
    video: videoBuffer,
    gifPlayback: true,
    caption: caption || undefined,
    mimetype: 'video/mp4'
  });

  const messageId = sent?.key?.id || `LIVE_GIF_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const { mediaPath, mediaUrl } = saveMediaToCache(videoBuffer, messageId, 'mp4');

  recordOutboundMedia(bridge, {
    jid, to, type: 'gif', messageId, caption, mediaUrl, mediaPath, timestamp
  });
  logger.info({ to: jid, messageId, caption }, 'Outbound WhatsApp GIF dispatched');

  return {
    success: true,
    messageId,
    to: jid,
    caption: caption || '',
    mediaUrl,
    timestamp,
    mode: 'live'
  };
}
