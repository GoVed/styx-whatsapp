import assert from 'node:assert/strict';
import test from 'node:test';
import { MockWhatsAppBridge } from '../src/bridge/mock.js';
import { applyReactionToHistory } from '../src/bridge/history-ops.js';
import { StyxRelay } from '../src/webhook/relay.js';
import { executeTool } from '../src/mcp/tools.js';

test('Reactions: applyReactionToHistory logic', () => {
  const history = [
    { messageId: 'msg_1', text: 'Hello world', from: '+1234567890', timestamp: 1000 }
  ];

  // 1. Add reaction from Alice
  const updated1 = applyReactionToHistory({
    history,
    targetMessageId: 'msg_1',
    emoji: '👍',
    senderName: 'Alice',
    senderJid: '1234567890@s.whatsapp.net',
    fromMe: false,
    timestamp: 1010
  });
  assert.equal(updated1?.reactions?.length, 1);
  assert.equal(updated1.reactions[0].emoji, '👍');
  assert.equal(updated1.reactions[0].senderName, 'Alice');

  // 2. Add reaction from Bob
  applyReactionToHistory({
    history,
    targetMessageId: 'msg_1',
    emoji: '🔥',
    senderName: 'Bob',
    senderJid: '9876543210@s.whatsapp.net',
    fromMe: false,
    timestamp: 1015
  });
  assert.equal(history[0].reactions.length, 2);

  // 3. Alice changes her reaction to ❤️
  applyReactionToHistory({
    history,
    targetMessageId: 'msg_1',
    emoji: '❤️',
    senderName: 'Alice',
    senderJid: '1234567890@s.whatsapp.net',
    fromMe: false,
    timestamp: 1020
  });
  assert.equal(history[0].reactions.length, 2);
  const aliceReaction = history[0].reactions.find((r) => r.senderName === 'Alice');
  assert.equal(aliceReaction.emoji, '❤️');

  // 4. Bob removes his reaction
  applyReactionToHistory({
    history,
    targetMessageId: 'msg_1',
    emoji: '',
    senderName: 'Bob',
    senderJid: '9876543210@s.whatsapp.net',
    fromMe: false,
    timestamp: 1025
  });
  assert.equal(history[0].reactions.length, 1);
  assert.equal(history[0].reactions[0].senderName, 'Alice');
});

test('Reactions: MockWhatsAppBridge sendReaction and simulateInboundReaction', async () => {
  const bridge = new MockWhatsAppBridge();
  await bridge.connect();

  // Seed history with an inbound message
  const msg = bridge.simulateInboundMessage({
    from: '+15551112233',
    message: 'Can you confirm tomorrow at 2pm?',
    senderName: 'Charlie'
  });

  // Outbound reaction without specifying message_id (defaults to latest)
  const outReaction = await bridge.sendReaction('+15551112233', 'latest', '👍');
  assert.equal(outReaction.success, true);
  assert.equal(outReaction.messageId, msg.messageId);
  assert.equal(outReaction.emoji, '👍');
  assert.equal(outReaction.isRemoved, false);

  // Verify reaction applied to history
  const targetInHistory = bridge.history.find((h) => h.messageId === msg.messageId);
  assert.ok(targetInHistory);
  assert.equal(targetInHistory.reactions?.length, 1);
  assert.equal(targetInHistory.reactions[0].emoji, '👍');
  assert.equal(targetInHistory.reactions[0].fromMe, true);

  // Inbound reaction simulated from Charlie
  let reactionEmitted = null;
  bridge.once('reaction', (evt) => {
    reactionEmitted = evt;
  });

  const inReaction = bridge.simulateInboundReaction({
    from: '+15551112233',
    targetMessageId: msg.messageId,
    emoji: '🎉',
    senderName: 'Charlie'
  });

  assert.ok(reactionEmitted);
  assert.equal(reactionEmitted.reaction, '🎉');
  assert.equal(reactionEmitted.targetMessageId, msg.messageId);
  assert.ok(reactionEmitted.message.includes('🎉'));
  assert.ok(reactionEmitted.message.includes('Can you confirm tomorrow at 2pm?'));

  // Target message in history now has 2 reactions (You and Charlie)
  assert.equal(targetInHistory.reactions.length, 2);

  // Outbound removal of reaction
  await bridge.sendReaction('+15551112233', msg.messageId, 'none');
  assert.equal(targetInHistory.reactions.length, 1);
  assert.equal(targetInHistory.reactions[0].senderName, 'Charlie');
});

test('Reactions: StyxRelay forwards reaction event_type with payload metadata', async () => {
  const bridge = new MockWhatsAppBridge();
  await bridge.connect();

  const forwardedEvents = [];
  const relay = new StyxRelay(bridge, {
    styxApiUrl: 'http://mock-styx:3000',
    styxAccessKey: 'test-key'
  });

  // Mock forwardEvent
  relay.forwardEvent = async (eventData) => {
    forwardedEvents.push(eventData);
    return { success: true };
  };
  relay.start();

  // Simulate inbound message then reaction
  const msg = bridge.simulateInboundMessage({
    from: '+15559998877',
    message: 'Let us launch the project today!',
    senderName: 'Dana'
  });

  bridge.simulateInboundReaction({
    from: '+15559998877',
    targetMessageId: msg.messageId,
    emoji: '🚀',
    senderName: 'Dana'
  });

  assert.equal(forwardedEvents.length, 2);
  const reactionForward = forwardedEvents[1];
  assert.equal(reactionForward.type, 'reaction');
  assert.equal(reactionForward.reaction, '🚀');
  assert.equal(reactionForward.targetMessageId, msg.messageId);
  assert.equal(reactionForward.targetMessageText, 'Let us launch the project today!');
  relay.stop();
});

test('Reactions: MCP send_reaction with aliases and latest message resolution', async () => {
  const bridge = new MockWhatsAppBridge();
  await bridge.connect();

  // Send a message first
  await bridge.sendMessage('+1234567890', 'Hello from test');

  // Call MCP tool send_reaction using chat and reaction aliases
  const result = await executeTool('send_reaction', {
    chat: '+1234567890',
    reaction: '💯'
  }, bridge);

  assert.equal(result.isError, false);
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.success, true);
  assert.equal(parsed.emoji, '💯');
  assert.equal(parsed.isRemoved, false);
});
