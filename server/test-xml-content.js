const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Testing XmlFragment content...\n');
  
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
  
  // Get the default type directly from share
  const defaultType = ydoc.share.get('default');
  console.log('Default type constructor:', defaultType.constructor.name);
  console.log('Is Y.XmlFragment?', defaultType instanceof Y.XmlFragment);
  console.log('Is Y.XmlElement?', defaultType instanceof Y.XmlElement);
  console.log('Is Y.AbstractType?', defaultType instanceof Y.AbstractType);
  
  // Try to iterate over children
  if (defaultType._start) {
    console.log('\nDocument structure:');
    let item = defaultType._start;
    let count = 0;
    while (item && count < 15) {
      count++;
      if (item.content && item.content.type) {
        const type = item.content.type;
        console.log(`\n[${count}] ${type.nodeName || 'unknown'}:`);
        
        // Try to get text content from this element
        if (type._start) {
          let child = type._start;
          while (child) {
            if (child.content) {
              if (child.content.str) {
                console.log('  Text:', child.content.str);
              } else if (child.content.arr) {
                console.log('  Array:', child.content.arr.map(x => typeof x === 'string' ? x : `[${typeof x}]`).join(''));
              }
            }
            child = child.right;
          }
        }
      }
      item = item.right;
    }
  }
  
  // Try using toString on the fragment
  console.log('\n\n--- toString() output ---');
  try {
    console.log(defaultType.toString());
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  // Try to manually build HTML-like structure
  console.log('\n\n--- Manual structure ---');
  let html = '';
  if (defaultType._start) {
    let item = defaultType._start;
    while (item) {
      if (item.content && item.content.type) {
        const type = item.content.type;
        html += `<${type.nodeName || 'div'}>`;
        
        if (type._start) {
          let child = type._start;
          while (child) {
            if (child.content && child.content.str) {
              html += child.content.str;
            }
            child = child.right;
          }
        }
        
        html += `</${type.nodeName || 'div'}>\n`;
      }
      item = item.right;
    }
  }
  console.log(html);
}

test().catch(console.error).finally(() => process.exit(0));
