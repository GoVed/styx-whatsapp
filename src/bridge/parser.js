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

  if (typeof content.conversation === 'string' && content.conversation) {
    return { text: content.conversation, type: 'text', quoted };
  }
  if (typeof content.extendedTextMessage?.text === 'string' && content.extendedTextMessage.text) {
    return { text: content.extendedTextMessage.text, type: 'text', quoted };
  }
  if (typeof content.imageMessage?.caption === 'string' && content.imageMessage.caption) {
    return { text: content.imageMessage.caption, type: 'image', quoted };
  }
  if (content.imageMessage) {
    return { text: '[Image]', type: 'image', quoted };
  }
  if (typeof content.videoMessage?.caption === 'string' && content.videoMessage.caption) {
    return { text: content.videoMessage.caption, type: 'video', quoted };
  }
  if (content.videoMessage) {
    return { text: '[Video]', type: 'video', quoted };
  }
  if (content.audioMessage) {
    return { text: '[Audio/Voice Note]', type: 'audio', quoted };
  }
  if (typeof content.documentMessage?.caption === 'string' && content.documentMessage.caption) {
    return { text: content.documentMessage.caption, type: 'document', quoted };
  }
  if (typeof content.documentMessage?.fileName === 'string' && content.documentMessage.fileName) {
    return { text: `[Document: ${content.documentMessage.fileName}]`, type: 'document', quoted };
  }
  if (content.documentMessage) {
    return { text: '[Document]', type: 'document', quoted };
  }
  if (content.stickerMessage) {
    return { text: '[Sticker]', type: 'sticker', quoted };
  }
  if (content.reactionMessage) {
    return { text: content.reactionMessage.text || '[Reaction]', type: 'reaction', quoted };
  }
  if (content.buttonsResponseMessage?.selectedDisplayText) {
    return { text: content.buttonsResponseMessage.selectedDisplayText, type: 'text', quoted };
  }
  if (content.templateButtonReplyMessage?.selectedId) {
    return { text: content.templateButtonReplyMessage.selectedId, type: 'text', quoted };
  }
  if (content.listResponseMessage?.title) {
    return { text: content.listResponseMessage.title, type: 'text', quoted };
  }

  return { text: '', type: 'other', quoted };
}
