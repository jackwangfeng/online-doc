const Y = require('yjs');

// Simulate the persistence layer
class TestPersistence {
  constructor() {
    this.docs = new Map();
    this.storedUpdates = [];
  }

  async getYDoc(roomName) {
    if (this.docs.has(roomName)) {
      return this.docs.get(roomName);
    }

    const ydoc = new Y.Doc();
    
    // Set up persistence on update
    ydoc.on('update', async (update, origin) => {
      console.log('Persistence received update:', update.length, 'bytes, origin:', typeof origin);
      this.storedUpdates.push({
        update: Buffer.from(update),
        origin: typeof origin,
        timestamp: new Date()
      });
    });

    this.docs.set(roomName, ydoc);
    return ydoc;
  }
}

async function test() {
  const persistence = new TestPersistence();
  const roomName = 'test-room';
  
  console.log('=== Testing Persistence ===\n');
  
  // Get document
  const ydoc = await persistence.getYDoc(roomName);
  
  // Simulate what happens when server receives update from client
  console.log('1. Simulating client sending update...');
  
  // Create a real Yjs update with content (like client would send)
  const clientDoc = new Y.Doc();
  const text = clientDoc.getText('default');
  text.insert(0, 'Hello from client');
  const update = Y.encodeStateAsUpdate(clientDoc);
  
  console.log('   Client update size:', update.length, 'bytes');
  console.log('   Update data:', Buffer.from(update).toString('hex').slice(0, 100));
  
  // Apply to server doc with origin (like index.js does)
  const mockWs = { id: 'websocket-1' };
  Y.applyUpdate(ydoc, update, mockWs);
  
  await new Promise(r => setTimeout(r, 100));
  
  console.log('\n2. Stored updates count:', persistence.storedUpdates.length);
  
  persistence.storedUpdates.forEach((u, i) => {
    console.log(`   Update ${i}: ${u.update.length} bytes, origin: ${u.origin}`);
  });
  
  // Check the content
  const serverText = ydoc.getText('default');
  console.log('\n3. Server document text:', serverText.toString());
  
  // Now simulate another update from same client
  console.log('\n4. Simulating another update from same client...');
  text.insert(17, ' - more text');
  const update2 = Y.encodeStateAsUpdate(clientDoc);
  console.log('   Second update size:', update2.length, 'bytes');
  
  Y.applyUpdate(ydoc, update2, mockWs);
  
  await new Promise(r => setTimeout(r, 100));
  
  console.log('\n5. Total stored updates:', persistence.storedUpdates.length);
  console.log('6. Server document text:', ydoc.getText('default').toString());
  
  // Check stored data can be reloaded
  console.log('\n7. Testing reload from stored updates...');
  const newDoc = new Y.Doc();
  persistence.storedUpdates.forEach((u, i) => {
    const arr = new Uint8Array(u.update);
    console.log(`   Applying update ${i}: ${arr.length} bytes`);
    try {
      Y.applyUpdate(newDoc, arr);
      console.log(`     OK - Text now: "${newDoc.getText('default').toString().slice(0, 50)}"`);
    } catch (e) {
      console.log(`     Error:`, e.message);
    }
  });
  
  console.log('\n8. Final reloaded text:', newDoc.getText('default').toString());
}

test().catch(console.error).finally(() => process.exit(0));
