import WhatsAppBridgeBase from './base.js';
import { getSticker } from '../stickers/search.js';
import { resolveMentionsInText, resolveOutboundMentions } from './mentions.js';
import { applyReactionToHistory } from './history-ops.js';
import logger from '../utils/logger.js';

export class MockWhatsAppBridge extends WhatsAppBridgeBase {
  constructor() {
    super();
    this.mode = 'mock';
    this.userInfo = { id: '15550192834@s.whatsapp.net', phone: '+15550192834', name: 'Styx Operator (Offline Mock Simulator)' };
  }

  async connect() {
    this.status = 'connecting';
    this.emit('connection', { state: 'connecting', mode: 'mock' });
    logger.info('Initializing Mock WhatsApp Bridge (Offline Simulator)...');
    this.status = 'connected';
    this.emit('connection', { state: 'connected', mode: 'mock', user: this.userInfo });
    logger.info({ user: this.userInfo }, 'Mock WhatsApp Bridge connected successfully');
    return this.userInfo;
  }

  async disconnect() {
    this.status = 'disconnected';
    this.emit('connection', { state: 'disconnected', mode: 'mock' });
    logger.info('Mock WhatsApp Bridge disconnected');
  }

  async sendMessage(to, text, options = {}) {
    if (!text || typeof text !== 'string') throw new Error('Message text is required');
    const jid = this.formatJid(to);
    const messageId = `MOCK_OUT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const resolved = resolveOutboundMentions(text, this, { chatJid: jid, explicitMentions: options?.mentions });
    const mentions = resolved.mentions;
    const wireText = resolved.wireText || text;

    const record = {
      direction: 'outbound',
      type: 'text',
      messageId,
      to: jid,
      text: resolved.text || text,
      rawText: wireText,
      message: resolved.text || text,
      mentions: resolved.resolvedMentions || mentions,
      timestamp,
      status: 'delivered'
    };
    this.recordHistory(record);
    logger.info({ to: jid, messageId, text: resolved.text || text, mentionsCount: mentions.length }, '[MOCK WHATSAPP] Outbound message sent');
    return { success: true, messageId, to: jid, text: resolved.text || text, rawText: wireText, mentions, timestamp, mode: 'mock' };
  }

  async sendSticker(to, stickerIdOrBuffer) {
    const jid = this.formatJid(to);
    let stickerId = 'custom', stickerName = 'Custom Sticker';
    if (typeof stickerIdOrBuffer === 'string') {
      stickerId = stickerIdOrBuffer;
      const found = getSticker(stickerId);
      if (found) stickerName = found.name;
    }
    const messageId = `MOCK_STK_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const record = { direction: 'outbound', type: 'sticker', messageId, to: jid, stickerId, stickerName, timestamp, status: 'delivered' };
    this.recordHistory(record);
    logger.info({ to: jid, stickerId, stickerName, messageId }, '[MOCK WHATSAPP] Outbound sticker sent');
    return { success: true, messageId, to: jid, stickerId, stickerName, timestamp, mode: 'mock' };
  }

  async sendImage(to, imageSource, caption = '') {
    if (!imageSource) throw new Error('Image source (URL, file path, base64, or Buffer) is required');
    const jid = this.formatJid(to);
    const messageId = `MOCK_IMG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const capResolved = caption ? resolveOutboundMentions(caption, this, { chatJid: jid }) : null;
    const resolvedCaption = capResolved?.text || caption || '';
    const wireCaption = capResolved?.wireText || caption || '';
    const mentions = capResolved?.mentions || [];
    const record = {
      direction: 'outbound', type: 'image', messageId, to: jid, caption: resolvedCaption, rawCaption: wireCaption,
      text: resolvedCaption || '[Image]', message: resolvedCaption || '[Image]',
      mentions: capResolved?.resolvedMentions || mentions,
      mediaSource: typeof imageSource === 'string' ? imageSource : 'buffer', timestamp, status: 'delivered'
    };
    this.recordHistory(record);
    logger.info({ to: jid, messageId, caption: resolvedCaption }, '[MOCK WHATSAPP] Outbound image sent');
    return { success: true, messageId, to: jid, caption: resolvedCaption, rawCaption: wireCaption, mentions, timestamp, mode: 'mock' };
  }

  async sendGif(to, gifSource, caption = '') {
    if (!gifSource) throw new Error('GIF source (URL, file path, base64, or Buffer) is required');
    const jid = this.formatJid(to);
    const messageId = `MOCK_GIF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const capResolved = caption ? resolveOutboundMentions(caption, this, { chatJid: jid }) : null;
    const resolvedCaption = capResolved?.text || caption || '';
    const wireCaption = capResolved?.wireText || caption || '';
    const mentions = capResolved?.mentions || [];
    const record = {
      direction: 'outbound', type: 'gif', messageId, to: jid, caption: resolvedCaption, rawCaption: wireCaption,
      text: resolvedCaption || '[GIF]', message: resolvedCaption || '[GIF]',
      mentions: capResolved?.resolvedMentions || mentions,
      mediaSource: typeof gifSource === 'string' ? gifSource : 'buffer', timestamp, status: 'delivered'
    };
    this.recordHistory(record);
    logger.info({ to: jid, messageId, caption: resolvedCaption }, '[MOCK WHATSAPP] Outbound GIF sent');
    return { success: true, messageId, to: jid, caption: resolvedCaption, rawCaption: wireCaption, mentions, timestamp, mode: 'mock' };
  }

  async sendReaction(to, messageId, emoji) {
    const jid = this.formatJid(to);
    let targetId = messageId;
    let targetMsg = null;

    if (!targetId || targetId === 'latest' || targetId === 'last') {
      targetMsg = this.history.slice().reverse().find(h =>
        (h.chatJid === jid || h.to === jid || h.from === jid || h.senderJid === jid) &&
        h.messageId && !h.messageId.startsWith('react_') && h.type !== 'reaction'
      );
      if (!targetMsg) throw new Error(`No messages found in chat "${to}" to react to`);
      targetId = targetMsg.messageId;
    } else {
      targetMsg = this.history.find(h => h.messageId === targetId) || null;
    }

    const cleanEmoji = typeof emoji === 'string' ? emoji.trim() : '';
    const isRemove = !cleanEmoji || cleanEmoji === 'none' || cleanEmoji === 'remove';
    const reactionText = isRemove ? '' : cleanEmoji;
    const timestamp = Math.floor(Date.now() / 1000);

    applyReactionToHistory({
      history: this.history,
      targetMessageId: targetId,
      emoji: reactionText,
      senderName: 'You',
      senderJid: this.userInfo?.id || null,
      fromMe: true,
      timestamp
    });

    const record = {
      direction: 'outbound',
      type: 'reaction',
      to: jid,
      targetMessageId: targetId,
      emoji: reactionText,
      isRemoved: isRemove,
      timestamp
    };
    this.recordHistory(record);
    logger.info({ to: jid, messageId: targetId, emoji: reactionText, isRemove }, '[MOCK WHATSAPP] Reaction dispatched');

    return { success: true, to: jid, messageId: targetId, emoji: reactionText, isRemoved: isRemove, timestamp, mode: 'mock' };
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
    chatName = null,
    mentions = []
  } = {}) {
    const senderJid = this.formatJid(from);
    const chatJid = isGroup && groupId ? this.formatJid(groupId) : senderJid;
    const messageId = `MOCK_IN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const resolved = resolveMentionsInText(message, mentions, this);
    const finalMessage = resolved.text;

    const inboundEvent = {
      from: from.replace(/@.*$/, ''),
      senderJid,
      senderName,
      chatName: chatName || groupName || (isGroup ? 'Mock Group' : senderName),
      groupName: groupName || (isGroup ? 'Mock Group' : null),
      message: finalMessage,
      text: finalMessage,
      rawText: resolved.rawText,
      mentions: resolved.mentions,
      isSelfTagged: resolved.isSelfTagged,
      messageId,
      timestamp,
      date: new Date(timestamp * 1000).toISOString(),
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

  simulateInboundReaction({
    from = '+1234567890',
    targetMessageId = null,
    emoji = '❤️',
    senderName = 'Alice',
    isGroup = false,
    groupId = null,
    chatName = null
  } = {}) {
    const senderJid = this.formatJid(from);
    const chatJid = isGroup && groupId ? this.formatJid(groupId) : senderJid;
    let targetId = targetMessageId;
    let target = null;

    if (!targetId || targetId === 'latest' || targetId === 'last') {
      target = this.history.slice().reverse().find(h =>
        (h.chatJid === chatJid || h.to === chatJid || h.from === chatJid) &&
        h.messageId && !h.messageId.startsWith('react_') && h.type !== 'reaction'
      );
      targetId = target?.messageId || null;
    } else {
      target = this.history.find(h => h.messageId === targetId) || null;
    }

    const cleanEmoji = typeof emoji === 'string' ? emoji.trim() : '';
    const isRemoved = !cleanEmoji || cleanEmoji === 'none' || cleanEmoji === 'remove';
    const timestamp = Math.floor(Date.now() / 1000);

    if (targetId) {
      applyReactionToHistory({
        history: this.history,
        targetMessageId: targetId,
        emoji: cleanEmoji,
        senderName,
        senderJid,
        timestamp,
        fromMe: false
      });
    }

    const targetText = target?.text || target?.message || null;
    const msgText = isRemoved
      ? (targetText ? `Removed reaction from "${targetText}"` : 'Removed reaction')
      : (targetText ? `Reacted ${cleanEmoji} to "${targetText}"` : `Reacted ${cleanEmoji}`);

    const inboundEvent = {
      messageId: `react_${targetId || Date.now()}_${timestamp}`,
      direction: 'inbound',
      type: 'reaction',
      reaction: cleanEmoji,
      isRemoved,
      targetMessageId: targetId,
      targetMessageText: targetText,
      targetSenderName: target?.senderName || null,
      from: from.replace(/@.*$/, ''),
      senderJid,
      senderName,
      chatName: chatName || (isGroup ? 'Mock Group' : senderName),
      chatJid,
      isGroup: Boolean(isGroup),
      message: msgText,
      text: msgText,
      timestamp,
      date: new Date(timestamp * 1000).toISOString(),
      mode: 'mock'
    };

    logger.info({ from: inboundEvent.from, senderName, emoji: cleanEmoji, targetMessageId: targetId }, '[MOCK WHATSAPP] Simulating inbound reaction');
    this.emit('reaction', inboundEvent);
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
