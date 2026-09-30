import logger from '../utils/logger.js';

/**
 * Requests on-demand earlier message history from the primary phone for a specific chat.
 *
 * @param {import('./live.js').LiveWhatsAppBridge} bridge
 * @param {string} chatTarget
 * @param {number} [count=50]
 * @param {number} [timeoutMs=4000]
 * @returns {Promise<object>}
 */
export async function fetchEarlierMessagesForBridge(bridge, chatTarget, count = 50, timeoutMs = 4000) {
  if (!bridge.sock || bridge.status !== 'connected') {
    throw new Error(`WhatsApp is not connected (current state: ${bridge.status})`);
  }
  const jid = bridge.formatJid(chatTarget);

  const chatMsgs = bridge.history
    .filter(h => (h.chatJid === jid || h.to === jid || h.senderJid === jid))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let oldestMsgKey;
  let oldestMsgTimestamp;

  if (chatMsgs.length > 0) {
    const oldest = chatMsgs[0];
    oldestMsgKey = {
      remoteJid: jid,
      fromMe: oldest.direction === 'outbound',
      id: oldest.messageId
    };
    oldestMsgTimestamp = (oldest.timestamp || Math.floor(Date.now() / 1000)) * 1000;
  } else {
    oldestMsgKey = {
      remoteJid: jid,
      fromMe: false,
      id: `OLD_${Date.now()}`
    };
    oldestMsgTimestamp = Date.now();
  }

  logger.info({ jid, count, oldestMsgKey }, 'Requesting on-demand earlier message history from primary phone');
  if (typeof bridge.sock.fetchMessageHistory !== 'function') {
    throw new Error('fetchMessageHistory is not supported by socket');
  }

  const initialCount = bridge.history.filter(h => (h.chatJid === jid || h.to === jid || h.senderJid === jid)).length;

  const waitPromise = new Promise((resolve) => {
    let resolved = false;
    const onHistory = ({ messages }) => {
      if (Array.isArray(messages) && messages.some(m => m.key?.remoteJid === jid)) {
        if (!resolved) {
          resolved = true;
          bridge.sock.ev.off('messaging-history.set', onHistory);
          resolve(true);
        }
      }
    };
    bridge.sock.ev.on('messaging-history.set', onHistory);
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        bridge.sock.ev.off('messaging-history.set', onHistory);
        resolve(false);
      }
    }, timeoutMs);
  });

  const reqId = await bridge.sock.fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp);
  await waitPromise;

  const finalMsgs = bridge.history
    .filter(h => (h.chatJid === jid || h.to === jid || h.senderJid === jid))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    success: true,
    jid,
    requestedCount: count,
    requestId: reqId,
    totalMessagesInChat: finalMsgs.length,
    newMessagesFetched: Math.max(0, finalMsgs.length - initialCount)
  };
}

export default { fetchEarlierMessagesForBridge };
