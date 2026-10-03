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
    assert.strictEqual(out.text, 'Thanks @Alice, I will merge it.');
    assert.strictEqual(out.wireText, 'Thanks @199911122233344, I will merge it.');
    assert.strictEqual(out.resolvedMentions[0].name, 'Alice');
  });

  await t.test('resolves multi-word and quoted contact names for outbound wireText', () => {
    const bridge = {
      contacts: fakeContacts,
      chats: fakeChats,
      history: fakeHistory
    };

    // Multi-word name without quotes
    const out1 = resolveOutboundMentions('Hey @Bob Smith, did you test this?', bridge);
    assert.deepStrictEqual(out1.mentions, ['14155552671@s.whatsapp.net']);
    assert.strictEqual(out1.text, 'Hey @Bob Smith, did you test this?');
    assert.strictEqual(out1.wireText, 'Hey @14155552671, did you test this?');

    // Quoted name
    const out2 = resolveOutboundMentions('Hello @"Bob Smith", please check.', bridge);
    assert.deepStrictEqual(out2.mentions, ['14155552671@s.whatsapp.net']);
    assert.strictEqual(out2.wireText, 'Hello @14155552671, please check.');

    // First-name partial match
    const out3 = resolveOutboundMentions('Ping @Bob for the update', bridge);
    assert.deepStrictEqual(out3.mentions, ['14155552671@s.whatsapp.net']);
    assert.strictEqual(out3.wireText, 'Ping @14155552671 for the update');
  });

  await t.test('resolves @everyone and @all in group chats to all participant JIDs', () => {
    const groupWithParticipants = new Map([
      ['120363000000000001@g.us', {
        jid: '120363000000000001@g.us',
        name: 'Engineering Team',
        participants: [
          { id: '199911122233344@lid', name: 'Alice' },
          { id: '14155552671@s.whatsapp.net', name: 'Bob Smith' },
          { id: '18887776655@s.whatsapp.net', name: 'Charlie' }
        ]
      }]
    ]);

    const bridge = {
      contacts: fakeContacts,
      chats: groupWithParticipants,
      history: fakeHistory
    };

    const out = resolveOutboundMentions('Attention @everyone meeting starts now!', bridge, {
      chatJid: '120363000000000001@g.us'
    });

    assert.strictEqual(out.mentions.length, 3);
    assert.ok(out.mentions.includes('199911122233344@lid'));
    assert.ok(out.mentions.includes('14155552671@s.whatsapp.net'));
    assert.ok(out.mentions.includes('18887776655@s.whatsapp.net'));
  });

  await t.test('resolves explicitMentions passed in options', () => {
    const bridge = {
      contacts: fakeContacts,
      chats: fakeChats,
      history: fakeHistory
    };

    const out = resolveOutboundMentions('Good work on the release', bridge, {
      explicitMentions: ['Alice', '+14155552671']
    });

    assert.ok(out.mentions.includes('199911122233344@lid'));
    assert.ok(out.mentions.includes('14155552671@s.whatsapp.net'));
  });

  await t.test('resolves phone number tags directly in text', () => {
    const bridge = {
      contacts: fakeContacts,
      chats: fakeChats,
      history: fakeHistory
    };

    const out = resolveOutboundMentions('Check with @+14155552671 please', bridge);
    assert.deepStrictEqual(out.mentions, ['14155552671@s.whatsapp.net']);
    assert.strictEqual(out.wireText, 'Check with @14155552671 please');
  });

  await t.test('MockWhatsAppBridge sendMessage and sendImage resolve mentions and wireText', async () => {
    const { MockWhatsAppBridge } = await import('../src/bridge/mock.js');
    const mock = new MockWhatsAppBridge();
    mock.contacts = fakeContacts;
    mock.chats = fakeChats;

    const sent = await mock.sendMessage('120363000000000001@g.us', 'Thanks @Bob Smith!');
    assert.strictEqual(sent.text, 'Thanks @Bob Smith!');
    assert.strictEqual(sent.rawText, 'Thanks @14155552671!');
    assert.deepStrictEqual(sent.mentions, ['14155552671@s.whatsapp.net']);

    const sentImg = await mock.sendImage('120363000000000001@g.us', 'https://example.com/pic.png', 'Look @Alice');
    assert.strictEqual(sentImg.caption, 'Look @Alice');
    assert.strictEqual(sentImg.rawCaption, 'Look @199911122233344');
    assert.deepStrictEqual(sentImg.mentions, ['199911122233344@lid']);
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
