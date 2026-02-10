const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Analyzing Yjs document structure...\n');
  
  // Get all updates
  const result = await db.query(
    'SELECT id, update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC',
    [roomId]
  );
  
  console.log('Total updates:', result.rows.length);
  
  // Create doc and apply all updates
  const ydoc = new Y.Doc();
  
  for (const row of result.rows) {
    const update = new Uint8Array(row.update_data);
    Y.applyUpdate(ydoc, update);
  }
  
  console.log('\nDocument shared types:', Array.from(ydoc.share.keys()));
  
  // Try to understand the structure
  const defaultType = ydoc.share.get('default');
  if (defaultType) {
    console.log('\nDefault type:', defaultType.constructor.name);
    
    // Check if it's an XML fragment (TipTap/ProseMirror uses this)
    if (defaultType instanceof Y.XmlFragment) {
      console.log('Is XmlFragment: true');
      console.log('Content:', defaultType.toString());
    } else if (defaultType instanceof Y.XmlElement) {
      console.log('Is XmlElement: true');
      console.log('Content:', defaultType.toString());
    } else if (defaultType instanceof Y.Text) {
      console.log('Is Text: true');
      console.log('Content:', defaultType.toString());
    } else {
      console.log('Is AbstractType or other');
      
      // Try to get the content in different ways
      console.log('\nTrying to access content...');
      
      // Check if it has _start
      if (defaultType._start) {
        console.log('Has _start property');
        let item = defaultType._start;
        while (item) {
          console.log('Item:', item.constructor.name, item.content ? item.content.constructor.name : 'no content');
          if (item.content && item.content.arr) {
            console.log('  Content array:', item.content.arr);
          }
          item = item.next;
        }
      }
      
      // Check if it's a map
      if (defaultType instanceof Y.Map) {
        console.log('Keys:', Array.from(defaultType.keys()));
      }
    }
  }
  
  // Try to decode as ProseMirror document
  console.log('\n\n--- Trying to decode as ProseMirror ---');
  try {
    // ProseMirror uses a specific structure
    // Let's check if there's a 'prosemirror' key
    if (ydoc.share.has('prosemirror')) {
      const pm = ydoc.getXmlFragment('prosemirror');
      console.log('ProseMirror fragment found!');
      console.log('Content:', pm.toString());
    } else {
      console.log('No prosemirror key found');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test().catch(console.error).finally(() => process.exit(0));
