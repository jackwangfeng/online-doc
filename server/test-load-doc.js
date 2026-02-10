const WebSocket = require('ws');
const Y = require('yjs');

// Test with an existing room that has data
const roomId = '52c345cf-71d0-4a18-8312-225098ac5e1e';
const ws = new WebSocket(`ws://localhost:3000/${roomId}`);

const ydoc = new Y.Doc();

ws.on('open', () => {
  console.log('Connected to WebSocket');
  
  // Send sync step 1 request
  const message = new Uint8Array([0, 0]); // type=0 (sync), subtype=0 (step1)
  ws.send(message);
  console.log('Sent sync step 1 request');
});

ws.on('message', (data) => {
  const message = new Uint8Array(data);
  console.log('Received message:', {
    length: message.length,
    type: message[0],
    subtype: message[1]
  });
  
  if (message[0] === 0 && message[1] === 1) {
    // Sync step 2 - apply state to ydoc
    const state = message.slice(2);
    console.log('Applying state:', state.length, 'bytes');
    Y.applyUpdate(ydoc, state);
    
    // Check what's in the document
    const text = ydoc.getText('default');
    console.log('Document text length:', text.length);
    console.log('Document text (first 100 chars):', text.toString().slice(0, 100));
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
}, 3000);
