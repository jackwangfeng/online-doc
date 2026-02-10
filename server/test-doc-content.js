const WebSocket = require('ws');
const Y = require('yjs');

const roomId = '76548a16-d703-4dba-b688-502358f56384';
const ws = new WebSocket(`ws://localhost:3000/${roomId}`);

const ydoc = new Y.Doc();

ws.on('open', () => {
  console.log('Connected to WebSocket');
  
  // Send sync step 1 request
  const message = new Uint8Array([0, 0]);
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
    
    try {
      Y.applyUpdate(ydoc, state);
      
      // Check what's in the document
      console.log('Yjs document contents:');
      console.log('- Shared types:', Array.from(ydoc.share.keys()));
      
      // Try to get default text
      const text = ydoc.getText('default');
      console.log('- Text length:', text.length);
      console.log('- Text content:', text.toString());
      
      // Check all shared types
      ydoc.share.forEach((value, key) => {
        console.log(`- Shared type "${key}":`, value.constructor.name);
      });
    } catch (err) {
      console.error('Error applying update:', err);
    }
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
