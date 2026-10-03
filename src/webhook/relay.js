import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import logger from '../utils/logger.js';

export class StyxRelay {
  /**
   * @param {import('../bridge/base.js').WhatsAppBridgeBase} bridge
   * @param {object} [options]
   */
  constructor(bridge, options = {}) {
    this.bridge = bridge;
    this.styxApiUrl = (options.styxApiUrl || config.styxApiUrl).replace(/\/$/, '');
    this.styxAccessKey = options.styxAccessKey !== undefined ? options.styxAccessKey : config.styxAccessKey;
    this.boundHandler = this.handleInboundMessage.bind(this);
    this.running = false;
    this.stats = {
      relayedCount: 0,
      failedCount: 0,
      lastRelayedAt: null,
      lastError: null
    };

    // Chat JID -> Styx Session ID mapping persistence
    this.sessionsFilePath = options.sessionsFilePath || path.join(config.authDir, 'styx_sessions.json');
    this.sessions = new Map();
    this.loadSessionsFromDisk();
  }

  /**
   * Loads persisted session mappings from disk.
   */
  loadSessionsFromDisk() {
    try {
      if (fs.existsSync(this.sessionsFilePath)) {
        const raw = fs.readFileSync(this.sessionsFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [jid, sid] of Object.entries(data)) {
            if (jid && sid && typeof sid === 'string') {
              this.sessions.set(jid, sid);
            }
          }
          logger.info(
            { count: this.sessions.size, path: this.sessionsFilePath },
            'Loaded persisted WhatsApp-Styx sessions mapping from disk'
          );
        }
      }
    } catch (err) {
      logger.warn({ err: err.message, path: this.sessionsFilePath }, 'Failed to load persisted sessions mapping');
    }
  }

  /**
   * Persists active session mappings to disk.
   */
  saveSessionsToDisk() {
    try {
      const obj = Object.fromEntries(this.sessions);
      const dir = path.dirname(this.sessionsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      logger.warn({ err: err.message, path: this.sessionsFilePath }, 'Failed to save sessions mapping to disk');
    }
  }

  getSession(chatJid) {
    return this.sessions.get(chatJid) || null;
  }

  setSession(chatJid, sessionId) {
    if (chatJid && sessionId) {
      this.sessions.set(chatJid, sessionId);
      this.saveSessionsToDisk();
    }
  }

  /**
   * Clears in-memory session cache and updates disk file.
   */
  clearSessions() {
    this.sessions.clear();
    this.saveSessionsToDisk();
    logger.info('Cleared WhatsApp-Styx session mapping cache');
  }

  /**
   * Starts listening to inbound bridge messages and forwarding to Styx.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.bridge.on('message', this.boundHandler);
    logger.info(
      { styxApiUrl: this.styxApiUrl, hasAccessKey: Boolean(this.styxAccessKey) },
      'Styx WhatsApp bi-directional relay active and listening'
    );
  }

  /**
   * Stops listening.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    this.bridge.removeListener('message', this.boundHandler);
    logger.info('Styx WhatsApp relay stopped');
  }

  /**
   * Formats headers for Styx OS API authentication.
   * @returns {Record<string, string>}
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Styx-WhatsApp-Relay/1.0.0'
    };
    if (this.styxAccessKey) {
      headers['Authorization'] = `Bearer ${this.styxAccessKey}`;
      headers['X-Styx-Access-Key'] = this.styxAccessKey;
    }
    return headers;
  }

  /**
   * Forwards a WhatsApp message event to Styx's POST /api/tools/trigger endpoint.
   * @param {object} eventData
   * @returns {Promise<object>}
   */
  async forwardEvent(eventData) {
    const triggerUrl = `${this.styxApiUrl}/api/tools/trigger`;
    const sourceDesc = eventData.senderName
      ? `${eventData.senderName} (${eventData.from})`
      : eventData.from;

    const isGroup = Boolean(eventData.isGroup);
    const chatIdentifier = isGroup
      ? eventData.chatJid
      : (eventData.chatJid || eventData.from || eventData.senderJid);

    let existingSessionId = null;
    if (isGroup) {
      if (eventData.chatJid) {
        existingSessionId = this.sessions.get(eventData.chatJid) || null;
      }
    } else {
      existingSessionId =
        (eventData.chatJid && this.sessions.get(eventData.chatJid)) ||
        (eventData.from && this.sessions.get(eventData.from)) ||
        (eventData.senderJid && this.sessions.get(eventData.senderJid)) ||
        null;
    }

    const groupSubject = isGroup
      ? (eventData.groupName || eventData.chatName || eventData.subject || null)
      : null;

    const isReaction = eventData.type === 'reaction';
    const requestBody = {
      protocol: 'whatsapp',
      event_type: isReaction ? 'reaction' : 'new_message',
      source_id: sourceDesc,
      channel_id: chatIdentifier,
      session_id: existingSessionId,
      mode: 'chat',
      payload: {
        from: eventData.from,
        sender_name: eventData.senderName || 'Unknown',
        sender_jid: eventData.senderJid,
        group_name: groupSubject,
        chat_name: eventData.chatName || null,
        message: eventData.message || '',
        timestamp: eventData.timestamp || Math.floor(Date.now() / 1000),
        date: eventData.date || new Date((eventData.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        message_id: eventData.messageId,
        is_group: isGroup,
        chat_jid: eventData.chatJid,
        mentions: eventData.mentions || [],
        is_self_tagged: Boolean(eventData.isSelfTagged),
        raw_text: eventData.rawText || null,
        media_url: eventData.mediaUrl || null,
        media_type: eventData.mediaType || eventData.type || null,
        reply_to: eventData.replyTo || eventData.quotedMessage || null,
        quoted_message: eventData.replyTo || eventData.quotedMessage || null,
        reaction: isReaction ? (eventData.reaction || null) : null,
        is_removed: isReaction ? Boolean(eventData.isRemoved) : false,
        target_message_id: eventData.targetMessageId || null,
        target_message_text: eventData.targetMessageText || null,
        target_sender_name: eventData.targetSenderName || null
      }
    };

    try {
      logger.debug(
        { triggerUrl, sourceDesc, chatIdentifier, existingSessionId },
        'Forwarding inbound event to Styx Agent OS'
      );

      const response = await fetch(triggerUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10000)
      });

      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = `Styx API responded with HTTP ${response.status}: ${JSON.stringify(responseData)}`;
        logger.warn({ status: response.status, responseData }, errorMsg);
        this.stats.failedCount++;
        this.stats.lastError = errorMsg;
        return {
          success: false,
          status: response.status,
          error: errorMsg
        };
      }

      // Record session mapping from Styx response (isolating group chats strictly to chatJid)
      if (responseData?.session_id) {
        if (isGroup) {
          if (eventData.chatJid) this.sessions.set(eventData.chatJid, responseData.session_id);
        } else {
          if (eventData.chatJid) this.sessions.set(eventData.chatJid, responseData.session_id);
          if (eventData.from) this.sessions.set(eventData.from, responseData.session_id);
          if (eventData.senderJid) this.sessions.set(eventData.senderJid, responseData.session_id);
        }
        this.saveSessionsToDisk();
      }

      this.stats.relayedCount++;
      this.stats.lastRelayedAt = new Date().toISOString();
      logger.info(
        {
          sessionId: responseData?.session_id,
          turnId: responseData?.turn_id,
          status: responseData?.status,
          chatIdentifier
        },
        'Inbound WhatsApp message successfully queued in Styx Agent OS'
      );

      return {
        success: true,
        data: responseData
      };
    } catch (err) {
      const errorMsg = `Failed to connect to Styx API at ${triggerUrl}: ${err.message}`;
      logger.warn({ err: err.message, triggerUrl }, errorMsg);
      this.stats.failedCount++;
      this.stats.lastError = errorMsg;
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Internal bridge event listener callback.
   * @param {object} eventData
   */
  async handleInboundMessage(eventData) {
    return this.forwardEvent(eventData);
  }

  getStats() {
    return {
      ...this.stats,
      running: this.running,
      styxApiUrl: this.styxApiUrl
    };
  }
}

export function createRelay(bridge, options) {
  return new StyxRelay(bridge, options);
}

export default {
  StyxRelay,
  createRelay
};
