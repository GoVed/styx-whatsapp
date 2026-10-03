import fs from 'node:fs';
import path from 'node:path';
import { DisconnectReason } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Registers all Baileys event listeners on the socket for the LiveWhatsAppBridge instance.
 *
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {object} sock
 * @param {function} saveCreds
 */
export function registerSocketListeners(bridge, sock, saveCreds) {
  // Save auth credentials whenever refreshed
  sock.ev.on('creds.update', saveCreds);

  // Monitor connection states & QR code generation
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      bridge.latestQr = qr;
      bridge.status = 'qr_ready';
      bridge.reconnectAttempts = 0;
      bridge.emit('connection', { state: 'qr_ready', qr });

      process.stderr.write('\n\n=== STYX WHATSAPP PAIRING QR CODE ===\n');
      process.stderr.write('Scan this QR code with WhatsApp on your phone (Linked Devices):\n\n');
      qrcodeTerminal.generate(qr, { small: true }, (qrcode) => {
        process.stderr.write(qrcode + '\n\n');
      });
      logger.info('Awaiting WhatsApp mobile scan...');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      bridge.status = 'disconnected';
      bridge.emit('connection', { state: 'disconnected', reason: statusCode });

      logger.warn({ statusCode, isLoggedOut }, 'WhatsApp connection closed');

      if (isLoggedOut) {
        logger.error('WhatsApp session logged out or invalidated. Resetting credentials and generating new QR code...');
        try {
          if (fs.existsSync(config.authDir)) {
            const files = fs.readdirSync(config.authDir);
            for (const file of files) {
              if (file !== 'history.json' && file !== 'chats.json') {
                try {
                  fs.unlinkSync(path.join(config.authDir, file));
                } catch {}
              }
            }
          }
        } catch (e) {
          logger.warn({ err: e.message }, 'Failed to clean old auth files');
        }

        clearTimeout(bridge.reconnectTimeout);
        bridge.reconnectTimeout = setTimeout(() => {
          bridge.sock = null;
          bridge.connect().catch((err) => logger.error({ err }, 'Re-connection after logout failed'));
        }, 1200);
      } else if (!bridge.userInfo) {
        logger.info('WhatsApp pairing QR rotation / refresh cycle...');
        clearTimeout(bridge.reconnectTimeout);
        bridge.reconnectTimeout = setTimeout(() => {
          bridge.sock = null;
          bridge.connect().catch((err) => logger.error({ err }, 'QR refresh failed'));
        }, 1000);
      } else if (bridge.reconnectAttempts < config.reconnectMaxAttempts) {
        bridge.reconnectAttempts++;
        logger.info(
          { attempt: bridge.reconnectAttempts, max: config.reconnectMaxAttempts },
          `Attempting WhatsApp reconnect in ${config.reconnectIntervalMs}ms...`
        );
        clearTimeout(bridge.reconnectTimeout);
        bridge.reconnectTimeout = setTimeout(() => {
          bridge.sock = null;
          bridge.connect().catch((err) => logger.error({ err }, 'Reconnect failed'));
        }, config.reconnectIntervalMs);
      }
    } else if (connection === 'open') {
      bridge.reconnectAttempts = 0;
      bridge.status = 'connected';
      const user = sock.user;
      const phone = user?.id ? user.id.replace(/:\d+@.*$/, '') : 'unknown';
      bridge.userInfo = {
        id: user?.id || 'unknown',
        phone: `+${phone}`,
        name: user?.name || user?.notify || 'Styx Operator'
      };

      bridge.emit('connection', { state: 'connected', user: bridge.userInfo });
      logger.info({ user: bridge.userInfo }, 'WhatsApp connection established successfully!');

      // Explicitly mark presence as unavailable so WhatsApp treats this session
      // as a passive background bridge, preventing mobile notification loops and active desktop alerts
      try {
        if (typeof sock.sendPresenceUpdate === 'function') {
          await sock.sendPresenceUpdate('unavailable');
        }
      } catch (err) {
        logger.debug({ err: err?.message }, 'sendPresenceUpdate notice');
      }

      // Automatically sync participating group metadata and subjects
      setTimeout(() => {
        if (typeof bridge.syncGroups === 'function') {
          bridge.syncGroups().catch((err) => logger.warn({ err: err?.message }, 'Initial group sync failed'));
        }
      }, 1000);
    }
  });

  // Inbound & Outbound messages listener (real-time messages)
  sock.ev.on('messages.upsert', async (upsert) => {
    const messages = upsert.messages || [];
    const isHistoric = upsert.type === 'append';
    for (const msg of messages) {
      bridge.processRawMessage(msg, isHistoric);
    }
  });

  // Inbound & Outbound message reactions listener
  sock.ev.on('messages.reaction', async (reactions) => {
    if (Array.isArray(reactions)) {
      for (const r of reactions) {
        if (typeof bridge.processReactionUpdate === 'function') {
          bridge.processReactionUpdate(r);
        }
      }
    }
  });


  // History sync package listener
  sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest, syncType }) => {
    logger.info(
      {
        chats: chats?.length || 0,
        contacts: contacts?.length || 0,
        messages: messages?.length || 0,
        isLatest,
        syncType
      },
      'WhatsApp history sync package received'
    );

    if (Array.isArray(contacts)) {
      for (const contact of contacts) {
        bridge.recordContact(contact);
      }
    }

    if (Array.isArray(chats)) {
      for (const chat of chats) {
        if (chat.id) {
          bridge.recordChat({
            jid: chat.id,
            name: chat.name,
            unreadCount: chat.unreadCount || 0,
            lastMessageTime: typeof chat.conversationTimestamp === 'number'
              ? chat.conversationTimestamp
              : (typeof chat.conversationTimestamp?.low === 'number' ? chat.conversationTimestamp.low : 0)
          });
        }
      }
    }

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        bridge.processRawMessage(msg, true);
      }
    }
  });

  // Chats listeners
  sock.ev.on('chats.set', ({ chats }) => {
    if (Array.isArray(chats)) {
      for (const chat of chats) {
        if (chat.id) {
          bridge.recordChat({
            jid: chat.id,
            name: chat.name,
            unreadCount: chat.unreadCount || 0,
            lastMessageTime: typeof chat.conversationTimestamp === 'number'
              ? chat.conversationTimestamp
              : (typeof chat.conversationTimestamp?.low === 'number' ? chat.conversationTimestamp.low : 0)
          });
        }
      }
    }
  });

  sock.ev.on('chats.upsert', (chats) => {
    if (Array.isArray(chats)) {
      for (const chat of chats) {
        if (chat.id) {
          bridge.recordChat({
            jid: chat.id,
            name: chat.name,
            unreadCount: chat.unreadCount || 0,
            lastMessageTime: typeof chat.conversationTimestamp === 'number'
              ? chat.conversationTimestamp
              : (typeof chat.conversationTimestamp?.low === 'number' ? chat.conversationTimestamp.low : 0)
          });
        }
      }
    }
  });

  sock.ev.on('chats.update', (updates) => {
    if (Array.isArray(updates)) {
      for (const u of updates) {
        if (u.id) {
          bridge.recordChat({
            jid: u.id,
            unreadCount: u.unreadCount,
            lastMessageTime: typeof u.conversationTimestamp === 'number'
              ? u.conversationTimestamp
              : (typeof u.conversationTimestamp?.low === 'number' ? u.conversationTimestamp.low : undefined)
          });
        }
      }
    }
  });

  // Contacts listeners
  sock.ev.on('contacts.set', ({ contacts }) => {
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        bridge.recordContact(c);
      }
    }
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        bridge.recordContact(c);
      }
    }
  });

  // Groups listeners
  sock.ev.on('groups.update', (updates) => {
    if (Array.isArray(updates)) {
      for (const update of updates) {
        if (update.id && update.subject) {
          const existing = bridge.chats.get(update.id) || {};
          bridge.chats.set(update.id, {
            ...existing,
            jid: update.id,
            name: update.subject
          });
        }
      }
      bridge.saveChatsToDisk();
      logger.info({ count: updates.length }, 'Updated WhatsApp groups metadata from event');
    }
  });
}
