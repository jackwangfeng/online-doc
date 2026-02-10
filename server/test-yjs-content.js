const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Analyzing Yjs document content...\n');
  
  // Get all updates
  const result = await db.query(
    'SELECT id, update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC',
    [roomId]
  );
  
  // Create doc and apply all updates
  const ydoc = new Y.Doc();
  
  for (const row of result.rows) {
    const update = new Uint8Array(row.update_data);
    Y.applyUpdate(ydoc, update);
  }
  
  const defaultType = ydoc.share.get('default');
  
  if (defaultType && defaultType._start) {
    console.log('Document items:');
    let item = defaultType._start;
    let count = 0;
    while (item && count < 20) {
      count++;
      console.log(`\nItem ${count}:`);
      console.log('  Type:', item.constructor.name);
      console.log('  Content type:', item.content ? item.content.constructor.name : 'none');
      
      if (item.content) {
        console.log('  Content:', item.content);
        if (item.content.arr) {
          console.log('  Array:', item.content.arr);
          item.content.arr.forEach((val, idx) => {
            console.log(`    [${idx}]:`, typeof val, JSON.stringify(val).slice(0, 100));
          });
        }
      }
      
      item = item.next;
    }
  }
  
  // Also try to get the type using Yjs API
  console.log('\n\n--- Using Yjs API ---');
  try {
    const text = ydoc.getText('default');
    console.log('As Text - length:', text.length);
    console.log('As Text - content:', text.toString());
  } catch (e) {
    console.log('Not a Text type:', e.message);
  }
  
  try {
    const xml = ydoc.getXmlFragment('default');
    console.log('As XmlFragment - toString:', xml.toString().slice(0, 500));
  } catch (e) {
    console.log('Not an XmlFragment type:', e.message);
  }
  
  try {
    const map = ydoc.getMap('default');
    console.log('As Map - keys:', Array.from(map.keys()));
  } catch (e) {
    console.log('Not a Map type:', e.message);
  }
}

test().catch(console.error).finally(() => process.exit(0));
