const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/dist/sync.cjs');
const encoding = require('lib0/dist/encoding.cjs');
const decoding = require('lib0/dist/decoding.cjs');

// Test 1: Create a sync step 1 message
console.log('=== Test 1: Sync Step 1 Message ===');
const ydoc1 = new Y.Doc();
const encoder1 = encoding.createEncoder();
encoding.writeVarUint(encoder1, 0); // messageSync
syncProtocol.writeSyncStep1(encoder1, ydoc1);
const message1 = encoding.toUint8Array(encoder1);
console.log('Message length:', message1.length);
console.log('Message hex:', Buffer.from(message1).toString('hex'));

// Decode it back
const decoder1 = decoding.createDecoder(message1);
const msgType1 = decoding.readVarUint(decoder1);
const syncType1 = decoding.readVarUint(decoder1);
console.log('Decoded - messageType:', msgType1, 'syncType:', syncType1);

// Test 2: Create an update message
console.log('\n=== Test 2: Update Message ===');
const ydoc2 = new Y.Doc();
const text = ydoc2.getText('default');
text.insert(0, 'Hello');
const update = Y.encodeStateAsUpdate(ydoc2);
console.log('Update length:', update.length);

const encoder2 = encoding.createEncoder();
encoding.writeVarUint(encoder2, 0); // messageSync
syncProtocol.writeUpdate(encoder2, update);
const message2 = encoding.toUint8Array(encoder2);
console.log('Message length:', message2.length);
console.log('Message hex:', Buffer.from(message2).toString('hex').slice(0, 100));

// Decode it back
const decoder2 = decoding.createDecoder(message2);
const msgType2 = decoding.readVarUint(decoder2);
const syncType2 = decoding.readVarUint(decoder2);
console.log('Decoded - messageType:', msgType2, 'syncType:', syncType2);

// Test 3: Try to read the update back
console.log('\n=== Test 3: Read Update Back ===');
const readUpdate = decoding.readVarUint8Array(decoder2);
console.log('Read update length:', readUpdate.length);

// Apply to a new doc
const ydoc3 = new Y.Doc();
Y.applyUpdate(ydoc3, readUpdate);
console.log('Applied update to new doc');
console.log('Text content:', ydoc3.getText('default').toString());

console.log('\n=== All tests passed! ===');
