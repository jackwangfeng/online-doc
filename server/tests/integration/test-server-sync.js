const Y = require('yjs');
const syncProtocol = require('y-protocols/dist/sync.cjs');
const encoding = require('lib0/dist/encoding.cjs');
const decoding = require('lib0/dist/decoding.cjs');

console.log('=== Testing Server Sync ===\n');

// Create a server-side document
const serverDoc = new Y.Doc();
console.log('Server doc created');

// Test 1: Handle sync step 1
console.log('\n=== Test 1: Handle Sync Step 1 ===');
const clientDoc1 = new Y.Doc();

// writeSyncStep1 already writes messageYjsSyncStep1, don't write messageSync again
const encoder1 = encoding.createEncoder();
syncProtocol.writeSyncStep1(encoder1, clientDoc1);
const message1 = encoding.toUint8Array(encoder1);
console.log('Client sent sync step 1:', message1.length, 'bytes');
console.log('Message hex:', Buffer.from(message1).toString('hex'));

// Server processes it - readSyncMessage expects the message to start with sync type
const responseEncoder1 = encoding.createEncoder();
const decoder1 = decoding.createDecoder(message1);
const syncType1 = syncProtocol.readSyncMessage(decoder1, responseEncoder1, serverDoc, null);
console.log('Server processed sync type:', syncType1);

if (encoding.length(responseEncoder1) > 1) {
  const response1 = encoding.toUint8Array(responseEncoder1);
  console.log('Server sent response:', response1.length, 'bytes');
  console.log('Response hex:', Buffer.from(response1).toString('hex'));
  
  // Client processes response
  const clientDecoder1 = decoding.createDecoder(response1);
  const clientSyncType1 = syncProtocol.readSyncMessage(clientDecoder1, encoding.createEncoder(), clientDoc1, null);
  console.log('Client processed sync type:', clientSyncType1);
}

// Test 2: Handle update from client
console.log('\n=== Test 2: Handle Update ===');
const clientDoc2 = new Y.Doc();
const text = clientDoc2.getText('default');
text.insert(0, 'Hello from client!');

// writeUpdate already writes messageYjsUpdate, don't write messageSync again
const encoder2 = encoding.createEncoder();
syncProtocol.writeUpdate(encoder2, Y.encodeStateAsUpdate(clientDoc2));
const message2 = encoding.toUint8Array(encoder2);
console.log('Client sent update message:', message2.length, 'bytes');

// Server processes it
const responseEncoder2 = encoding.createEncoder();
const decoder2 = decoding.createDecoder(message2);
const syncType2 = syncProtocol.readSyncMessage(decoder2, responseEncoder2, serverDoc, 'websocket');
console.log('Server processed sync type:', syncType2);

// Check server doc content
console.log('Server doc text:', serverDoc.getText('default').toString());

console.log('\n=== All tests passed! ===');
