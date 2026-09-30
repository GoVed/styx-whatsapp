/**
 * WhatsApp Bridge History & Filtering Operations
 */

/**
 * Returns filtered message history based on criteria.
 * @param {Array<object>} history
 * @param {Map<string, object>} chats
 * @param {Map<string, object>} contacts
 * @param {number|object} [options=50]
 * @returns {Array<object>}
 */
export function filterHistory(history, chats, contacts, options = 50) {
  let limit = 50;
  let chatJid = null;
  let search = null;

  if (typeof options === 'number') {
    limit = options;
  } else if (typeof options === 'object' && options !== null) {
    if (typeof options.limit === 'number') limit = options.limit;
    if (options.chatJid) chatJid = options.chatJid.toLowerCase();
    if (options.chat) chatJid = options.chat.toLowerCase();
    if (options.search) search = options.search.toLowerCase();
  }

  let filtered = history;

  if (chatJid) {
    const cleanTarget = chatJid.replace(/\D/g, '');
    const matchedJids = new Set();
    for (const chat of chats.values()) {
      if (chat.name && chat.name.toLowerCase().includes(chatJid)) {
        matchedJids.add(chat.jid.toLowerCase());
      }
    }
    for (const contact of contacts.values()) {
      if (contact.name && contact.name.toLowerCase().includes(chatJid)) {
        if (contact.jid) matchedJids.add(contact.jid.toLowerCase());
      }
    }

    filtered = filtered.filter(h => {
      const jid = (h.chatJid || h.to || h.senderJid || '').toLowerCase();
      const from = (h.from || '').replace(/\D/g, '');
      const sender = (h.senderName || h.targetName || '').toLowerCase();
      const cName = (h.chatName || '').toLowerCase();
      return jid.includes(chatJid) ||
             matchedJids.has(jid) ||
             sender.includes(chatJid) ||
             cName.includes(chatJid) ||
             (cleanTarget && cleanTarget.length >= 5 && from.includes(cleanTarget));
    });
  }

  if (search) {
    filtered = filtered.filter(h =>
      (h.message && h.message.toLowerCase().includes(search)) ||
      (h.text && h.text.toLowerCase().includes(search)) ||
      (h.senderName && h.senderName.toLowerCase().includes(search)) ||
      (h.chatName && h.chatName.toLowerCase().includes(search))
    );
  }

  return filtered.slice(0, limit);
}

/**
 * Ingests a batch of historical items into the history array and updates chat map.
 * @param {object} params
 * @param {Array<object>} params.items
 * @param {Array<object>} params.history
 * @param {Map<string, object>} params.chats
 * @param {number} params.maxHistory
 * @returns {number} Count of added items
 */
export function recordBatchItems({ items, history, chats, maxHistory }) {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const existingIds = new Set(history.map(h => h.messageId));
  const existingSignatures = new Set(
    history.map(h => `${h.chatJid || ''}|${h.timestamp || 0}|${h.text || h.message || ''}`)
  );

  let addedCount = 0;
  const chatUpdates = new Map();

  for (const rawItem of items) {
    if (!rawItem) continue;
    const chatJid = rawItem.chatJid || rawItem.to || rawItem.senderJid;
    const sig = `${chatJid || ''}|${rawItem.timestamp || 0}|${rawItem.text || rawItem.message || ''}`;

    if (rawItem.messageId && existingIds.has(rawItem.messageId)) continue;
    if (existingSignatures.has(sig)) continue;

    const item = {
      ...rawItem,
      chatJid,
      recordedAt: rawItem.recordedAt || new Date().toISOString()
    };

    history.push(item);
    if (item.messageId) existingIds.add(item.messageId);
    existingSignatures.add(sig);
    addedCount++;

    if (chatJid) {
      const prev = chatUpdates.get(chatJid);
      if (!prev || (item.timestamp && item.timestamp > (prev.timestamp || 0))) {
        chatUpdates.set(chatJid, item);
      }
    }
  }

  if (addedCount > 0) {
    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (history.length > maxHistory) {
      history.length = maxHistory;
    }

    for (const [chatJid, item] of chatUpdates.entries()) {
      const existingChat = chats.get(chatJid) || { jid: chatJid };
      const fallbackName = chatJid.replace(/@.*$/, '');
      const isGroup = chatJid.endsWith('@g.us');
      let chatName = item.chatName || existingChat.name;
      if (!isGroup && (!chatName || chatName === fallbackName)) {
        chatName = item.senderName || fallbackName;
      }

      const isNewer = !existingChat.lastMessageTime || (item.timestamp && item.timestamp >= existingChat.lastMessageTime);
      const lastMessageText = isNewer ? (item.message || item.text || existingChat.lastMessageText || '') : existingChat.lastMessageText;
      const lastMessageTime = isNewer ? (item.timestamp || existingChat.lastMessageTime) : existingChat.lastMessageTime;

      chats.set(chatJid, {
        ...existingChat,
        name: chatName || existingChat.name || fallbackName,
        lastMessageText,
        lastMessageTime
      });
    }
  }

  return addedCount;
}
