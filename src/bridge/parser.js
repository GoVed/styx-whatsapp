import { normalizeMessageContent, extractMessageContent } from '@whiskeysockets/baileys';

/**
 * Extracts replied-to / quoted message metadata from contextInfo if present.
 *
 * @param {object} content Unwrapped Baileys message content
 * @returns {{ id: string|null, participant: string|null, sender: string|null, text: string, type: string }|null}
 */
export function extractQuotedMessageContext(content) {
  if (!content || typeof content !== 'object') return null;

  const contextInfo =
    content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.audioMessage?.contextInfo ||
    content.stickerMessage?.contextInfo ||
    content.documentMessage?.contextInfo ||
    content.buttonsResponseMessage?.contextInfo ||
    content.templateButtonReplyMessage?.contextInfo ||
    content.listResponseMessage?.contextInfo;

  if (!contextInfo || (!contextInfo.quotedMessage && !contextInfo.stanzaId)) {
    return null;
  }

  let quotedText = '';
  let quotedType = 'text';

  if (contextInfo.quotedMessage) {
    const parsedQuoted = parseWhatsAppMessageContent(contextInfo.quotedMessage, false);
    quotedText = parsedQuoted.text;
    quotedType = parsedQuoted.type;
  }

  const participant = contextInfo.participant || null;

  return {
    id: contextInfo.stanzaId || null,
    participant,
    sender: participant,
    text: quotedText,
    type: quotedType
  };
}

/**
 * Recursively unwraps and extracts text, media type, and quoted context from a Baileys message object.
 * Handles ephemerals, view-once, media captions, stickers, and interactive responses.
 *
 * @param {object} rawMessage
 * @param {boolean} [extractQuote=true] Whether to parse replied-to message context
 * @returns {{ text: string, type: string, quoted: object|null }}
 */
export function parseWhatsAppMessageContent(rawMessage, extractQuote = true) {
  if (!rawMessage) return { text: '', type: 'empty', quoted: null };

  let content = normalizeMessageContent(rawMessage);
  if (!content) return { text: '', type: 'empty', quoted: null };

  const extracted = extractMessageContent(content);
  if (extracted) {
    content = extracted;
  }

  // Unwrap any nested containers that might remain
  while (
    content?.ephemeralMessage ||
    content?.viewOnceMessage ||
    content?.viewOnceMessageV2 ||
    content?.viewOnceMessageV2Extension ||
    content?.documentWithCaptionMessage
  ) {
    content =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message ||
      content;
  }

  const quoted = extractQuote ? extractQuotedMessageContext(content) : null;

  const contextInfo =
    content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.audioMessage?.contextInfo ||
    content.stickerMessage?.contextInfo ||
    content.documentMessage?.contextInfo ||
    content.buttonsResponseMessage?.contextInfo ||
    content.templateButtonReplyMessage?.contextInfo ||
    content.listResponseMessage?.contextInfo;

  const rawMentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  const mentions = Array.from(new Set(rawMentions.filter((j) => typeof j === 'string' && j.length > 0)));

  let result = { text: '', type: 'other', quoted, mentions };

  if (typeof content.conversation === 'string' && content.conversation) {
    result = { text: content.conversation, type: 'text', quoted, mentions };
  } else if (typeof content.extendedTextMessage?.text === 'string' && content.extendedTextMessage.text) {
    result = { text: content.extendedTextMessage.text, type: 'text', quoted, mentions };
  } else if (typeof content.imageMessage?.caption === 'string' && content.imageMessage.caption) {
    result = { text: content.imageMessage.caption, type: 'image', quoted, mentions };
  } else if (content.imageMessage) {
    result = { text: '[Image]', type: 'image', quoted, mentions };
  } else if (typeof content.videoMessage?.caption === 'string' && content.videoMessage.caption) {
    result = { text: content.videoMessage.caption, type: 'video', quoted, mentions };
  } else if (content.videoMessage) {
    result = { text: '[Video]', type: 'video', quoted, mentions };
  } else if (content.audioMessage) {
    result = { text: '[Audio/Voice Note]', type: 'audio', quoted, mentions };
  } else if (typeof content.documentMessage?.caption === 'string' && content.documentMessage.caption) {
    result = { text: content.documentMessage.caption, type: 'document', quoted, mentions };
  } else if (typeof content.documentMessage?.fileName === 'string' && content.documentMessage.fileName) {
    result = { text: `[Document: ${content.documentMessage.fileName}]`, type: 'document', quoted, mentions };
  } else if (content.documentMessage) {
    result = { text: '[Document]', type: 'document', quoted, mentions };
  } else if (content.stickerMessage) {
    result = { text: '[Sticker]', type: 'sticker', quoted, mentions };
  } else if (content.reactionMessage) {
    const emoji = content.reactionMessage.text || '';
    const targetKey = content.reactionMessage.key || null;
    result = {
      text: emoji ? `Reacted ${emoji}` : 'Removed reaction',
      type: 'reaction',
      quoted,
      mentions,
      reaction: {
        emoji,
        targetMessageId: targetKey?.id || null,
        targetKey,
        isRemoved: !emoji
      }
    };
  } else if (content.buttonsResponseMessage?.selectedDisplayText) {
    result = { text: content.buttonsResponseMessage.selectedDisplayText, type: 'text', quoted, mentions };
  } else if (content.templateButtonReplyMessage?.selectedId) {
    result = { text: content.templateButtonReplyMessage.selectedId, type: 'text', quoted, mentions };
  } else if (content.listResponseMessage?.title) {
    result = { text: content.listResponseMessage.title, type: 'text', quoted, mentions };
  }

  return result;
}
