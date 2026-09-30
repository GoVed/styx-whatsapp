import { EventEmitter } from 'node:events';
import path from 'node:path';
import config from '../config.js';
import { formatRecipientJid } from './jid.js';
import { filterHistory, recordBatchItems } from './history-ops.js';
import {
  loadBridgeStateFromDisk,
  saveHistoryToDisk,
  saveChatsToDisk,
  saveContactsToDisk
} from './storage.js';

export { formatRecipientJid };

/**
 * Abstract Base Class for WhatsApp Bridges (Live & Mock)
 */
export class WhatsAppBridgeBase extends EventEmitter {
  constructor() {
    super();
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
    this.userInfo = null; // { id: string, name: string, phone: string }
    this.maxHistory = config.maxHistory || 50000;
    this.history = [];
    this.chats = new Map(); // jid -> { jid, name, unreadCount, lastMessageText, lastMessageTime }
    this.contacts = new Map(); // jid -> { jid, name, notify }
    this.historyFilePath = path.join(config.authDir, 'history.json');
    this.chatsFilePath = path.join(config.authDir, 'chats.json');
    this.contactsFilePath = path.join(config.authDir, 'contacts.json');

    this.loadStateFromDisk();
  }

  /**
   * Loads cached history, chat metadata, and contacts from disk.
   */
  loadStateFromDisk() {
    const { history, chats, contacts } = loadBridgeStateFromDisk({
      historyFilePath: this.historyFilePath,
      chatsFilePath: this.chatsFilePath,
      contactsFilePath: this.contactsFilePath
    }, this.maxHistory);
    this.history = history;
    this.chats = chats;
    this.contacts = contacts;
  }

  /**
   * Persists current message history to disk.
   */
  saveHistoryToDisk() {
    saveHistoryToDisk(this.historyFilePath, this.history, this.maxHistory);
  }

  /**
   * Persists current chats to disk.
   */
  saveChatsToDisk() {
    saveChatsToDisk(this.chatsFilePath, this.chats);
  }

  /**
   * Persists contacts list to disk.
   */
  saveContactsToDisk() {
    saveContactsToDisk(this.contactsFilePath, this.contacts);
  }

  /**
   * Normalizes a phone number or target into a valid WhatsApp JID.
   * @param {string} to
   * @returns {string}
   */
  formatJid(to) {
    return formatRecipientJid(to, this.contacts, this.chats, this.history);
  }

  /**
   * Records a message to in-memory message history buffer and persists to disk.
   * @param {object} item
   */
  recordHistory(item) {
    if (!item) return;
    // Guard against empty or blank non-media records entering history
    if (!item.text && !item.message && item.type !== 'sticker' && item.type !== 'image' && item.type !== 'video' && item.type !== 'audio' && item.type !== 'document') {
      return;
    }

    // Avoid duplicate message IDs
    if (item.messageId) {
      const idx = this.history.findIndex(h => h.messageId === item.messageId);
      if (idx !== -1) {
        // Update existing record
        this.history[idx] = { ...this.history[idx], ...item };
        this.history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return;
      }
    }

    const recordedItem = {
      ...item,
      timestamp: item.timestamp || Math.floor(Date.now() / 1000),
      chatJid: item.chatJid || item.to || item.senderJid,
      recordedAt: item.recordedAt || new Date().toISOString()
    };

    this.history.push(recordedItem);
    this.history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (this.history.length > this.maxHistory) {
      this.history.length = this.maxHistory;
    }

    // Update chat last message
    const chatJid = item.chatJid || item.to || item.senderJid;
    if (chatJid) {
      const existingChat = this.chats.get(chatJid) || { jid: chatJid };
      const fallbackName = chatJid.replace(/@.*$/, '');
      const isGroup = chatJid.endsWith('@g.us');
      const isOutbound = item.direction === 'outbound';
      let chatName = existingChat.name;

      if (!isGroup) {
        if (!chatName || chatName === fallbackName || chatName === 'Styx Operator' || chatName === 'You') {
          if (!isOutbound && item.senderName && item.senderName !== 'Styx Operator' && item.senderName !== 'You') {
            chatName = item.senderName;
          } else if (isOutbound && item.targetName && item.targetName !== fallbackName) {
            chatName = item.targetName;
          } else {
            chatName = chatName || fallbackName;
          }
        }
      }

      const isNewer = !existingChat.lastMessageTime || (item.timestamp && item.timestamp >= existingChat.lastMessageTime);
      const lastMessageText = isNewer ? (item.message || item.text || existingChat.lastMessageText || '') : existingChat.lastMessageText;
      const lastMessageTime = isNewer ? (item.timestamp || existingChat.lastMessageTime) : existingChat.lastMessageTime;

      this.chats.set(chatJid, {
        ...existingChat,
        name: chatName || existingChat.name || fallbackName,
        lastMessageText,
        lastMessageTime
      });
      this.saveChatsToDisk();
    }

    this.saveHistoryToDisk();
  }

  /**
   * Bulk records historical or batch messages with deduplication and single disk persist.
   * @param {Array<object>} items
   * @returns {number} Number of new items ingested
   */
  recordHistoryBatch(items) {
    const addedCount = recordBatchItems({
      items,
      history: this.history,
      chats: this.chats,
      maxHistory: this.maxHistory
    });
    if (addedCount > 0) {
      this.saveHistoryToDisk();
      this.saveChatsToDisk();
    }
    return addedCount;
  }

  /**
   * Records or updates chat metadata.
   * @param {object} chat
   */
  recordChat(chat) {
    if (!chat.jid) return;
    const isGroup = chat.jid.endsWith('@g.us');
    const existing = this.chats.get(chat.jid) || {};
    const fallbackName = chat.jid.replace(/@.*$/, '');
    let name = chat.name || existing.name || fallbackName;

    // Never overwrite an established group or contact name with generic fallback or operator
    if (existing.name && existing.name !== fallbackName && existing.name !== 'Styx Operator') {
      if (!chat.name || chat.name === fallbackName || chat.name === 'Styx Operator') {
        name = existing.name;
      }
    }

    this.chats.set(chat.jid, {
      ...existing,
      ...chat,
      name
    });
    this.saveChatsToDisk();
  }

  /**
   * Records contact metadata.
   * @param {object} contact
   */
  recordContact(contact) {
    if (!contact.id) return;
    const name = contact.name || contact.notify || contact.verifiedName || '';
    this.contacts.set(contact.id, {
      jid: contact.id,
      name
    });
    this.saveContactsToDisk();
  }

  /**
   * Returns recent chats list.
   * @param {number} [limit=20]
   * @returns {Array<object>}
   */
  getChats(limit = 20) {
    const list = Array.from(this.chats.values());
    list.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    return list.slice(0, limit);
  }

  /**
   * Returns recent message history with optional filtering.
   * @param {number|object} [options=50]
   * @returns {Array<object>}
   */
  getHistory(options = 50) {
    return filterHistory(this.history, this.chats, this.contacts, options);
  }

  /**
   * Abstract connection methods
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  async sendMessage(to, text) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  async sendSticker(to, stickerIdOrBuffer) {
    throw new Error('sendSticker() must be implemented by subclass');
  }

  async sendReaction(to, messageId, emoji) {
    throw new Error('sendReaction() must be implemented by subclass');
  }

  async fetchEarlierMessages(to, count = 50) {
    throw new Error('fetchEarlierMessages() must be implemented by subclass');
  }

  getStatus() {
    return {
      status: this.status,
      user: this.userInfo,
      historyCount: this.history.length,
      chatCount: this.chats.size
    };
  }
}

export default WhatsAppBridgeBase;
