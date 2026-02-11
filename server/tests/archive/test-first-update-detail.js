const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Analyzing first update in detail...\n');
  
  // Get first update
  const result = await db.query(
    'SELECT id, update_data, created_at FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC LIMIT 1',
    [roomId]
  );
  
  if (result.rows.length === 0) {
    console.log('No updates found');
    return;
  }
  
  const row = result.rows[0];
  const updateData = new Uint8Array(row.update_data);
  
  console.log('First update:');
  console.log('  ID:', row.id);
  console.log('  Created at:', row.created_at);
  console.log('  Size:', updateData.length, 'bytes');
  console.log('  Hex:', Buffer.from(updateData).toString('hex'));
  
  // Decode the update
  const update = Y.decodeUpdate(updateData);
  console.log('\n  Decoded update:');
  console.log('  - Structs count:', update.structs.size);
  
  update.structs.forEach((structs, clientId) => {
    console.log(`\n  Client ${clientId}:`);
    structs.forEach((struct, i) => {
      console.log(`    Struct ${i}:`, struct.constructor.name);
      console.log(`      - id:`, struct.id);
      console.log(`      - length:`, struct.length);
      if (struct.content) {
        console.log(`      - content type:`, struct.content.constructor.name);
        if (struct.content.type) {
          console.log(`      - content.type:`, struct.content.type.constructor.name);
          if (struct.content.type.nodeName) {
            console.log(`      - nodeName:`, struct.content.type.nodeName);
          }
        }
      }
    });
  });
  
  // Apply to a fresh document
  console.log('\n\n--- Applying to fresh document ---');
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, updateData);
  
  console.log('Shared types:', Array.from(ydoc.share.keys()));
  
  const defaultType = ydoc.share.get('default');
  if (defaultType && defaultType._start) {
    let item = defaultType._start;
    while (item) {
      if (item.content && item.content.type) {
        const type = item.content.type;
        console.log('\nElement:', type.nodeName);
        console.log('  Type:', type.constructor.name);
        
        if (type._start) {
          let child = type._start;
          while (child) {
            console.log('  Child:', child.constructor.name);
            if (child.content) {
              console.log('    Content:', child.content.constructor.name);
            }
            child = child.right;
          }
        }
      }
      item = item.right;
    }
  }
}

test().catch(console.error).finally(() => process.exit(0));
