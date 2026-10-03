import logger from '../utils/logger.js';

/**
 * Resolves an individual WhatsApp identifier (phone, LID, or JID) to a human-readable contact name.
 *
 * @param {string} target
 * @param {object} bridgeContext
 * @param {Map<string, object>} [bridgeContext.contacts]
 * @param {Map<string, object>} [bridgeContext.chats]
 * @param {Array<object>} [bridgeContext.history]
 * @param {object} [bridgeContext.userInfo]
 * @returns {{ id: string, jid: string, name: string, isMe: boolean }}
 */
export function resolveContactName(target, { contacts, chats, history, userInfo } = {}) {
  if (!target || typeof target !== 'string') {
    return { id: '', jid: '', name: '', isMe: false };
  }

  const cleanId = target.replace(/@.*$/, '').replace(/:\d+$/, '').replace(/^\+/, '');
  const contactsMap = contacts || new Map();
  const chatsMap = chats || new Map();
  const historyArr = Array.isArray(history) ? history : [];

  // 1. Check if the target is the current user / Styx operator
  const myPhone = userInfo?.phone ? userInfo.phone.replace(/\D/g, '') : null;
  const myId = userInfo?.id ? userInfo.id.replace(/@.*$/, '').replace(/:\d+$/, '') : null;
  const isDirectMe = Boolean(
    (myPhone && cleanId === myPhone) ||
    (myId && cleanId === myId) ||
    (userInfo?.lid && target.includes(userInfo.lid.replace(/@.*$/, '')))
  );

  let isHistoryMe = false;
  if (!isDirectMe && historyArr.length > 0) {
    isHistoryMe = historyArr.some(
      (h) => h.direction === 'outbound' && h.senderJid && h.senderJid.replace(/@.*$/, '') === cleanId
    );
  }

  if (isDirectMe || isHistoryMe) {
    const rawName = userInfo?.name || 'You';
    return { id: cleanId, jid: target, name: rawName, isMe: true };
  }

  // 2. Lookup in contacts Map
  const directContact = contactsMap.get(target) ||
    contactsMap.get(`${cleanId}@lid`) ||
    contactsMap.get(`${cleanId}@s.whatsapp.net`);
  if (directContact?.name && directContact.name.trim()) {
    return { id: cleanId, jid: directContact.jid || target, name: directContact.name.trim(), isMe: false };
  }

  for (const contact of contactsMap.values()) {
    if (contact?.jid && contact.jid.replace(/@.*$/, '') === cleanId && contact.name && contact.name.trim()) {
      return { id: cleanId, jid: contact.jid, name: contact.name.trim(), isMe: false };
    }
  }

  // 3. Lookup in chats Map
  const directChat = chatsMap.get(target) || chatsMap.get(`${cleanId}@lid`) || chatsMap.get(`${cleanId}@s.whatsapp.net`);
  if (directChat?.name && directChat.name.trim() && !/^\d+$/.test(directChat.name.trim())) {
    return { id: cleanId, jid: directChat.jid || target, name: directChat.name.trim(), isMe: false };
  }

  for (const chat of chatsMap.values()) {
    if (chat?.jid && chat.jid.replace(/@.*$/, '') === cleanId && chat.name && chat.name.trim() && !/^\d+$/.test(chat.name.trim())) {
      return { id: cleanId, jid: chat.jid, name: chat.name.trim(), isMe: false };
    }
  }

  // 4. Lookup in recent message history
  for (const h of historyArr) {
    const senderMatch = h.senderJid && h.senderJid.replace(/@.*$/, '') === cleanId;
    const chatMatch = h.chatJid && h.chatJid.replace(/@.*$/, '') === cleanId;
    if ((senderMatch || chatMatch) && h.senderName && h.senderName.trim() && !/^\d+$/.test(h.senderName.trim())) {
      return { id: cleanId, jid: h.senderJid || target, name: h.senderName.trim(), isMe: false };
    }
  }

  // 5. Fallback formatting
  const isE164Phone = /^\d{10,13}$/.test(cleanId);
  const fallbackName = isE164Phone ? `+${cleanId}` : cleanId;

  return { id: cleanId, jid: target, name: fallbackName, isMe: false };
}

/**
 * Resolves @a_long_id mentions in message text into human-readable names.
 * Replaces @155500011122233 with @Alice or @You (Operator).
 *
 * @param {string} text Raw message text
 * @param {Array<string>} [mentionedJids=[]] JIDs extracted from contextInfo.mentionedJid
 * @param {object} bridgeContext Bridge containing contacts, chats, history, userInfo
 * @returns {{ text: string, rawText: string, mentions: Array<object>, isSelfTagged: boolean }}
 */
export function resolveMentionsInText(text, mentionedJids = [], bridgeContext = {}) {
  if (!text || typeof text !== 'string') {
    return { text: '', rawText: '', mentions: [], isSelfTagged: false };
  }

  const rawText = text;
  const candidates = new Set();

  if (Array.isArray(mentionedJids)) {
    for (const jid of mentionedJids) {
      if (typeof jid === 'string' && jid.trim()) {
        candidates.add(jid.trim());
      }
    }
  }

  // Also collect any @digits or @digits@domain pattern present in the text
  const textTagMatches = text.matchAll(/@([0-9]{7,16}(?:@(lid|s\.whatsapp\.net))?)/g);
  for (const match of textTagMatches) {
    if (match[1]) candidates.add(match[1]);
  }

  if (candidates.size === 0) {
    return { text, rawText, mentions: [], isSelfTagged: false };
  }

  let resolvedText = text;
  const resolvedMentions = [];
  const seenIds = new Set();

  for (const candidate of candidates) {
    const info = resolveContactName(candidate, bridgeContext);
    if (!info.id || seenIds.has(info.id)) continue;
    seenIds.add(info.id);

    let displayTag = `@${info.name}`;
    if (info.isMe) {
      displayTag = info.name && info.name !== 'You' && info.name !== 'Styx Operator'
        ? `@You (${info.name})`
        : '@You';
    }

    // Only replace in text if we found a genuine human name or if it's the operator
    const hasHumanName = info.isMe || (info.name && info.name !== info.id && info.name !== `+${info.id}`);
    if (hasHumanName) {
      // Replace @id@domain or @id
      const escapedId = info.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mentionRegex = new RegExp(`@${escapedId}(?:@(lid|s\\.whatsapp\\.net))?\\b`, 'g');
      resolvedText = resolvedText.replace(mentionRegex, displayTag);
    }

    resolvedMentions.push({
      id: info.id,
      jid: info.jid,
      name: info.name,
      display_tag: displayTag,
      is_me: info.isMe,
      original_tag: `@${info.id}`
    });
  }

  const isSelfTagged = resolvedMentions.some((m) => m.is_me);

  return {
    text: resolvedText,
    rawText,
    mentions: resolvedMentions,
    isSelfTagged
  };
}

/**
 * Inspects outbound message text for @Name tags and matches them to WhatsApp JIDs.
 *
 * @param {string} text Outbound message text
 * @param {object} bridge Bridge instance
 * @returns {{ text: string, mentions: Array<string> }}
 */
export function resolveOutboundMentions(text, bridge = {}) {
  if (!text || typeof text !== 'string') {
    return { text: '', mentions: [] };
  }

  const mentions = new Set();
  const contacts = bridge.contacts || new Map();
  const chats = bridge.chats || new Map();
  const history = Array.isArray(bridge.history) ? bridge.history : [];

  // Match @Word tokens in message text
  const matches = text.match(/@([A-Za-z0-9_\-\.\+]+)/g);
  if (!matches) {
    return { text, mentions: [] };
  }

  for (const rawTag of matches) {
    const target = rawTag.substring(1).trim().toLowerCase();
    if (!target) continue;

    // Check direct contacts
    for (const c of contacts.values()) {
      if (c.name && c.name.toLowerCase().includes(target)) {
        mentions.add(c.jid);
        break;
      }
    }

    // Check chats
    for (const chat of chats.values()) {
      if (chat.name && chat.name.toLowerCase().includes(target) && !chat.jid?.endsWith('@g.us')) {
        mentions.add(chat.jid);
        break;
      }
    }

    // Check history
    for (const h of history) {
      if (h.senderName && h.senderName.toLowerCase().includes(target)) {
        const jid = h.senderJid || h.chatJid;
        if (jid && !jid.endsWith('@g.us')) {
          mentions.add(jid);
          break;
        }
      }
    }
  }

  return {
    text,
    mentions: Array.from(mentions)
  };
}
