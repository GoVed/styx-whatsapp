import crypto from 'node:crypto';

/**
 * Strips invisible direction and spacing characters often embedded by WhatsApp export.
 * @param {string} str
 * @returns {string}
 */
function cleanExportString(str) {
  if (!str) return '';
  return str
    .replace(/[\u200E\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/[\u202F\u00A0]/g, ' ')
    .trim();
}

/**
 * Parses date string (DD/MM/YY, MM/DD/YYYY, YYYY-MM-DD) and time (12h or 24h) to unix seconds.
 * @param {string} dateStr
 * @param {string} timeStr
 * @returns {number}
 */
export function parseExportTimestamp(dateStr, timeStr) {
  const cleanDate = cleanExportString(dateStr);
  const cleanTime = cleanExportString(timeStr);

  const isDashIso = cleanDate.includes('-') && /^\d{4}/.test(cleanDate);
  const dateParts = cleanDate.split(/[\/\-\.]/).map(p => parseInt(p, 10));

  let year = 1970;
  let month = 0;
  let day = 1;

  if (isDashIso) {
    year = dateParts[0];
    month = (dateParts[1] || 1) - 1;
    day = dateParts[2] || 1;
  } else if (dateParts.length >= 3) {
    let rawYear = dateParts[2];
    year = rawYear < 100 ? (rawYear < 70 ? 2000 + rawYear : 1900 + rawYear) : rawYear;

    if (dateParts[0] > 12) {
      // Day must be part 0 (DD/MM/YYYY)
      day = dateParts[0];
      month = (dateParts[1] || 1) - 1;
    } else if (dateParts[1] > 12) {
      // Day must be part 1 (MM/DD/YYYY)
      month = dateParts[0] - 1;
      day = dateParts[1];
    } else {
      // International WhatsApp default is DD/MM/YYYY
      day = dateParts[0];
      month = dateParts[1] - 1;
    }
  }

  const is12Hour = /am|pm/i.test(cleanTime);
  const timeOnly = cleanTime.replace(/\s*(am|pm)/i, '').trim();
  const timeParts = timeOnly.split(':').map(p => parseInt(p, 10));

  let hours = timeParts[0] || 0;
  const minutes = timeParts[1] || 0;
  const seconds = timeParts[2] || 0;

  if (is12Hour) {
    const isPM = /pm/i.test(cleanTime);
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  }

  const d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  return Math.floor(d.getTime() / 1000);
}

/**
 * Deterministically generates an ID for an imported message.
 * @param {string} chatJid
 * @param {number} timestamp
 * @param {string} sender
 * @param {string} text
 * @returns {string}
 */
function generateMessageId(chatJid, timestamp, sender, text) {
  const hash = crypto
    .createHash('sha256')
    .update(`${chatJid}|${timestamp}|${sender}|${text}`)
    .digest('hex')
    .substring(0, 16);
  return `EXP_${timestamp}_${hash}`;
}

/**
 * Standard WhatsApp header regexes:
 * Android style: "DD/MM/YYYY, HH:MM - Sender: Message"
 * iOS style: "[DD/MM/YY, HH:MM:SS AM] Sender: Message"
 */
const ANDROID_HEADER_REGEX = /^(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\s*-\s*(.+)$/i;
const IOS_HEADER_REGEX = /^\[(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\]\s*(.+)$/i;

/**
 * Parses a raw WhatsApp chat export (.txt) into structured message objects.
 * @param {string} content
 * @param {object} [options={}]
 * @returns {{ chatName?: string, chatJid: string, isGroup: boolean, totalLines: number, messages: Array<object>, participants: Array<string> }}
 */
export function parseWhatsAppChatExport(content, options = {}) {
  if (!content || typeof content !== 'string') {
    return { chatName: '', chatJid: '', isGroup: false, totalLines: 0, messages: [], participants: [] };
  }

  const lines = content.split(/\r?\n/);
  const messages = [];
  const participantsSet = new Set();
  let detectedChatName = options.chatName || '';
  const chatJid = options.chatJid || (detectedChatName ? `${detectedChatName.toLowerCase().replace(/\s+/g, '_')}@g.us` : 'unknown_export@g.us');
  const myName = options.myName || 'You';
  const myPhone = options.myPhone || '+me';

  let currentMsg = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const cleaned = cleanExportString(rawLine);
    if (!cleaned) continue;

    // Check for message header
    const match = cleaned.match(IOS_HEADER_REGEX) || cleaned.match(ANDROID_HEADER_REGEX);

    if (match) {
      if (currentMsg) {
        messages.push(currentMsg);
        currentMsg = null;
      }

      const dateStr = match[1];
      const timeStr = match[2];
      const rest = match[3].trim();
      const timestamp = parseExportTimestamp(dateStr, timeStr);

      // Check if system message vs sender message
      const colonIndex = rest.indexOf(': ');
      if (colonIndex === -1) {
        // System notification
        const subjectMatch = rest.match(/changed the subject to ["“](.+?)["”]/i) ||
                             rest.match(/created group ["“](.+?)["”]/i);
        if (subjectMatch && !detectedChatName) {
          detectedChatName = subjectMatch[1];
        }
        continue;
      }

      const senderRaw = rest.substring(0, colonIndex).trim();
      const messageText = rest.substring(colonIndex + 2).trim();

      // Skip generic encryption preamble if present as message
      if (messageText.includes('Messages and calls are end-to-end encrypted')) {
        continue;
      }

      const isOutbound = senderRaw.toLowerCase() === myName.toLowerCase() ||
                         senderRaw.toLowerCase() === 'you' ||
                         (options.myPhone && senderRaw.includes(options.myPhone));

      const senderName = isOutbound ? (options.myName || 'You') : senderRaw;
      if (!isOutbound) {
        participantsSet.add(senderName);
      }

      const isMedia = /<media omitted>|image omitted|video omitted|sticker omitted|audio omitted|document omitted/i.test(messageText);

      currentMsg = {
        messageId: generateMessageId(chatJid, timestamp, senderRaw, messageText),
        direction: isOutbound ? 'outbound' : 'inbound',
        type: isMedia ? 'media_omitted' : 'text',
        from: isOutbound ? myPhone : senderRaw,
        senderJid: isOutbound ? undefined : (senderRaw.replace(/\D/g, '') ? `${senderRaw.replace(/\D/g, '')}@s.whatsapp.net` : undefined),
        senderName,
        chatName: detectedChatName || options.chatName || '',
        chatJid,
        message: messageText,
        text: messageText,
        timestamp,
        isGroup: options.isGroup ?? chatJid.endsWith('@g.us'),
        mode: 'export_import'
      };
    } else if (currentMsg) {
      // Continuation of multiline message
      currentMsg.text += '\n' + cleaned;
      currentMsg.message = currentMsg.text;
    }
  }

  if (currentMsg) {
    messages.push(currentMsg);
  }

  // Final pass to populate chatName on all messages if detected
  const finalChatName = detectedChatName || options.chatName || '';
  if (finalChatName) {
    for (const m of messages) {
      if (!m.chatName) m.chatName = finalChatName;
    }
  }

  return {
    chatName: finalChatName,
    chatJid,
    isGroup: options.isGroup ?? (chatJid.endsWith('@g.us') || participantsSet.size > 1),
    totalLines: lines.length,
    messages,
    participants: Array.from(participantsSet),
    startDate: messages.length > 0 ? new Date(messages[0].timestamp * 1000).toISOString() : null,
    endDate: messages.length > 0 ? new Date(messages[messages.length - 1].timestamp * 1000).toISOString() : null
  };
}
