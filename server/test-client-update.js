const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/dist/sync.cjs');
const encoding = require('lib0/dist/encoding.cjs');
const decoding = require('lib0/dist/decoding.cjs');

const roomId = 'test-room-' + Date.now();
const ws = new WebSocket(`ws://localhost:3000/${roomId}`);

const ydoc = new Y.Doc();

ws.on('open', () => {
  console.log('Connected to WebSocket');
  
  // Send sync step 1 request using y-protocols format
  // writeSyncStep1 writes: [0 (messageYjsSyncStep1), stateVector...]
  const encoder = encoding.createEncoder();
  syncProtocol.writeSyncStep1(encoder, ydoc);
  const message = encoding.toUint8Array(encoder);
  ws.send(message);
  console.log('Sent sync step 1 request:', message.length, 'bytes');
  console.log('Message hex:', Buffer.from(message).toString('hex'));
  
  // Wait a bit then send an update
  setTimeout(() => {
    console.log('\n--- Creating and sending update ---');
    
    // Create some content
    const text = ydoc.getText('default');
    text.insert(0, 'Hello from client!');
    
    // Get the update
    const update = Y.encodeStateAsUpdate(ydoc);
    console.log('Update size:', update.length, 'bytes');
    
    // Send update to server using y-protocols format
    // writeUpdate writes: [2 (messageYjsUpdate), update...]
    const encoder2 = encoding.createEncoder();
    syncProtocol.writeUpdate(encoder2, update);
    const message2 = encoding.toUint8Array(encoder2);
    
    ws.send(message2);
    console.log('Sent update to server:', message2.length, 'bytes');
    console.log('Message hex:', Buffer.from(message2).toString('hex').slice(0, 100));
    
    // Wait and check server response
    setTimeout(() => {
      console.log('\n--- Checking server state ---');
      
      // Request sync again to see what server has
      const encoder3 = encoding.createEncoder();
      syncProtocol.writeSyncStep1(encoder3, new Y.Doc()); // Empty doc to get full state
      const message3 = encoding.toUint8Array(encoder3);
      ws.send(message3);
      console.log('Sent sync step 1 to check server state');
    }, 1000);
  }, 1000);
});

ws.on('message', (data) => {
  const message = new Uint8Array(data);
  console.log('\nReceived message:', {
    length: message.length,
    type: message[0]
  });
  
  // Decode the message using y-protocols
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  
  if (messageType === 1) {
    // Sync step 2 - apply state to ydoc
    const state = decoding.readVarUint8Array(decoder);
    console.log('Server state size:', state.length, 'bytes');
    
    // Apply to a new doc to check content
    const checkDoc = new Y.Doc();
    Y.applyUpdate(checkDoc, state);
    
    const text = checkDoc.getText('default');
    console.log('Server document text:', text.toString());
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

ws.on('close', () => {
  console.log('WebSocket closed');
});

setTimeout(() => {
  ws.close();
  process.exit(0);
}, 5000);
