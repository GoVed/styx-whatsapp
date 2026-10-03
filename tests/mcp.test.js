import assert from 'node:assert/strict';
import { createBridge } from '../src/bridge/index.js';
import { handleJsonRpc, PROTOCOL_VERSION, SERVER_INFO } from '../src/mcp/server.js';
import { TOOL_DEFINITIONS } from '../src/mcp/tools.js';
import { startHttpServer } from '../src/mcp/http.js';

console.log('=== RUNNING COMPLETE STYX WHATSAPP TEST SUITE ===\n');

// 1. Run stickers unit tests
await import('./stickers.test.js');

// 2. Run bridge unit tests
await import('./bridge.test.js');

// 3. Run relay unit tests
await import('./relay.test.js');

// 4. Run chat export unit tests
await import('./chat-export.test.js');

// 5. Run mentions unit tests
await import('./mentions.test.js');

console.log('Testing MCP 2024-11-05 Server Protocol...');

const bridge = createBridge('mock');
await bridge.connect();

// 4. Test MCP 'initialize'
const initRes = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 101,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'styx-harness-test', version: '0.1.0' }
  }
}, bridge);

assert.equal(initRes.jsonrpc, '2.0');
assert.equal(initRes.id, 101);
assert.equal(initRes.result.protocolVersion, '2024-11-05');
assert.equal(initRes.result.serverInfo.name, 'styx-whatsapp');
assert.ok(initRes.result.capabilities.tools);
console.log('✓ MCP initialize handshake verified (2024-11-05)');

// 5. Test MCP 'tools/list'
const listRes = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 102,
  method: 'tools/list',
  params: {}
}, bridge);

assert.equal(listRes.jsonrpc, '2.0');
assert.equal(listRes.id, 102);
assert.ok(Array.isArray(listRes.result.tools));
assert.ok(listRes.result.tools.length >= 6);
const toolNames = listRes.result.tools.map(t => t.name);
assert.ok(toolNames.includes('find_stickers'));
assert.ok(toolNames.includes('send_sticker'));
assert.ok(toolNames.includes('send_message'));
assert.ok(toolNames.includes('send_reaction'));
assert.ok(toolNames.includes('get_whatsapp_status'));
assert.ok(toolNames.includes('get_chat_history'));
assert.ok(toolNames.includes('fetch_older_messages'));
assert.ok(toolNames.includes('list_chats'));
assert.ok(toolNames.includes('simulate_inbound_message'));
assert.ok(toolNames.includes('import_chat_export'));
console.log(`✓ MCP tools/list verified (${listRes.result.tools.length} tools registered)`);

// 6. Test MCP 'tools/call' find_stickers
const callFindStickers = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 103,
  method: 'tools/call',
  params: {
    name: 'find_stickers',
    arguments: { search: 'sad cat', limit: 2 }
  }
}, bridge);

assert.equal(callFindStickers.result.isError, false);
const parsedFind = JSON.parse(callFindStickers.result.content[0].text);
assert.equal(parsedFind.stickers[0].id, 'cat_sad_crying');
console.log('✓ tools/call find_stickers verified');

// 7. Test MCP 'tools/call' send_message
const callSendMsg = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 104,
  method: 'tools/call',
  params: {
    name: 'send_message',
    arguments: { to: '+1234567890', message: 'Hello from MCP test' }
  }
}, bridge);

assert.equal(callSendMsg.result.isError, false);
const parsedSend = JSON.parse(callSendMsg.result.content[0].text);
assert.equal(parsedSend.success, true);
assert.ok(parsedSend.messageId);
console.log('✓ tools/call send_message verified');

// 8. Test MCP 'tools/call' send_sticker
const callSendStk = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 105,
  method: 'tools/call',
  params: {
    name: 'send_sticker',
    arguments: { to: '+1234567890', sticker_id: 'cat_shrug' }
  }
}, bridge);

assert.equal(callSendStk.result.isError, false);
const parsedStk = JSON.parse(callSendStk.result.content[0].text);
assert.equal(parsedStk.success, true);
assert.equal(parsedStk.stickerId, 'cat_shrug');
console.log('✓ tools/call send_sticker verified');

// 8b. Test MCP 'tools/call' send_image
const callSendImg = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 1051,
  method: 'tools/call',
  params: {
    name: 'send_image',
    arguments: { to: '+1234567890', image: 'https://example.com/sunset.jpg', caption: 'Beautiful sunset' }
  }
}, bridge);

assert.equal(callSendImg.result.isError, false);
const parsedImg = JSON.parse(callSendImg.result.content[0].text);
assert.equal(parsedImg.success, true);
assert.ok(parsedImg.messageId);
assert.equal(parsedImg.caption, 'Beautiful sunset');
console.log('✓ tools/call send_image verified');

// 8c. Test MCP 'tools/call' send_gif
const callSendGif = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 1052,
  method: 'tools/call',
  params: {
    name: 'send_gif',
    arguments: { to: '+1234567890', gif: 'https://example.com/party.gif', caption: 'Party time!' }
  }
}, bridge);

assert.equal(callSendGif.result.isError, false);
const parsedGif = JSON.parse(callSendGif.result.content[0].text);
assert.equal(parsedGif.success, true);
assert.ok(parsedGif.messageId);
assert.equal(parsedGif.caption, 'Party time!');
console.log('✓ tools/call send_gif verified');

// 9. Test MCP 'tools/call' send_reaction
const callSendReact = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 106,
  method: 'tools/call',
  params: {
    name: 'send_reaction',
    arguments: { to: '+1234567890', message_id: parsedSend.messageId, emoji: '🔥' }
  }
}, bridge);

assert.equal(callSendReact.result.isError, false);
const parsedReact = JSON.parse(callSendReact.result.content[0].text);
assert.equal(parsedReact.success, true);
assert.equal(parsedReact.emoji, '🔥');
console.log('✓ tools/call send_reaction verified');

// 10. Test MCP 'tools/call' get_whatsapp_status
const callStatus = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 107,
  method: 'tools/call',
  params: { name: 'get_whatsapp_status', arguments: {} }
}, bridge);

assert.equal(callStatus.result.isError, false);
const parsedStatus = JSON.parse(callStatus.result.content[0].text);
assert.equal(parsedStatus.status, 'connected');
assert.equal(parsedStatus.mode, 'mock');
console.log('✓ tools/call get_whatsapp_status verified');

// 11. Test MCP 'tools/call' get_chat_history
const callHistory = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 108,
  method: 'tools/call',
  params: { name: 'get_chat_history', arguments: { limit: 10 } }
}, bridge);

assert.equal(callHistory.result.isError, false);
const parsedHist = JSON.parse(callHistory.result.content[0].text);
assert.ok(typeof parsedHist.count === 'number');
assert.ok(Array.isArray(parsedHist.messages));
if (parsedHist.messages.length > 0) {
  assert.ok('chat_jid' in parsedHist.messages[0]);
}
console.log('✓ tools/call get_chat_history verified');

// 11b. Test MCP 'tools/call' fetch_older_messages
const callFetchOlder = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 1082,
  method: 'tools/call',
  params: { name: 'fetch_older_messages', arguments: { chat: '+1234567890', count: 10 } }
}, bridge);

assert.equal(callFetchOlder.result.isError, false);
const parsedFetchOlder = JSON.parse(callFetchOlder.result.content[0].text);
assert.equal(parsedFetchOlder.success, true);
console.log('✓ tools/call fetch_older_messages verified');

// 11c. Test MCP 'tools/call' import_chat_export
const sampleExport = `
12/05/2023, 10:45 AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
12/05/2023, 10:46 AM - John Doe: Hey team
12/05/2023, 10:47 AM - Jane Smith: Working on Styx AI!
12/05/2023, 10:48 AM - You: Looking great!
`;
const callImport = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 1083,
  method: 'tools/call',
  params: {
    name: 'import_chat_export',
    arguments: {
      content: sampleExport,
      chat_name: 'Engineering Team'
    }
  }
}, bridge);

assert.equal(callImport.result.isError, false);
const parsedImport = JSON.parse(callImport.result.content[0].text);
assert.equal(parsedImport.success, true);
assert.equal(parsedImport.total_parsed_messages, 3);
assert.equal(parsedImport.chat_name, 'Engineering Team');
console.log('✓ tools/call import_chat_export verified');

// 12. Test MCP 'tools/call' list_chats
const callChats = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 109,
  method: 'tools/call',
  params: { name: 'list_chats', arguments: { limit: 5 } }
}, bridge);

assert.equal(callChats.result.isError, false);
const parsedChats = JSON.parse(callChats.result.content[0].text);
assert.ok(typeof parsedChats.count === 'number');
assert.ok(Array.isArray(parsedChats.chats));
console.log('✓ tools/call list_chats verified');

// 13. Test unknown tool error response
const callUnknown = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 110,
  method: 'tools/call',
  params: { name: 'non_existent_tool', arguments: {} }
}, bridge);

assert.equal(callUnknown.result.isError, true);
assert.ok(callUnknown.result.content[0].text.includes('Unknown tool'));
console.log('✓ Unknown tool error response verified');

// 12. Test unknown method error
const unknownMethod = await handleJsonRpc({
  jsonrpc: '2.0',
  id: 109,
  method: 'non_existent_method'
}, bridge);

assert.ok(unknownMethod.error);
assert.equal(unknownMethod.error.code, -32601);
console.log('✓ Unknown method JSON-RPC code -32601 verified');

await bridge.disconnect();

// 13. Test HTTP Transport Server
console.log('\nTesting MCP HTTP Transport Server...');
const httpPort = 9876;
const { server, host } = await startHttpServer({ port: httpPort, host: '127.0.0.1', mode: 'mock' });
const baseUrl = `http://${host}:${httpPort}`;

// Test GET /health
const healthRes = await fetch(`${baseUrl}/health`).then(r => r.json());
assert.equal(healthRes.status, 'healthy');
console.log('✓ GET /health verified');

// Test GET /status
const statusRes = await fetch(`${baseUrl}/status`).then(r => r.json());
assert.equal(statusRes.server.name, 'styx-whatsapp');
console.log('✓ GET /status verified');

// Test GET /stickers
const stickersRes = await fetch(`${baseUrl}/stickers?search=shrug`).then(r => r.json());
assert.equal(stickersRes.stickers[0].id, 'cat_shrug');
console.log('✓ GET /stickers?search=shrug verified');

// Test POST /mcp (JSON-RPC over HTTP)
const httpMcpRes = await fetch(`${baseUrl}/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 201,
    method: 'tools/list'
  })
}).then(r => r.json());

assert.equal(httpMcpRes.id, 201);
assert.ok(Array.isArray(httpMcpRes.result.tools));
console.log('✓ POST /mcp tools/list JSON-RPC verified');

// Test POST /trigger
const trigRes = await fetch(`${baseUrl}/trigger`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: '+15554443322',
    message: 'Can we reschedule tomorrow?',
    sender_name: 'David'
  })
}).then(r => r.json());

assert.equal(trigRes.success, true);
assert.equal(trigRes.simulated_event.from, '+15554443322');
assert.equal(trigRes.simulated_event.senderName, 'David');
console.log('✓ POST /trigger HTTP webhook simulation verified');

// Test POST /import-export
const importHttpRes = await fetch(`${baseUrl}/import-export`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: sampleExport,
    chat_name: 'Engineering Team'
  })
}).then(r => r.json());

assert.equal(importHttpRes.success, true);
assert.equal(importHttpRes.chat_name, 'Engineering Team');
console.log('✓ POST /import-export HTTP endpoint verified');

await new Promise(r => server.close(r));
console.log('✓ HTTP Server shutdown cleanly');

console.log('\n======================================================');
console.log('ALL TESTS PASSED! FULL MCP & CONNECTOR INTEGRATION OK');
console.log('======================================================\n');
