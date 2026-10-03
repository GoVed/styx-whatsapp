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
  const myPhone = userInfo?.phone?.replace(/\D/g, '');
  const myId = userInfo?.id?.replace(/@.*$/, '')?.replace(/:\d+$/, '');
  const isDirectMe = Boolean((myPhone && cleanId === myPhone) || (myId && cleanId === myId) || (userInfo?.lid && target.includes(userInfo.lid.replace(/@.*$/, ''))));
  const isHistoryMe = !isDirectMe && historyArr.some(h => h.direction === 'outbound' && h.senderJid?.replace(/@.*$/, '') === cleanId);
  if (isDirectMe || isHistoryMe) {
    return { id: cleanId, jid: target, name: userInfo?.name || 'You', isMe: true };
  }

  // 2. Lookup in contacts Map
  const directContact = contactsMap.get(target) || contactsMap.get(`${cleanId}@lid`) || contactsMap.get(`${cleanId}@s.whatsapp.net`);
  if (directContact?.name?.trim()) return { id: cleanId, jid: directContact.jid || target, name: directContact.name.trim(), isMe: false };
  for (const contact of contactsMap.values()) {
    if (contact?.jid?.replace(/@.*$/, '') === cleanId && contact.name?.trim()) {
      return { id: cleanId, jid: contact.jid, name: contact.name.trim(), isMe: false };
    }
  }

  // 3. Lookup in chats Map
  const directChat = chatsMap.get(target) || chatsMap.get(`${cleanId}@lid`) || chatsMap.get(`${cleanId}@s.whatsapp.net`);
  if (directChat?.name?.trim() && !/^\d+$/.test(directChat.name.trim())) return { id: cleanId, jid: directChat.jid || target, name: directChat.name.trim(), isMe: false };
  for (const chat of chatsMap.values()) {
    if (chat?.jid?.replace(/@.*$/, '') === cleanId && chat.name?.trim() && !/^\d+$/.test(chat.name.trim())) {
      return { id: cleanId, jid: chat.jid, name: chat.name.trim(), isMe: false };
    }
  }

  // 4. Lookup in recent message history
  for (const h of historyArr) {
    const isMatch = (h.senderJid && h.senderJid.replace(/@.*$/, '') === cleanId) || (h.chatJid && h.chatJid.replace(/@.*$/, '') === cleanId);
    if (isMatch && h.senderName?.trim() && !/^\d+$/.test(h.senderName.trim())) {
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
  const textTagMatches = text.matchAll(/@([0-9]{5,20}(?:@(lid|s\.whatsapp\.net))?)/g);
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
 * Replaces @Name in wireText with @<clean_id> for the WhatsApp Baileys wire protocol,
 * ensuring WhatsApp mobile and web clients format mentions as clickable blue tags and send push alerts.
 *
 * @param {string} text Outbound message text (human-readable, e.g. "Hello @Jiten Parmar")
 * @param {object} bridge Bridge instance with contacts, chats, history, userInfo
 * @param {object} [options]
 * @param {string} [options.chatJid] The target chat/group JID
 * @param {Array<string>} [options.explicitMentions] Explicit mention names/JIDs from tool args
 * @returns {{ text: string, wireText: string, mentions: Array<string>, resolvedMentions: Array<object> }}
 */
export function resolveOutboundMentions(text, bridge = {}, options = {}) {
  if (!text || typeof text !== 'string') {
    return { text: '', wireText: '', mentions: [], resolvedMentions: [] };
  }

  const chatJid = options.chatJid || '';
  const explicitMentions = Array.isArray(options.explicitMentions) ? options.explicitMentions : [];
  const mentions = new Set();
  const resolvedMentions = [];
  const contacts = bridge.contacts || new Map();
  const chats = bridge.chats || new Map();
  const history = Array.isArray(bridge.history) ? bridge.history : [];
  const userInfo = bridge.userInfo || {};

  // Build candidate pool: Map cleanId -> { id, jid, name }
  const candidatesMap = new Map();
  const addCandidate = (rawJid, rawName) => {
    if (!rawJid || typeof rawJid !== 'string') return;
    if (rawJid.endsWith('@g.us') || rawJid === 'status@broadcast') return;
    const cleanId = rawJid.replace(/@.*$/, '').replace(/:\d+$/, '').replace(/^\+/, '');
    if (!cleanId) return;
    const name = (rawName || '').trim();
    if (!candidatesMap.has(cleanId) || (name && !/^\+?\d+$/.test(name))) {
      candidatesMap.set(cleanId, {
        id: cleanId,
        jid: rawJid.includes('@') ? rawJid : `${cleanId}@s.whatsapp.net`,
        name: name || cleanId
      });
    }
  };

  // 1. If in group, prioritize group participants and recent group senders
  if (chatJid && chatJid.endsWith('@g.us')) {
    const groupChat = chats.get(chatJid);
    if (Array.isArray(groupChat?.participants)) {
      for (const p of groupChat.participants) {
        const pJid = typeof p === 'string' ? p : p?.id;
        const contact = contacts.get(pJid);
        addCandidate(pJid, contact?.name || pJid.replace(/@.*$/, ''));
      }
    }
    for (const h of history) {
      if (h.chatJid === chatJid && h.senderJid) {
        addCandidate(h.senderJid, h.senderName);
      }
    }
  }

  // 2. Global contacts & non-group chats
  for (const c of contacts.values()) {
    if (c?.jid) addCandidate(c.jid, c.name);
  }
  for (const c of chats.values()) {
    if (c?.jid && !c.jid.endsWith('@g.us')) addCandidate(c.jid, c.name);
  }

  // 3. Global history & user themselves
  for (const h of history) {
    if (h.senderJid) addCandidate(h.senderJid, h.senderName);
  }
  if (userInfo?.id) {
    addCandidate(userInfo.id, userInfo.name || 'You');
  }

  let wireText = text;
  const isGroup = Boolean(chatJid && chatJid.endsWith('@g.us'));

  // 4. Handle @everyone or @all
  const hasEveryoneTag = /(?:^|[^a-zA-Z0-9_])@(everyone|all)\b/i.test(text) ||
    explicitMentions.some(m => typeof m === 'string' && /^(everyone|all)$/i.test(m.trim()));

  if (isGroup && hasEveryoneTag) {
    const groupChat = chats.get(chatJid);
    if (Array.isArray(groupChat?.participants)) {
      for (const p of groupChat.participants) {
        const pJid = typeof p === 'string' ? p : p?.id;
        if (pJid && !pJid.endsWith('@g.us')) mentions.add(pJid);
      }
    }
    for (const h of history) {
      if (h.chatJid === chatJid && h.senderJid && !h.senderJid.endsWith('@g.us')) {
        mentions.add(h.senderJid);
      }
    }
  }

  // 5. Explicit mentions passed via options
  for (const raw of explicitMentions) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const clean = raw.trim();
    if (/^(everyone|all)$/i.test(clean)) continue;

    if (clean.includes('@s.whatsapp.net') || clean.includes('@lid')) {
      mentions.add(clean);
      const cleanId = clean.replace(/@.*$/, '').replace(/:\d+$/, '');
      const cand = candidatesMap.get(cleanId);
      resolvedMentions.push({ id: cleanId, jid: clean, name: cand?.name || cleanId, display_tag: `@${cand?.name || cleanId}` });
    } else {
      const numericOnly = clean.replace(/\D/g, '');
      const cand = (numericOnly && candidatesMap.get(numericOnly)) ||
        Array.from(candidatesMap.values()).find(c => c.name.toLowerCase() === clean.toLowerCase() || (numericOnly && c.id === numericOnly));
      if (cand) {
        mentions.add(cand.jid);
        resolvedMentions.push({ id: cand.id, jid: cand.jid, name: cand.name, display_tag: `@${cand.name}` });
      } else if (numericOnly) {
        const fallbackJid = `${numericOnly}@s.whatsapp.net`;
        mentions.add(fallbackJid);
        resolvedMentions.push({ id: numericOnly, jid: fallbackJid, name: clean, display_tag: `@${clean}` });
      }
    }
  }

  // 6. Name matching in text (sort candidates by name length descending for maximal match)
  const sortedNamedCandidates = Array.from(candidatesMap.values())
    .filter(c => c.name && c.name.length >= 2 && !/^\+?\d+$/.test(c.name))
    .sort((a, b) => b.name.length - a.name.length);

  for (const cand of sortedNamedCandidates) {
    const escaped = cand.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(`@(?:["']${escaped}["']|${escaped})(?![a-zA-Z0-9_])`, 'gi');
    if (nameRegex.test(wireText)) {
      wireText = wireText.replace(nameRegex, `@${cand.id}`);
      mentions.add(cand.jid);
      if (!resolvedMentions.some(m => m.id === cand.id)) {
        resolvedMentions.push({ id: cand.id, jid: cand.jid, name: cand.name, display_tag: `@${cand.name}` });
      }
    }
  }

  // 7. Partial / First-name matching for remaining @Word tags
  const wordTagMatches = Array.from(wireText.matchAll(/@([A-Za-z][A-Za-z0-9_\-\.\+]*)/g));
  for (const match of wordTagMatches) {
    const tag = match[1].toLowerCase();
    if (tag === 'everyone' || tag === 'all' || tag === 'channel') continue;

    if (tag === 'you' && userInfo?.id) {
      const myClean = userInfo.id.replace(/@.*$/, '').replace(/:\d+$/, '');
      wireText = wireText.replace(new RegExp(`@${match[1]}\\b`, 'g'), `@${myClean}`);
      mentions.add(userInfo.id);
      continue;
    }

    const cand = sortedNamedCandidates.find(c => {
      const parts = c.name.toLowerCase().split(/\s+/);
      return parts[0] === tag || c.name.toLowerCase().startsWith(tag);
    });

    if (cand) {
      wireText = wireText.replace(new RegExp(`@${match[1]}\\b`, 'g'), `@${cand.id}`);
      mentions.add(cand.jid);
      if (!resolvedMentions.some(m => m.id === cand.id)) {
        resolvedMentions.push({ id: cand.id, jid: cand.jid, name: cand.name, display_tag: `@${cand.name}` });
      }
    }
  }

  // 8. Numeric phone / JID tag matching (e.g. @1234567890, @+1234567890)
  const numTagMatches = Array.from(wireText.matchAll(/@(\+?[0-9]{5,20}(?:@(lid|s\.whatsapp\.net))?)/g));
  for (const match of numTagMatches) {
    const cleanId = match[1].replace(/@.*$/, '').replace(/^\+/, '');
    const cand = candidatesMap.get(cleanId);
    const jid = cand?.jid || (match[1].includes('@') ? match[1] : `${cleanId}@s.whatsapp.net`);
    mentions.add(jid);
    if (match[1].startsWith('+') || match[1].includes('@')) {
      wireText = wireText.replace(new RegExp(`@${match[1].replace(/[+@.]/g, '\\$&')}\\b`, 'g'), `@${cleanId}`);
    }
    if (!resolvedMentions.some(m => m.id === cleanId)) {
      resolvedMentions.push({ id: cleanId, jid, name: cand?.name || `+${cleanId}`, display_tag: `@${cand?.name || `+${cleanId}`}` });
    }
  }

  return {
    text,
    wireText,
    mentions: Array.from(mentions),
    resolvedMentions
  };
}
