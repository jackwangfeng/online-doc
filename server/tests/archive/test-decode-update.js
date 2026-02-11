const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Decoding first update from database...\n');
  
  // Get first update
  const result = await db.query(
    'SELECT update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC LIMIT 1',
    [roomId]
  );
  
  if (result.rows.length === 0) {
    console.log('No updates found');
    return;
  }
  
  const updateData = new Uint8Array(result.rows[0].update_data);
  console.log('Update data length:', updateData.length, 'bytes');
  console.log('Update data (hex):', Buffer.from(updateData).toString('hex'));
  
  // Create a new doc and apply the first update
  const ydoc = new Y.Doc();
  
  try {
    Y.applyUpdate(ydoc, updateData);
    console.log('\nAfter applying first update:');
    console.log('- Shared types:', Array.from(ydoc.share.keys()));
    
    ydoc.share.forEach((value, key) => {
      console.log(`\nShared type "${key}": ${value.constructor.name}`);
    });
  } catch (err) {
    console.error('Error applying update:', err);
  }
  
  // Now apply all updates one by one
  console.log('\n\n--- Applying all updates ---');
  const allUpdates = await db.query(
    'SELECT id, update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC',
    [roomId]
  );
  
  console.log('Total updates:', allUpdates.rows.length);
  
  const fullDoc = new Y.Doc();
  
  for (let i = 0; i < allUpdates.rows.length; i++) {
    const row = allUpdates.rows[i];
    const update = new Uint8Array(row.update_data);
    
    try {
      Y.applyUpdate(fullDoc, update);
      console.log(`Update ${row.id} (${update.length} bytes): OK`);
    } catch (err) {
      console.error(`Update ${row.id} (${update.length} bytes): ERROR -`, err.message);
    }
  }
  
  console.log('\nFinal document:');
  console.log('- Shared types:', Array.from(fullDoc.share.keys()));
  
  fullDoc.share.forEach((value, key) => {
    console.log(`\nShared type "${key}": ${value.constructor.name}`);
    if (value.toString) {
      const str = value.toString();
      console.log('  Content preview:', str.slice(0, 300));
    }
  });
}

test().catch(console.error).finally(() => process.exit(0));
