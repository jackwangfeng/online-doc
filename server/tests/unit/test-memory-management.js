const WebSocket = require('ws');

const roomId = '52c345cf-71d0-4a18-8312-225098ac5e1e';

function createConnection(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:3000/${roomId}`);
    
    ws.on('open', () => {
      console.log(`Client ${id} connected`);
      // Send sync step 1 request
      const message = new Uint8Array([0, 0]);
      ws.send(message);
      resolve(ws);
    });

    ws.on('message', (data) => {
      const msg = new Uint8Array(data);
      console.log(`Client ${id} received: type=${msg[0]}, subtype=${msg[1]}, length=${msg.length}`);
    });

    ws.on('close', () => {
      console.log(`Client ${id} disconnected`);
    });

    ws.on('error', (err) => {
      console.error(`Client ${id} error:`, err.message);
    });
  });
}

async function test() {
  console.log('=== Testing Memory Management ===\n');
  
  // Connect client 1
  console.log('Connecting client 1...');
  const ws1 = await createConnection(1);
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Connect client 2
  console.log('\nConnecting client 2...');
  const ws2 = await createConnection(2);
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Disconnect client 1
  console.log('\nDisconnecting client 1...');
  ws1.close();
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Disconnect client 2
  console.log('\nDisconnecting client 2...');
  ws2.close();
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('\n=== Test Complete ===');
  console.log('Check server logs to see connection count and cache cleanup');
  process.exit(0);
}

test();
