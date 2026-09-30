import fs from 'node:fs';
import path from 'node:path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';

/**
 * Downloads and caches inbound media (images, stickers) to local disk.
 *
 * @param {object} msg - The raw Baileys message object
 * @param {string} type - 'image' | 'sticker' | 'video' | 'document'
 * @param {string} mediaDir - Destination directory
 * @param {object} [sock] - Baileys socket instance (optional)
 * @returns {Promise<{ filename: string, localPath: string, mediaType: string, byteLength: number } | null>}
 */
export async function downloadInboundMedia(msg, type, mediaDir, sock = null) {
  if (!msg || !msg.message) return null;
  if (type !== 'image' && type !== 'sticker') return null;

  try {
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const messageId = msg.key?.id || `media_${Date.now()}`;
    const ext = type === 'sticker' ? 'webp' : 'jpg';
    const filename = `${messageId}.${ext}`;
    const localPath = path.join(mediaDir, filename);

    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      return {
        filename,
        localPath,
        mediaType: type,
        byteLength: stats.size
      };
    }

    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        reuploadRequest: sock?.updateMediaMessage
      }
    );

    if (buffer && buffer.length > 0) {
      fs.writeFileSync(localPath, buffer);
      logger.info(
        { messageId, filename, type, size: buffer.length },
        'Successfully downloaded and cached inbound WhatsApp media'
      );
      return {
        filename,
        localPath,
        mediaType: type,
        byteLength: buffer.length
      };
    }
  } catch (err) {
    logger.warn({ err: err.message, type, messageId: msg.key?.id }, 'Failed to download inbound media');
  }

  return null;
}

export default { downloadInboundMedia };
