import assert from 'node:assert/strict';
import { createBridge, getBridge } from '../src/bridge/index.js';

console.log('Testing WhatsApp Bridge Module...');

// 1. Instantiation
const bridge = createBridge('mock');
assert.equal(bridge.mode, 'mock');
assert.equal(bridge.status, 'disconnected');
console.log('✓ Mock bridge instantiated');

// 2. JID formatting
assert.equal(bridge.formatJid('+1 (234) 567-8901'), '12345678901@s.whatsapp.net');
assert.equal(bridge.formatJid('12345@s.whatsapp.net'), '12345@s.whatsapp.net');
assert.equal(bridge.formatJid('155500011122233@lid'), '155500011122233@lid');
bridge.contacts.set('155500011122233@lid', {
  jid: '155500011122233@lid',
  name: 'Alice'
});
assert.equal(bridge.formatJid('Alice'), '155500011122233@lid');
assert.equal(bridge.formatJid('120363000000000000@g.us'), '120363000000000000@g.us');
assert.throws(() => bridge.formatJid('12'), /Invalid phone number/);
console.log('✓ JID normalization verified');

// 3. Connect
const user = await bridge.connect();
assert.equal(bridge.status, 'connected');
assert.ok(user.phone, 'User should have phone');
console.log('✓ Bridge connection verified');

// 4. Outbound Text Message
const msgRes = await bridge.sendMessage('+19876543210', 'Test message from Styx');
assert.equal(msgRes.success, true);
assert.equal(msgRes.to, '19876543210@s.whatsapp.net');
assert.ok(msgRes.messageId.startsWith('MOCK_OUT_'));
console.log('✓ Outbound text message verified');

// 5. Outbound Sticker
const stkRes = await bridge.sendSticker('+19876543210', 'cat_sad_crying');
assert.equal(stkRes.success, true);
assert.equal(stkRes.stickerId, 'cat_sad_crying');
assert.equal(stkRes.stickerName, 'Sad Crying Cat');
console.log('✓ Outbound sticker verified');

// 5b. Outbound Image
const imgRes = await bridge.sendImage('+19876543210', 'https://example.com/photo.png', 'Here is the diagram');
assert.equal(imgRes.success, true);
assert.ok(imgRes.messageId.startsWith('MOCK_IMG_'));
assert.equal(imgRes.caption, 'Here is the diagram');
console.log('✓ Outbound image verified');

// 5c. Outbound GIF
const gifRes = await bridge.sendGif('+19876543210', 'https://example.com/celebrate.gif', 'Great job!');
assert.equal(gifRes.success, true);
assert.ok(gifRes.messageId.startsWith('MOCK_GIF_'));
assert.equal(gifRes.caption, 'Great job!');
console.log('✓ Outbound GIF verified');

// 6. Outbound Reaction
const reactRes = await bridge.sendReaction('+19876543210', msgRes.messageId, '👍');
assert.equal(reactRes.success, true);
assert.equal(reactRes.emoji, '👍');
console.log('✓ Outbound reaction verified');

// 7. Message History
const history = bridge.getHistory(10);
assert.ok(history.length >= 5, 'Should have at least 5 messages in history');
console.log(`✓ Message history tracking verified (${history.length} records)`);

// 8. Inbound message simulation event
let receivedEvent = null;
bridge.on('message', (evt) => {
  receivedEvent = evt;
});

const sim = bridge.simulateInboundMessage({
  from: '+15559998877',
  message: 'Hey Styx, free for lunch?',
  senderName: 'Bob'
});

assert.ok(receivedEvent, 'Inbound message event should have fired');
assert.equal(receivedEvent.from, '+15559998877');
assert.equal(receivedEvent.message, 'Hey Styx, free for lunch?');
assert.equal(receivedEvent.senderName, 'Bob');
console.log('✓ Inbound message simulation event verified');

// 8b. Group chat subject retention & query by group subject
bridge.recordChat({
  jid: '15551234567-1600000000@g.us',
  name: 'Engineering Team'
});

bridge.recordHistory({
  messageId: 'GRP_TEST_1',
  direction: 'inbound',
  type: 'text',
  from: '+15559876543',
  senderJid: '15559876543@s.whatsapp.net',
  senderName: 'Charlie',
  chatName: 'Engineering Team',
  message: 'Deploying build to staging',
  text: 'Deploying build to staging',
  isGroup: true,
  timestamp: Date.now() + 1000,
  chatJid: '15551234567-1600000000@g.us'
});

const groupChat = bridge.chats.get('15551234567-1600000000@g.us');
assert.equal(groupChat.name, 'Engineering Team');

const groupHist = bridge.getHistory({ chat: 'Engineering Team', limit: 250 });
assert.ok(groupHist.length > 0);
const testMsg = groupHist.find(m => m.messageId === 'GRP_TEST_1');
assert.ok(testMsg, 'GRP_TEST_1 should be in group history');
assert.equal(testMsg.text, 'Deploying build to staging');
console.log('✓ Group chat subject retention and getHistory query verified');

// 8c. Empty message guard
const histCountBefore = bridge.history.length;
bridge.recordHistory({
  messageId: 'EMPTY_TEST',
  type: 'empty',
  text: '',
  message: ''
});
assert.equal(bridge.history.length, histCountBefore, 'Empty messages should be filtered from history');
console.log('✓ Empty message rejection verified');

// 9. Disconnect
await bridge.disconnect();
assert.equal(bridge.status, 'disconnected');
console.log('✓ Bridge disconnection verified');

console.log('All WhatsApp Bridge Tests Passed Successfully!\n');
