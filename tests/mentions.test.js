import assert from 'node:assert';
import { test } from 'node:test';
import { resolveContactName, resolveMentionsInText, resolveOutboundMentions } from '../src/bridge/mentions.js';
import { parseWhatsAppMessageContent } from '../src/bridge/parser.js';
import { handleGetChatHistory } from '../src/mcp/handlers/history.js';

test('WhatsApp Mentions Resolution Test Suite', async (t) => {
  const fakeContacts = new Map([
    ['199911122233344@lid', { jid: '199911122233344@lid', name: 'Alice' }],
    ['14155552671@s.whatsapp.net', { jid: '14155552671@s.whatsapp.net', name: 'Bob Smith' }]
  ]);

  const fakeChats = new Map([
    ['120363000000000001@g.us', { jid: '120363000000000001@g.us', name: 'Engineering Team' }]
  ]);

  const fakeHistory = [
    {
      direction: 'outbound',
      senderJid: '199955566677788@lid',
      senderName: 'Operator',
      text: 'sounds good',
      timestamp: 1790855116
    }
  ];

  const fakeUserInfo = {
    id: '15551234567:1@s.whatsapp.net',
    phone: '+15551234567',
    name: 'Operator'
  };

  const context = {
    contacts: fakeContacts,
    chats: fakeChats,
    history: fakeHistory,
    userInfo: fakeUserInfo
  };

  await t.test('resolves contact name from contacts map', () => {
    const res = resolveContactName('199911122233344@lid', context);
    assert.strictEqual(res.name, 'Alice');
    assert.strictEqual(res.isMe, false);
    assert.strictEqual(res.id, '199911122233344');
  });

  await t.test('identifies user themselves as isMe', () => {
    // Via outbound history matching LID
    const resLid = resolveContactName('199955566677788@lid', context);
    assert.strictEqual(resLid.isMe, true);
    assert.strictEqual(resLid.name, 'Operator');

    // Via phone number
    const resPhone = resolveContactName('+15551234567', context);
    assert.strictEqual(resPhone.isMe, true);
  });

  await t.test('resolves mentions in text and replaces @a_long_id with @ContactName', () => {
    const raw = '@199911122233344  could you please review the pull request?';
    const mentionedJids = ['199911122233344@lid'];

    const result = resolveMentionsInText(raw, mentionedJids, context);
    assert.strictEqual(result.text, '@Alice  could you please review the pull request?');
    assert.strictEqual(result.rawText, raw);
    assert.strictEqual(result.mentions.length, 1);
    assert.strictEqual(result.mentions[0].name, 'Alice');
    assert.strictEqual(result.isSelfTagged, false);
  });

  await t.test('replaces mention with @You (Name) when user is tagged', () => {
    const raw = '@199955566677788 who are you';
    const mentionedJids = ['199955566677788@lid'];

    const result = resolveMentionsInText(raw, mentionedJids, context);
    assert.strictEqual(result.text, '@You (Operator) who are you');
    assert.strictEqual(result.isSelfTagged, true);
  });

  await t.test('handles multiple mentions in a single message', () => {
    const raw = '@199911122233344 and @199955566677788 please review';
    const mentionedJids = ['199911122233344@lid', '199955566677788@lid'];

    const result = resolveMentionsInText(raw, mentionedJids, context);
    assert.strictEqual(result.text, '@Alice and @You (Operator) please review');
    assert.strictEqual(result.mentions.length, 2);
    assert.strictEqual(result.isSelfTagged, true);
  });

  await t.test('extracts mentions from parser contextInfo', () => {
    const rawMsg = {
      extendedTextMessage: {
        text: '@199911122233344 hello',
        contextInfo: {
          mentionedJid: ['199911122233344@lid']
        }
      }
    };

    const parsed = parseWhatsAppMessageContent(rawMsg);
    assert.strictEqual(parsed.text, '@199911122233344 hello');
    assert.deepStrictEqual(parsed.mentions, ['199911122233344@lid']);
  });

  await t.test('resolves outbound mentions by name in group replies', () => {
    const text = 'Thanks @Alice, I will merge it.';
    const bridge = {
      contacts: fakeContacts,
      chats: fakeChats,
      history: fakeHistory
    };

    const out = resolveOutboundMentions(text, bridge);
    assert.deepStrictEqual(out.mentions, ['199911122233344@lid']);
  });

  await t.test('dynamically resolves mentions when get_chat_history is called', async () => {
    const fakeBridge = {
      contacts: fakeContacts,
      chats: fakeChats,
      history: [
        {
          messageId: 'HIST_1',
          direction: 'inbound',
          from: '+19998887777',
          senderName: 'Friend',
          chatJid: '120363000000000001@g.us',
          text: '@199911122233344 are you there?',
          timestamp: 1790855000
        }
      ],
      getStatus: () => ({ status: 'connected' }),
      userInfo: fakeUserInfo,
      getHistory: ({ limit }) => fakeBridge.history.slice(0, limit)
    };

    const res = await handleGetChatHistory({ limit: 5 }, fakeBridge);
    const data = JSON.parse(res.content[0].text);
    assert.strictEqual(data.count, 1);
    assert.strictEqual(data.messages[0].text, '@Alice are you there?');
    assert.strictEqual(data.messages[0].raw_text, '@199911122233344 are you there?');
    assert.strictEqual(data.messages[0].mentions[0].name, 'Alice');
  });
});
