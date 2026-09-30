import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppChatExport, parseExportTimestamp } from '../src/utils/chat-export-parser.js';

describe('WhatsApp Chat Export Parser', () => {
  it('parses timestamps across Android and iOS formats', () => {
    // Android 12h
    const t1 = parseExportTimestamp('12/05/2023', '10:45 AM');
    assert.strictEqual(typeof t1, 'number');
    assert.strictEqual(t1 > 0, true);

    // iOS bracketed style time
    const t2 = parseExportTimestamp('12/05/23', '10:46:15 PM');
    assert.strictEqual(typeof t2, 'number');
    assert.strictEqual(t2 > t1, true);

    // ISO date
    const t3 = parseExportTimestamp('2023-05-12', '14:30');
    assert.strictEqual(typeof t3, 'number');
  });

  it('parses Android export format with multiline and media messages', () => {
    const raw = `
12/05/2023, 10:45 AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
12/05/2023, 10:46 AM - John Doe: Hey everyone, welcome to the group!
12/05/2023, 10:47 AM - Jane Smith: Here is the proposed schedule:
1. Breakfast at 9am
2. Sync at 10am
12/05/2023, 10:50 AM - You: Sounds awesome, see you there!
12/05/2023, 10:55 AM - John Doe: <Media omitted>
`;

    const res = parseWhatsAppChatExport(raw, {
      chatName: 'Engineering Team',
      chatJid: '15551234567-1600000000@g.us'
    });

    assert.strictEqual(res.chatName, 'Engineering Team');
    assert.strictEqual(res.chatJid, '15551234567-1600000000@g.us');
    assert.strictEqual(res.messages.length, 4);

    // Message 1
    assert.strictEqual(res.messages[0].senderName, 'John Doe');
    assert.strictEqual(res.messages[0].direction, 'inbound');
    assert.strictEqual(res.messages[0].text, 'Hey everyone, welcome to the group!');

    // Message 2 (Multiline)
    assert.strictEqual(res.messages[1].senderName, 'Jane Smith');
    assert.ok(res.messages[1].text.includes('1. Breakfast at 9am\n2. Sync at 10am'));

    // Message 3 (Outbound 'You')
    assert.strictEqual(res.messages[2].direction, 'outbound');
    assert.strictEqual(res.messages[2].senderName, 'You');

    // Message 4 (Media omitted)
    assert.strictEqual(res.messages[3].type, 'media_omitted');
    assert.strictEqual(res.participants.includes('John Doe'), true);
    assert.strictEqual(res.participants.includes('Jane Smith'), true);
  });

  it('parses iOS bracketed export format and detects group subject changes', () => {
    const raw = `
[15/06/2023, 09:12:00] Alice changed the subject to "Computer Scientist"
[15/06/2023, 09:15:30 AM] Alice: Created this group for all researchers
[15/06/2023, 09:16:12 AM] Bob: Thanks Alice!
`;

    const res = parseWhatsAppChatExport(raw);
    assert.strictEqual(res.chatName, 'Computer Scientist');
    assert.strictEqual(res.messages.length, 2);
    assert.strictEqual(res.messages[0].senderName, 'Alice');
    assert.strictEqual(res.messages[1].senderName, 'Bob');
  });

  it('handles empty or invalid content gracefully', () => {
    const res = parseWhatsAppChatExport('');
    assert.strictEqual(res.messages.length, 0);
    assert.strictEqual(res.participants.length, 0);
  });
});
