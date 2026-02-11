const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Analyzing document creation...\n');
  
  // Get first 5 updates
  const result = await db.query(
    'SELECT id, update_data, created_at FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC LIMIT 5',
    [roomId]
  );
  
  console.log('First 5 updates:\n');
  
  for (const row of result.rows) {
    const updateData = new Uint8Array(row.update_data);
    console.log(`Update ${row.id} (${updateData.length} bytes) at ${row.created_at}:`);
    console.log('  Hex:', Buffer.from(updateData).toString('hex'));
    
    // Apply to fresh doc
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, updateData);
    
    console.log('  Shared types:', Array.from(ydoc.share.keys()));
    
    const defaultType = ydoc.share.get('default');
    if (defaultType && defaultType._start) {
      let item = defaultType._start;
      let count = 0;
      while (item && count < 3) {
        count++;
        if (item.content && item.content.type) {
          const type = item.content.type;
          console.log(`  [${count}] ${type.nodeName || 'unknown'}`);
          
          // Check for text content
          if (type._start) {
            let child = type._start;
            while (child) {
              if (child.content) {
                if (child.content.str) {
                  console.log(`      Text: "${child.content.str}"`);
                }
              }
              child = child.right;
            }
          }
        }
        item = item.right;
      }
    }
    console.log('');
  }
  
  // Now check the full document after all updates
  console.log('\n--- Full document after all updates ---');
  const allResult = await db.query(
    'SELECT update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC',
    [roomId]
  );
  
  const fullDoc = new Y.Doc();
  for (const row of allResult.rows) {
    const updateData = new Uint8Array(row.update_data);
    Y.applyUpdate(fullDoc, updateData);
  }
  
  console.log('Total updates applied:', allResult.rows.length);
  console.log('Shared types:', Array.from(fullDoc.share.keys()));
  
  const defaultType = fullDoc.share.get('default');
  if (defaultType && defaultType._start) {
    let item = defaultType._start;
    let paraCount = 0;
    let totalText = '';
    
    while (item) {
      paraCount++;
      if (item.content && item.content.type) {
        const type = item.content.type;
        let paraText = '';
        
        if (type._start) {
          let child = type._start;
          while (child) {
            if (child.content && child.content.str) {
              paraText += child.content.str;
            }
            child = child.right;
          }
        }
        
        if (paraText) {
          totalText += paraText + '\n';
        }
      }
      item = item.right;
    }
    
    console.log('\nParagraphs:', paraCount);
    console.log('\nExtracted text:');
    console.log(totalText || '(empty)');
  }
}

test().catch(console.error).finally(() => process.exit(0));
