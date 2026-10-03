import http from 'node:http';
import assert from 'node:assert/strict';
import { createBridge } from '../src/bridge/index.js';
import { createRelay } from '../src/webhook/relay.js';

console.log('Testing Syndae Relay Module...');

// Spin up a mock Syndae OS HTTP server
let capturedRequest = null;
let authHeader = null;
let accessKeyHeader = null;

const mockSyndaeServer = http.createServer(async (req, res) => {
  if (req.url === '/api/tools/trigger' && req.method === 'POST') {
    authHeader = req.headers['authorization'];
    accessKeyHeader = req.headers['x-syndae-access-key'];

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      capturedRequest = JSON.parse(body);
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session_id: 'mock-syndae-session-uuid',
        turn_id: 'turn-999',
        status: 'running',
        protocol: 'whatsapp',
        event_type: 'new_message'
      }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve) => mockSyndaeServer.listen(0, '127.0.0.1', resolve));
const port = mockSyndaeServer.address().port;
const mockSyndaeUrl = `http://127.0.0.1:${port}`;
console.log(`✓ Mock Syndae server running on ${mockSyndaeUrl}`);

const bridge = createBridge('mock');
await bridge.connect();

const relay = createRelay(bridge, {
  syndaeApiUrl: mockSyndaeUrl,
  syndaeAccessKey: 'test-syndae-secret-key-123'
});

relay.start();
console.log('✓ Relay started');

// Simulate incoming message to test forwarding
bridge.simulateInboundMessage({
  from: '+15551234567',
  message: 'Hey, can you summarize my schedule?',
  senderName: 'Charlie'
});

// Allow async event loop cycle
await new Promise(r => setTimeout(r, 200));

// Assert Syndae received proper payload
assert.ok(capturedRequest, 'Mock Syndae must have received trigger payload');
assert.equal(capturedRequest.protocol, 'whatsapp');
assert.equal(capturedRequest.event_type, 'new_message');
assert.equal(capturedRequest.source_id, 'Charlie (+15551234567)');
assert.equal(capturedRequest.payload.from, '+15551234567');
assert.equal(capturedRequest.payload.sender_name, 'Charlie');
assert.equal(capturedRequest.payload.message, 'Hey, can you summarize my schedule?');
console.log('✓ InboundToolEventRequest structure matches Syndae OS schema');

// Assert authentication headers
assert.equal(authHeader, 'Bearer test-syndae-secret-key-123');
assert.equal(accessKeyHeader, 'test-syndae-secret-key-123');
console.log('✓ Syndae API authorization headers verified');

// Test session tracking on subsequent turn
bridge.simulateInboundMessage({
  from: '+15551234567',
  message: 'Second message in conversation',
  senderName: 'Charlie'
});
await new Promise(r => setTimeout(r, 200));

assert.equal(capturedRequest.session_id, 'mock-syndae-session-uuid');
assert.equal(capturedRequest.mode, 'chat');
assert.equal(capturedRequest.channel_id, '15551234567@s.whatsapp.net');
console.log('✓ Subsequent turn passes existing session_id, channel_id, and mode: chat');

// Test group message forwarding and participant isolation
bridge.simulateInboundMessage({
  from: '+15559876543',
  senderName: 'Bob Participant',
  isGroup: true,
  groupId: '120363028840427086@g.us',
  groupName: 'Computer Scientist',
  message: 'Hey all, who is writing the research paper?'
});
await new Promise(r => setTimeout(r, 200));

assert.equal(capturedRequest.payload.is_group, true);
assert.equal(capturedRequest.payload.group_name, 'Computer Scientist');
assert.equal(capturedRequest.channel_id, '120363028840427086@g.us');
assert.equal(capturedRequest.payload.sender_name, 'Bob Participant');
console.log('✓ Group message forwards group_name and keys off group chat_jid');

// Verify that Bob's direct JID is NOT mapped to the group session ID
assert.notEqual(relay.getSession('15559876543@s.whatsapp.net'), 'mock-syndae-session-uuid');
assert.equal(relay.getSession('120363028840427086@g.us'), 'mock-syndae-session-uuid');
console.log('✓ Participant isolation verified: group session is not assigned to individual participant JID');

// Check relay stats
const stats = relay.getStats();
assert.equal(stats.relayedCount, 3);
assert.equal(stats.failedCount, 0);
assert.ok(stats.lastRelayedAt);
console.log('✓ Relay stats verified');

relay.stop();
await bridge.disconnect();
await new Promise(r => mockSyndaeServer.close(r));
console.log('All Syndae Relay Tests Passed Successfully!\n');
