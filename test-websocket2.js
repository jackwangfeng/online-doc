const WebSocket = require('ws');

// Test with an existing room that has data
const roomId = '52c345cf-71d0-4a18-8312-225098ac5e1e';
const ws = new WebSocket(`ws://localhost:3000/${roomId}`);

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
    subtype: message[1],
    data: Array.from(message.slice(0, 50))
  });
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
