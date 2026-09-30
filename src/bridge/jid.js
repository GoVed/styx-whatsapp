import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Normalizes a phone number, contact name, or target into a valid WhatsApp JID.
 *
 * @param {string} to
 * @param {Map<string, object>} contacts
 * @param {Map<string, object>} chats
 * @param {Array<object>} history
 * @returns {string}
 */
export function formatRecipientJid(to, contacts, chats, history) {
  if (!to || typeof to !== 'string') {
    throw new Error('Target "to" recipient is required');
  }
  const trimmed = to.trim();

  // 1. If already ending with @lid, @g.us, @newsletter, @broadcast, keep it
  if (
    trimmed.endsWith('@lid') ||
    trimmed.endsWith('@g.us') ||
    trimmed.endsWith('@newsletter') ||
    trimmed.endsWith('@broadcast')
  ) {
    return trimmed;
  }

  // 2. Extract clean identifier (strip @s.whatsapp.net or other domain and leading +)
  const cleanId = trimmed.replace(/@.*$/, '').replace(/^\+/, '');
  const isPureDigits = /^\d+$/.test(cleanId);
  const targetName = trimmed.toLowerCase();

  // 3. Resolve by contact or chat name for non-pure-digits queries (or if name is explicit)
  if (!isPureDigits) {
    // Prioritize individual contacts first
    for (const contact of contacts.values()) {
      if (contact.name && contact.name.toLowerCase().includes(targetName)) {
        logger.info({ to, matchedJid: contact.jid, matchedName: contact.name }, 'Resolved recipient name from contacts to WhatsApp JID');
        return contact.jid;
      }
    }
    // Prioritize 1-on-1 direct chats (non-group)
    for (const chat of chats.values()) {
      if (!chat.jid?.endsWith('@g.us') && chat.name && chat.name.toLowerCase().includes(targetName)) {
        logger.info({ to, matchedJid: chat.jid, matchedName: chat.name }, 'Resolved recipient name to direct chat JID');
        return chat.jid;
      }
    }
    // Check 1-on-1 message history
    for (const h of history) {
      if (!h.isGroup && h.senderName && h.senderName.toLowerCase().includes(targetName)) {
        const jid = h.chatJid || h.senderJid;
        if (jid && !jid.endsWith('@g.us')) {
          logger.info({ to, matchedJid: jid, senderName: h.senderName }, 'Resolved recipient name from direct history to WhatsApp JID');
          return jid;
        }
      }
    }
    // Check group chats only if no individual contact matches
    for (const chat of chats.values()) {
      if (chat.jid?.endsWith('@g.us') && chat.name && chat.name.toLowerCase().includes(targetName)) {
        logger.info({ to, matchedJid: chat.jid, matchedName: chat.name }, 'Resolved recipient name to group chat JID');
        return chat.jid;
      }
    }
  }

  // 4. Resolve bare or misaddressed LID numbers (14-16 digits or matching known LID)
  for (const chat of chats.values()) {
    if (chat.jid && chat.jid.endsWith('@lid') && chat.jid.replace(/@.*$/, '') === cleanId) {
      logger.info({ to, matchedJid: chat.jid }, 'Resolved to known @lid from chats');
      return chat.jid;
    }
  }
  for (const contact of contacts.values()) {
    if (contact.jid && contact.jid.endsWith('@lid') && contact.jid.replace(/@.*$/, '') === cleanId) {
      logger.info({ to, matchedJid: contact.jid }, 'Resolved to known @lid from contacts');
      return contact.jid;
    }
  }
  for (const h of history) {
    if (h.senderJid && h.senderJid.endsWith('@lid') && h.senderJid.replace(/@.*$/, '') === cleanId) {
      logger.info({ to, matchedJid: h.senderJid }, 'Resolved to known @lid from history sender');
      return h.senderJid;
    }
    if (h.chatJid && h.chatJid.endsWith('@lid') && h.chatJid.replace(/@.*$/, '') === cleanId) {
      logger.info({ to, matchedJid: h.chatJid }, 'Resolved to known @lid from history chat');
      return h.chatJid;
    }
  }

  // WhatsApp companion LIDs are 15-digit internal identifiers (e.g. 255500011122233, 211273987932324)
  if (/^\d{15}$/.test(cleanId)) {
    const sessionFile = path.join(config.authDir, `session-${cleanId}.0.json`);
    if (fs.existsSync(sessionFile)) {
      logger.info({ to, resolvedLid: `${cleanId}@lid` }, 'Resolved 15-digit user ID to @lid via active Signal session file');
      return `${cleanId}@lid`;
    }
    if (/^2\d{14}$/.test(cleanId)) {
      logger.info({ to, resolvedLid: `${cleanId}@lid` }, 'Resolved 15-digit identifier to @lid');
      return `${cleanId}@lid`;
    }
  }

  // 5. If it already has @s.whatsapp.net and was not matched as an LID above, keep it
  if (trimmed.endsWith('@s.whatsapp.net')) {
    return trimmed;
  }

  // 6. Standard phone number fallback
  const cleanDigits = trimmed.replace(/\D/g, '');
  if (!cleanDigits || cleanDigits.length < 5) {
    throw new Error(`Invalid phone number, contact name, or JID: "${to}"`);
  }
  return `${cleanDigits}@s.whatsapp.net`;
}
