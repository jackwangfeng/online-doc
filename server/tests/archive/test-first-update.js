const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Analyzing first update...\n');
  
  // Get first update
  const result = await db.query(
    'SELECT id, update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC LIMIT 1',
    [roomId]
  );
  
  if (result.rows.length === 0) {
    console.log('No updates found');
    return;
  }
  
  const updateData = new Uint8Array(result.rows[0].update_data);
  console.log('First update length:', updateData.length, 'bytes');
  console.log('First update (hex):', Buffer.from(updateData).toString('hex'));
  console.log('');
  
  // Apply to a fresh document
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, updateData);
  
  console.log('After first update:');
  console.log('- Shared types:', Array.from(ydoc.share.keys()));
  
  const defaultType = ydoc.share.get('default');
  console.log('- Type:', defaultType.constructor.name);
  
  // Check the structure
  if (defaultType._start) {
    console.log('\nStructure:');
    let item = defaultType._start;
    while (item) {
      console.log('Item:', item.constructor.name);
      if (item.content) {
        console.log('  Content:', item.content.constructor.name);
        if (item.content.type) {
          console.log('  Type:', item.content.type.constructor.name);
          console.log('  NodeName:', item.content.type.nodeName);
          
          // Check children
          if (item.content.type._start) {
            let child = item.content.type._start;
            console.log('  Children:');
            while (child) {
              console.log('    -', child.constructor.name, child.content ? child.content.constructor.name : 'no content');
              if (child.content) {
                console.log('      str:', child.content.str);
                console.log('      arr:', child.content.arr);
              }
              child = child.right;
            }
          }
        }
      }
      item = item.right;
    }
  }
}

test().catch(console.error).finally(() => process.exit(0));
