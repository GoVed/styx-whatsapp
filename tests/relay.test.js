import http from 'node:http';
import assert from 'node:assert/strict';
import { createBridge } from '../src/bridge/index.js';
import { createRelay } from '../src/webhook/relay.js';

console.log('Testing Styx Relay Module...');

// Spin up a mock Styx OS HTTP server
let capturedRequest = null;
let authHeader = null;
let accessKeyHeader = null;

const mockStyxServer = http.createServer(async (req, res) => {
  if (req.url === '/api/tools/trigger' && req.method === 'POST') {
    authHeader = req.headers['authorization'];
    accessKeyHeader = req.headers['x-styx-access-key'];

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      capturedRequest = JSON.parse(body);
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session_id: 'mock-styx-session-uuid',
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

await new Promise((resolve) => mockStyxServer.listen(0, '127.0.0.1', resolve));
const port = mockStyxServer.address().port;
const mockStyxUrl = `http://127.0.0.1:${port}`;
console.log(`✓ Mock Styx server running on ${mockStyxUrl}`);

const bridge = createBridge('mock');
await bridge.connect();

const relay = createRelay(bridge, {
  styxApiUrl: mockStyxUrl,
  styxAccessKey: 'test-styx-secret-key-123'
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

// Assert Styx received proper payload
assert.ok(capturedRequest, 'Mock Styx must have received trigger payload');
assert.equal(capturedRequest.protocol, 'whatsapp');
assert.equal(capturedRequest.event_type, 'new_message');
assert.equal(capturedRequest.source_id, 'Charlie (+15551234567)');
assert.equal(capturedRequest.payload.from, '+15551234567');
assert.equal(capturedRequest.payload.sender_name, 'Charlie');
assert.equal(capturedRequest.payload.message, 'Hey, can you summarize my schedule?');
console.log('✓ InboundToolEventRequest structure matches Styx OS schema');

// Assert authentication headers
assert.equal(authHeader, 'Bearer test-styx-secret-key-123');
assert.equal(accessKeyHeader, 'test-styx-secret-key-123');
console.log('✓ Styx API authorization headers verified');

// Test session tracking on subsequent turn
bridge.simulateInboundMessage({
  from: '+15551234567',
  message: 'Second message in conversation',
  senderName: 'Charlie'
});
await new Promise(r => setTimeout(r, 200));

assert.equal(capturedRequest.session_id, 'mock-styx-session-uuid');
assert.equal(capturedRequest.mode, 'chat');
assert.equal(capturedRequest.channel_id, '15551234567@s.whatsapp.net');
console.log('✓ Subsequent turn passes existing session_id, channel_id, and mode: chat');

// Check relay stats
const stats = relay.getStats();
assert.equal(stats.relayedCount, 2);
assert.equal(stats.failedCount, 0);
assert.ok(stats.lastRelayedAt);
console.log('✓ Relay stats verified');

relay.stop();
await bridge.disconnect();
await new Promise(r => mockStyxServer.close(r));
console.log('All Styx Relay Tests Passed Successfully!\n');
