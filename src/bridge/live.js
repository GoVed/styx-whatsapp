import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import WhatsAppBridgeBase from './base.js';
import { sendLiveMessage, sendLiveSticker, sendLiveReaction } from './outbound.js';
import config, { ensureSecureAuthDir } from '../config.js';
import logger from '../utils/logger.js';
import { parseWhatsAppMessageContent } from './parser.js';
import { registerSocketListeners } from './listeners.js';
import { downloadInboundMedia } from './media.js';
import { fetchEarlierMessagesForBridge } from './history-fetch.js';

export { parseWhatsAppMessageContent };

export class LiveWhatsAppBridge extends WhatsAppBridgeBase {
  constructor() {
    super();
    this.mode = 'live';
    this.sock = null;
    this.saveCreds = null;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.latestQr = null;
    this._connectingPromise = null;
  }

  /**
   * Processes a raw WebMessageInfo from Baileys into a standardized history/relay record.
   *
   * @param {object} msg
   * @param {boolean} [isHistoric=false] Whether this message is from historic sync
   * @returns {object|null}
   */
  processRawMessage(msg, isHistoric = false) {
    if (!msg || !msg.key) return null;
    const remoteJid = msg.key.remoteJid || '';
    if (remoteJid === 'status@broadcast') return null;

    const fromMe = Boolean(msg.key.fromMe);
    const isGroup = remoteJid.endsWith('@g.us');
    const participant = msg.key.participant || (fromMe ? (this.userInfo?.id || 'me') : remoteJid);
    const isLid = participant.endsWith('@lid') || remoteJid.endsWith('@lid');
    const cleanParticipant = participant.replace(/@.*$/, '').replace(/:\d+$/, '');
    const cleanPhone = isLid
      ? participant
      : (cleanParticipant.startsWith('+') ? cleanParticipant : `+${cleanParticipant}`);

    const contact = this.contacts.get(participant) || this.contacts.get(remoteJid);
    const senderName = fromMe
      ? (this.userInfo?.name || 'You')
      : (msg.pushName || contact?.name || cleanParticipant);

    const { text, type, quoted } = parseWhatsAppMessageContent(msg.message);

    if (!text || type === 'empty' || type === 'other') return null;

    if (quoted && quoted.participant) {
      const quotedContact = this.contacts.get(quoted.participant) || this.chats.get(quoted.participant);
      quoted.senderName = quotedContact?.name || quoted.participant.replace(/@.*$/, '');
    }

    const timestamp = typeof msg.messageTimestamp === 'number'
      ? msg.messageTimestamp
      : (typeof msg.messageTimestamp?.low === 'number'
          ? msg.messageTimestamp.low
          : Math.floor(Date.now() / 1000));

    const direction = fromMe ? 'outbound' : 'inbound';
    const existingChat = this.chats.get(remoteJid);
    const chatName = isGroup ? (existingChat?.name || '') : senderName;

    const item = {
      messageId: msg.key.id,
      direction,
      type,
      from: fromMe ? (this.userInfo?.phone || '+me') : cleanPhone,
      senderJid: participant,
      senderName,
      chatName,
      message: text,
      text,
      timestamp,
      isGroup,
      chatJid: remoteJid,
      mode: 'live',
      replyTo: quoted || null,
      quotedMessage: quoted || null,
      rawMessage: msg.message
    };

    if (!fromMe && senderName && senderName !== 'You' && senderName !== 'Styx Operator') {
      if (isGroup) {
        this.recordChat({
          jid: remoteJid,
          lastMessageText: text,
          lastMessageTime: timestamp
        });
        if (participant && participant !== remoteJid) {
          this.recordContact({ id: participant, name: senderName });
        }
      } else {
        this.recordChat({
          jid: remoteJid,
          name: senderName,
          lastMessageText: text,
          lastMessageTime: timestamp
        });
        if (participant && participant !== remoteJid) {
          this.recordContact({ id: participant, name: senderName });
        }
        this.recordContact({ id: remoteJid, name: senderName });
      }
    } else if (isGroup) {
      this.recordChat({
        jid: remoteJid,
        lastMessageText: text,
        lastMessageTime: timestamp
      });
    }

    if (type === 'image' || type === 'sticker') {
      const ext = type === 'sticker' ? 'webp' : 'jpg';
      const existingFile = path.join(config.mediaDir, `${msg.key.id}.${ext}`);
      if (fs.existsSync(existingFile)) {
        item.mediaUrl = `http://localhost:${config.httpPort}/media/${msg.key.id}.${ext}`;
        item.mediaType = type;
        item.mediaPath = existingFile;
      }
    }

    this.recordHistory(item);

    if (!isHistoric && !fromMe && text) {
      if (type === 'image' || type === 'sticker') {
        downloadInboundMedia(msg, type, config.mediaDir, this.sock)
          .then((media) => {
            if (media) {
              item.mediaUrl = `http://localhost:${config.httpPort}/media/${media.filename}`;
              item.mediaType = media.mediaType;
              item.mediaPath = media.localPath;
              this.saveHistoryToDisk();
            }
            logger.info(
              { from: item.from, senderName, isGroup, textSnippet: text.substring(0, 50), mediaUrl: item.mediaUrl },
              'Inbound WhatsApp media message received and ready'
            );
            this.emit('message', item);
          })
          .catch((err) => {
            logger.warn({ err: err.message }, 'Failed downloading media for inbound message');
            this.emit('message', item);
          });
      } else {
        logger.info(
          { from: item.from, senderName, isGroup, textSnippet: text.substring(0, 50) },
          'Inbound WhatsApp message received'
        );
        this.emit('message', item);
      }
    }

    return item;
  }

  async connect() {
    if (this.sock && this.status === 'connected') {
      logger.info('Live WhatsApp socket is already connected');
      return this.userInfo;
    }

    if (this._connectingPromise) {
      logger.info('Live WhatsApp connection already in progress, awaiting existing promise...');
      return this._connectingPromise;
    }

    this._connectingPromise = (async () => {
      try {
        ensureSecureAuthDir();
        this.status = 'connecting';
        this.emit('connection', { state: 'connecting', mode: 'live' });
        logger.info({ authDir: config.authDir }, 'Initializing Live Baileys WhatsApp connection...');

        const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
        this.saveCreds = saveCreds;

        let version;
        try {
          const vResult = await fetchLatestBaileysVersion();
          version = vResult.version;
        } catch {
          version = [2, 3000, 1015901307];
        }

        const baileysLogger = pino({ level: 'error' }, process.stderr);

        this.sock = makeWASocket({
          version,
          logger: baileysLogger,
          printQRInTerminal: false,
          auth: state,
          browser: Browsers.ubuntu('Chrome'),
          syncFullHistory: true,
          markOnlineOnConnect: true,
          generateHighQualityLinkPreview: false,
          getMessage: async (key) => {
            const found = this.history.find((h) => h.messageId === key.id);
            if (found?.rawMessage) return found.rawMessage;
            if (found?.text || found?.message) return { conversation: found.text || found.message };
            return undefined;
          }
        });

        registerSocketListeners(this, this.sock, saveCreds);

        return this.userInfo;
      } finally {
        this._connectingPromise = null;
      }
    })();

    return this._connectingPromise;
  }

  async disconnect() {
    clearTimeout(this.reconnectTimeout);
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // If already closed
      }
      this.sock = null;
    }
    this.status = 'disconnected';
    this.emit('connection', { state: 'disconnected', mode: 'live' });
    logger.info('Live WhatsApp Bridge closed');
  }

  async logout() {
    clearTimeout(this.reconnectTimeout);
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // If already closed
      }
      this.sock = null;
    }
    this.status = 'disconnected';
    this.emit('connection', { state: 'disconnected', mode: 'live' });
    logger.info('Live WhatsApp Bridge logged out');
  }

  async sendMessage(to, text) {
    return sendLiveMessage(this, to, text);
  }

  async sendSticker(to, stickerIdOrBuffer) {
    return sendLiveSticker(this, to, stickerIdOrBuffer);
  }

  async sendReaction(to, messageId, emoji) {
    return sendLiveReaction(this, to, messageId, emoji);
  }

  async syncGroups() {
    if (!this.sock || typeof this.sock.groupFetchAllParticipating !== 'function') return {};
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      for (const [jid, meta] of Object.entries(groups)) {
        if (meta && meta.subject) {
          const existing = this.chats.get(jid) || {};
          this.chats.set(jid, {
            ...existing,
            jid,
            name: meta.subject,
            unreadCount: existing.unreadCount || 0,
            lastMessageTime: existing.lastMessageTime || meta.creation || 0,
            lastMessageText: existing.lastMessageText || ''
          });
        }
      }
      this.saveChatsToDisk();
      logger.info({ count: Object.keys(groups).length }, 'Synchronized WhatsApp group subjects');
      return groups;
    } catch (err) {
      logger.warn({ err: err?.message }, 'Failed to sync WhatsApp groups');
      return {};
    }
  }

  async fetchEarlierMessages(chatTarget, count = 50, timeoutMs = 4000) {
    return fetchEarlierMessagesForBridge(this, chatTarget, count, timeoutMs);
  }

  getStatus() {
    return {
      mode: 'live',
      status: this.status,
      user: this.userInfo,
      historyCount: this.history.length,
      chatCount: this.chats.size,
      hasQr: Boolean(this.latestQr)
    };
  }
}

export default LiveWhatsAppBridge;
