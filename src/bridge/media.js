import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import config from '../config.js';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);
let cachedHasFfmpeg = null;

/**
 * Checks whether ffmpeg is installed and accessible in the system PATH.
 * @returns {Promise<boolean>}
 */
export async function checkFfmpeg() {
  if (cachedHasFfmpeg !== null) return cachedHasFfmpeg;
  try {
    await execFileAsync('ffmpeg', ['-version']);
    cachedHasFfmpeg = true;
  } catch {
    cachedHasFfmpeg = false;
  }
  return cachedHasFfmpeg;
}

/**
 * Downloads and caches inbound media (images, stickers, videos) to local disk.
 *
 * @param {object} msg - The raw Baileys message object
 * @param {string} type - 'image' | 'sticker' | 'video' | 'document'
 * @param {string} mediaDir - Destination directory
 * @param {object} [sock] - Baileys socket instance (optional)
 * @returns {Promise<{ filename: string, localPath: string, mediaType: string, byteLength: number } | null>}
 */
export async function downloadInboundMedia(msg, type, mediaDir, sock = null) {
  if (!msg || !msg.message) return null;
  if (type !== 'image' && type !== 'sticker' && type !== 'video') return null;

  try {
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const messageId = msg.key?.id || `media_${Date.now()}`;
    const ext = type === 'sticker' ? 'webp' : (type === 'video' ? 'mp4' : 'jpg');
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

/**
 * Resolves a media input (URL, local file path, base64 data URI, or Buffer) into a Buffer.
 *
 * @param {string|Buffer} source
 * @returns {Promise<{ buffer: Buffer, hint: string }>}
 */
export async function resolveMediaSource(source) {
  if (!source) {
    throw new Error('Media source is required');
  }

  if (Buffer.isBuffer(source)) {
    return { buffer: source, hint: 'buffer' };
  }

  if (typeof source !== 'string') {
    throw new Error('Media source must be a string (URL or path) or Buffer');
  }

  const trimmed = source.trim();

  // Data URI: data:image/png;base64,...
  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
      const header = trimmed.substring(0, commaIndex);
      const base64Data = trimmed.substring(commaIndex + 1);
      return {
        buffer: Buffer.from(base64Data, 'base64'),
        hint: header
      };
    }
  }

  // HTTP or HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    let fetchUrl = trimmed;
    // Map localhost/127.0.0.1 on tool ports to host.docker.internal inside container
    fetchUrl = fetchUrl
      .replace('http://localhost:', 'http://host.docker.internal:')
      .replace('http://127.0.0.1:', 'http://host.docker.internal:');

    logger.debug({ original: trimmed, fetchUrl }, 'Fetching media from URL');
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      throw new Error(`Failed to fetch media from URL (${res.status} ${res.statusText}): ${trimmed}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const arrayBuf = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      hint: contentType || trimmed
    };
  }

  // Local filesystem path
  if (fs.existsSync(trimmed)) {
    const buffer = fs.readFileSync(trimmed);
    return { buffer, hint: trimmed };
  }

  // Check if it's raw base64 (without data: prefix)
  if (/^[A-Za-z0-9+/=]{100,}$/.test(trimmed)) {
    return {
      buffer: Buffer.from(trimmed, 'base64'),
      hint: 'base64'
    };
  }

  throw new Error(`Media file not found at local path or URL: ${trimmed}`);
}

/**
 * Inspects buffer magic bytes and hint string to detect media format.
 *
 * @param {Buffer} buf
 * @param {string} [hint='']
 * @returns {{ type: 'image'|'gif'|'video', mimetype: string, ext: string }}
 */
export function detectMediaType(buf, hint = '') {
  if (buf && buf.length >= 12) {
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { type: 'image', mimetype: 'image/jpeg', ext: 'jpg' };
    }
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { type: 'image', mimetype: 'image/png', ext: 'png' };
    }
    // WebP: RIFF....WEBP
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      return { type: 'image', mimetype: 'image/webp', ext: 'webp' };
    }
    // GIF: GIF87a or GIF89a
    if (buf.toString('ascii', 0, 3) === 'GIF') {
      return { type: 'gif', mimetype: 'image/gif', ext: 'gif' };
    }
    // MP4 / QuickTime: ....ftyp
    if (buf.toString('ascii', 4, 8) === 'ftyp') {
      return { type: 'video', mimetype: 'video/mp4', ext: 'mp4' };
    }
  }

  const lowerHint = String(hint).toLowerCase();
  if (lowerHint.includes('gif')) {
    return { type: 'gif', mimetype: 'image/gif', ext: 'gif' };
  }
  if (lowerHint.includes('png')) {
    return { type: 'image', mimetype: 'image/png', ext: 'png' };
  }
  if (lowerHint.includes('webp')) {
    return { type: 'image', mimetype: 'image/webp', ext: 'webp' };
  }
  if (lowerHint.includes('mp4') || lowerHint.includes('video')) {
    return { type: 'video', mimetype: 'video/mp4', ext: 'mp4' };
  }

  return { type: 'image', mimetype: 'image/jpeg', ext: 'jpg' };
}

/**
 * Converts an animated GIF buffer into an MP4 video buffer using ffmpeg for WhatsApp gifPlayback.
 *
 * @param {Buffer} gifBuffer
 * @returns {Promise<Buffer>}
 */
export async function convertGifToMp4(gifBuffer) {
  const isAvailable = await checkFfmpeg();
  if (!isAvailable) {
    logger.warn('ffmpeg not found in PATH; sending GIF buffer directly');
    return gifBuffer;
  }

  const tmpDir = os.tmpdir();
  const uid = `gif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(tmpDir, `${uid}.gif`);
  const outputPath = path.join(tmpDir, `${uid}.mp4`);

  try {
    await fs.promises.writeFile(inputPath, gifBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-movflags', 'faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      outputPath
    ], { timeout: 20000 });

    const mp4Buffer = await fs.promises.readFile(outputPath);
    return mp4Buffer;
  } catch (err) {
    logger.warn({ err: err.message }, 'ffmpeg GIF-to-MP4 conversion failed; falling back to raw buffer');
    return gifBuffer;
  } finally {
    try { await fs.promises.unlink(inputPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}
  }
}

/**
 * Caches a media buffer to disk in config.mediaDir and returns local path and web URL.
 *
 * @param {Buffer} buffer
 * @param {string} messageId
 * @param {string} ext
 * @returns {{ mediaPath: string|null, mediaUrl: string|null }}
 */
export function saveMediaToCache(buffer, messageId, ext) {
  try {
    if (!config.mediaDir) return { mediaUrl: null, mediaPath: null };
    if (!fs.existsSync(config.mediaDir)) {
      fs.mkdirSync(config.mediaDir, { recursive: true });
    }
    const filename = `${messageId}.${ext}`;
    const localPath = path.join(config.mediaDir, filename);
    fs.writeFileSync(localPath, buffer);
    return {
      mediaPath: localPath,
      mediaUrl: `http://localhost:${config.httpPort}/media/${filename}`
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to cache outbound media file');
    return { mediaUrl: null, mediaPath: null };
  }
}

/**
 * Creates and stores an outbound media history record.
 *
 * @param {object} bridge
 * @param {object} opts
 * @returns {object}
 */
export function recordOutboundMedia(bridge, { jid, to, type, messageId, caption, mediaUrl, mediaPath, timestamp }) {
  const targetContact = bridge.contacts?.get(jid) || bridge.chats?.get(jid);
  const fallbackLabel = type === 'gif' ? '[GIF]' : '[Image]';
  const targetName = (targetContact?.name && targetContact.name !== jid)
    ? targetContact.name
    : (!to.includes('@') && !/^\+?\d+$/.test(to) ? to : (targetContact?.name || jid));

  const record = {
    direction: 'outbound',
    type,
    messageId,
    to: jid,
    chatJid: jid,
    senderName: 'You',
    targetName,
    text: caption || fallbackLabel,
    message: caption || fallbackLabel,
    caption: caption || '',
    mediaUrl,
    mediaPath,
    timestamp,
    status: 'sent'
  };

  bridge.recordHistory(record);
  return record;
}

export default {
  downloadInboundMedia,
  resolveMediaSource,
  detectMediaType,
  convertGifToMp4,
  checkFfmpeg,
  saveMediaToCache,
  recordOutboundMedia
};
