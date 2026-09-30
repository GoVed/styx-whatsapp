import WhatsAppBridgeBase from './base.js';
import { getSticker } from '../stickers/search.js';
import logger from '../utils/logger.js';

export class MockWhatsAppBridge extends WhatsAppBridgeBase {
  constructor() {
    super();
    this.mode = 'mock';
    this.userInfo = {
      id: '15550192834@s.whatsapp.net',
      phone: '+15550192834',
      name: 'Styx Operator (Offline Mock Simulator)'
    };
  }

  async connect() {
    this.status = 'connecting';
    this.emit('connection', { state: 'connecting', mode: 'mock' });
    logger.info('Initializing Mock WhatsApp Bridge (Offline Simulator)...');

    // Simulate instant handshake
    this.status = 'connected';
    this.emit('connection', {
      state: 'connected',
      mode: 'mock',
      user: this.userInfo
    });
    logger.info({ user: this.userInfo }, 'Mock WhatsApp Bridge connected successfully');
    return this.userInfo;
  }

  async disconnect() {
    this.status = 'disconnected';
    this.emit('connection', { state: 'disconnected', mode: 'mock' });
    logger.info('Mock WhatsApp Bridge disconnected');
  }

  async sendMessage(to, text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Message text is required');
    }
    const jid = this.formatJid(to);
    const messageId = `MOCK_OUT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const record = {
      direction: 'outbound',
      type: 'text',
      messageId,
      to: jid,
      text,
      timestamp,
      status: 'delivered'
    };

    this.recordHistory(record);
    logger.info({ to: jid, messageId, text }, '[MOCK WHATSAPP] Outbound message sent');

    return {
      success: true,
      messageId,
      to: jid,
      text,
      timestamp,
      mode: 'mock'
    };
  }

  async sendSticker(to, stickerIdOrBuffer) {
    const jid = this.formatJid(to);
    let stickerId = 'custom';
    let stickerName = 'Custom Sticker';

    if (typeof stickerIdOrBuffer === 'string') {
      stickerId = stickerIdOrBuffer;
      const found = getSticker(stickerId);
      if (found) {
        stickerName = found.name;
      }
    }

    const messageId = `MOCK_STK_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const record = {
      direction: 'outbound',
      type: 'sticker',
      messageId,
      to: jid,
      stickerId,
      stickerName,
      timestamp,
      status: 'delivered'
    };

    this.recordHistory(record);
    logger.info({ to: jid, stickerId, stickerName, messageId }, '[MOCK WHATSAPP] Outbound sticker sent');

    return {
      success: true,
      messageId,
      to: jid,
      stickerId,
      stickerName,
      timestamp,
      mode: 'mock'
    };
  }

  async sendReaction(to, messageId, emoji) {
    if (!messageId) {
      throw new Error('Target messageId is required for reaction');
    }
    if (!emoji) {
      throw new Error('Reaction emoji is required');
    }
    const jid = this.formatJid(to);
    const timestamp = Math.floor(Date.now() / 1000);

    const record = {
      direction: 'outbound',
      type: 'reaction',
      to: jid,
      targetMessageId: messageId,
      emoji,
      timestamp
    };

    this.recordHistory(record);
    logger.info({ to: jid, messageId, emoji }, '[MOCK WHATSAPP] Reaction dispatched');

    return {
      success: true,
      to: jid,
      messageId,
      emoji,
      timestamp,
      mode: 'mock'
    };
  }

  async fetchEarlierMessages(to, count = 50) {
    const jid = this.formatJid(to);
    return {
      success: true,
      jid,
      requestedCount: count,
      totalMessagesInChat: this.getHistory({ chat: jid }).length,
      newMessagesFetched: 0,
      mode: 'mock'
    };
  }

  /**
   * Simulates an incoming WhatsApp message (e.g. from a friend or external contact)
   * and fires the 'message' event for the Styx relay.
   *
   * @param {object} options
   * @param {string} options.from Sender phone number or JID
   * @param {string} options.message Incoming text content
   * @param {string} [options.senderName='Alice']
   * @param {boolean} [options.isGroup=false]
   * @param {string} [options.groupId]
   * @returns {object} The dispatched inbound event object
   */
  simulateInboundMessage({
    from = '+1234567890',
    message = 'Hello from WhatsApp!',
    senderName = 'Alice',
    isGroup = false,
    groupId = null,
    groupName = null,
    chatName = null
  } = {}) {
    const senderJid = this.formatJid(from);
    const chatJid = isGroup && groupId ? this.formatJid(groupId) : senderJid;
    const messageId = `MOCK_IN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const inboundEvent = {
      from: from.replace(/@.*$/, ''),
      senderJid,
      senderName,
      chatName: chatName || groupName || (isGroup ? 'Mock Group' : senderName),
      groupName: groupName || (isGroup ? 'Mock Group' : null),
      message,
      messageId,
      timestamp,
      isGroup: Boolean(isGroup),
      chatJid,
      mode: 'mock'
    };

    this.recordHistory({
      direction: 'inbound',
      type: 'text',
      ...inboundEvent
    });

    logger.info({ from: inboundEvent.from, senderName, message }, '[MOCK WHATSAPP] Simulating inbound message');
    this.emit('message', inboundEvent);

    return inboundEvent;
  }

  getStatus() {
    return {
      mode: 'mock',
      status: this.status,
      user: this.userInfo,
      historyCount: this.history.length,
      simulated: true
    };
  }
}

export default MockWhatsAppBridge;
