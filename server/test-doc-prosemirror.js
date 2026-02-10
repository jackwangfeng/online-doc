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
      console.log('\nYjs document shared types:', Array.from(ydoc.share.keys()));
      
      // Check all shared types
      ydoc.share.forEach((value, key) => {
        console.log(`\nShared type "${key}": ${value.constructor.name}`);
        
        if (value instanceof Y.XmlFragment) {
          console.log('  XmlFragment content:', value.toString());
        } else if (value instanceof Y.XmlElement) {
          console.log('  XmlElement content:', value.toString());
        } else if (value instanceof Y.Text) {
          console.log('  Text content:', value.toString());
        } else if (value instanceof Y.Array) {
          console.log('  Array length:', value.length);
          console.log('  Array content:', value.toArray());
        } else if (value instanceof Y.Map) {
          console.log('  Map keys:', Array.from(value.keys()));
        }
      });
      
      // Try prosemirror specific types
      console.log('\n--- Checking prosemirror types ---');
      
      // TipTap/ProseMirror uses 'prosemirror' as the key
      if (ydoc.share.has('prosemirror')) {
        const pm = ydoc.getXmlFragment('prosemirror');
        console.log('ProseMirror fragment:', pm.toString());
      }
      
      // Check for any XML content
      console.log('\n--- All XML content ---');
      ydoc.share.forEach((value, key) => {
        if (value.toString) {
          console.log(`${key}: ${value.toString().slice(0, 200)}`);
        }
      });
      
    } catch (err) {
      console.error('Error:', err);
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
