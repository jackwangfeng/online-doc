const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Analyzing all updates for text content...\n');
  
  // Get all updates
  const result = await db.query(
    'SELECT id, update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC',
    [roomId]
  );
  
  console.log('Total updates:', result.rows.length);
  
  let textUpdateCount = 0;
  
  for (const row of result.rows) {
    const updateData = new Uint8Array(row.update_data);
    
    // Decode the update to see if it contains text
    const update = Y.decodeUpdate(updateData);
    
    // Check if any of the structs contain text
    let hasText = false;
    
    // structs is a Map
    update.structs.forEach((structs, clientId) => {
      if (hasText) return;
      for (const struct of structs) {
        if (struct.content && struct.content.arr) {
          for (const item of struct.content.arr) {
            if (typeof item === 'string' && item.length > 0) {
              hasText = true;
              textUpdateCount++;
              console.log(`Update ${row.id}: Contains text "${item.slice(0, 50)}"`);
              break;
            }
          }
        }
        if (hasText) break;
      }
    });
  }
  
  console.log('\nTotal updates with text:', textUpdateCount);
  
  // Now let's apply all updates and see the final content
  console.log('\n--- Final document content ---');
  const ydoc = new Y.Doc();
  
  for (const row of result.rows) {
    const updateData = new Uint8Array(row.update_data);
    Y.applyUpdate(ydoc, updateData);
  }
  
  const defaultType = ydoc.share.get('default');
  
  // Try to extract text from all paragraphs
  if (defaultType._start) {
    let item = defaultType._start;
    let paraCount = 0;
    while (item) {
      paraCount++;
      if (item.content && item.content.type) {
        const type = item.content.type;
        console.log(`\nParagraph ${paraCount} (${type.nodeName}):`);
        
        // Extract all text from this paragraph
        let text = '';
        if (type._start) {
          let child = type._start;
          while (child) {
            if (child.content) {
              if (child.content.str) {
                text += child.content.str;
              } else if (child.content.arr) {
                for (const x of child.content.arr) {
                  if (typeof x === 'string') {
                    text += x;
                  }
                }
              }
            }
            child = child.right;
          }
        }
        console.log('  Text:', text || '(empty)');
      }
      item = item.right;
    }
  }
}

test().catch(console.error).finally(() => process.exit(0));
