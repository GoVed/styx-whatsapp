import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  isJidNewsletter,
  isJidStatusBroadcast
} from '@whiskeysockets/baileys';
import pino from 'pino';
import WhatsAppBridgeBase from './base.js';
import {
  sendLiveMessage,
  sendLiveSticker,
  sendLiveReaction,
  sendLiveImage,
  sendLiveGif
} from './outbound.js';
import config, { ensureSecureAuthDir } from '../config.js';
import logger from '../utils/logger.js';
import { parseWhatsAppMessageContent } from './parser.js';
import { registerSocketListeners } from './listeners.js';
import { fetchEarlierMessagesForBridge } from './history-fetch.js';
import { processRawMessage, processReactionUpdate } from './message-processor.js';

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
    return processRawMessage(this, msg, isHistoric);
  }

  /**
   * Processes an incoming reaction update from Baileys messages.reaction event.
   *
   * @param {object} reactionUpdate
   * @returns {object|null}
   */
  processReactionUpdate(reactionUpdate) {
    return processReactionUpdate(this, reactionUpdate);
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
          syncFullHistory: false,
          shouldSyncHistoryMessage: () => false,
          markOnlineOnConnect: false,
          fireInitQueries: false,
          maxMsgRetryCount: 0,
          retryRequestDelayMs: 5000,
          placeholderResendCache: {
            get: () => true,
            set: () => {},
            del: () => {}
          },
          shouldIgnoreJid: (jid) => isJidNewsletter(jid) || isJidStatusBroadcast(jid),
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

  async sendMessage(to, text, options = {}) {
    return sendLiveMessage(this, to, text, options);
  }

  async sendSticker(to, stickerIdOrBuffer) {
    return sendLiveSticker(this, to, stickerIdOrBuffer);
  }

  async sendImage(to, imageSource, caption) {
    return sendLiveImage(this, to, imageSource, caption);
  }

  async sendGif(to, gifSource, caption) {
    return sendLiveGif(this, to, gifSource, caption);
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
            participants: meta.participants || existing.participants || [],
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
