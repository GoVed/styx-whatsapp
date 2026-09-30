import fs from 'node:fs';
import config from '../config.js';
import logger from '../utils/logger.js';
import { extractQuotedMessageContext } from './parser.js';

/**
 * Loads cached history, chat metadata, and contacts from disk.
 * @param {object} paths
 * @param {number} maxHistory
 * @returns {{ history: Array<object>, chats: Map<string, object>, contacts: Map<string, object> }}
 */
export function loadBridgeStateFromDisk(paths, maxHistory = 50000) {
  let history = [];
  const chats = new Map();
  const contacts = new Map();

  try {
    if (fs.existsSync(paths.historyFilePath)) {
      const raw = fs.readFileSync(paths.historyFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.rawMessage && !item.replyTo && !item.quotedMessage) {
            const quoted = extractQuotedMessageContext(item.rawMessage);
            if (quoted) {
              item.replyTo = quoted;
              item.quotedMessage = quoted;
            }
          }
        }
        history = parsed.slice(0, maxHistory);
        logger.debug({ count: history.length }, 'Loaded WhatsApp message history from disk');
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to load history from disk');
  }

  try {
    if (fs.existsSync(paths.chatsFilePath)) {
      const raw = fs.readFileSync(paths.chatsFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c.jid) chats.set(c.jid, c);
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to load chats from disk');
  }

  try {
    if (fs.existsSync(paths.contactsFilePath)) {
      const raw = fs.readFileSync(paths.contactsFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          const id = c.id || c.jid;
          if (id) contacts.set(id, c);
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to load contacts from disk');
  }

  return { history, chats, contacts };
}

/**
 * Persists history to disk.
 * @param {string} filePath
 * @param {Array<object>} history
 * @param {number} maxHistory
 */
export function saveHistoryToDisk(filePath, history, maxHistory = 50000) {
  try {
    if (!fs.existsSync(config.authDir)) {
      fs.mkdirSync(config.authDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(filePath, JSON.stringify(history.slice(0, maxHistory), null, 2), 'utf8');
  } catch (err) {
    logger.debug({ err: err.message }, 'Error saving history to disk');
  }
}

/**
 * Persists chats to disk.
 * @param {string} filePath
 * @param {Map<string, object>} chats
 */
export function saveChatsToDisk(filePath, chats) {
  try {
    if (!fs.existsSync(config.authDir)) {
      fs.mkdirSync(config.authDir, { recursive: true, mode: 0o700 });
    }
    const chatList = Array.from(chats.values()).slice(0, 500);
    fs.writeFileSync(filePath, JSON.stringify(chatList, null, 2), 'utf8');
  } catch (err) {
    logger.debug({ err: err.message }, 'Error saving chats to disk');
  }
}

/**
 * Persists contacts to disk.
 * @param {string} filePath
 * @param {Map<string, object>} contacts
 */
export function saveContactsToDisk(filePath, contacts) {
  try {
    if (!fs.existsSync(config.authDir)) {
      fs.mkdirSync(config.authDir, { recursive: true, mode: 0o700 });
    }
    const contactList = Array.from(contacts.values()).slice(0, 1000);
    fs.writeFileSync(filePath, JSON.stringify(contactList, null, 2), 'utf8');
  } catch (err) {
    logger.debug({ err: err.message }, 'Error saving contacts to disk');
  }
}
