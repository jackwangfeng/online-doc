const Y = require('yjs');
const db = require('./db');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';

  console.log('Checking document content...\n');

  // Get all updates
  const result = await db.query(
    'SELECT id, update_data FROM yjs_updates WHERE room_name = $1 ORDER BY id ASC',
    [roomId]
  );

  console.log('Total updates:', result.rows.length);

  // Apply all updates
  const ydoc = new Y.Doc();

  for (const row of result.rows) {
    const updateData = new Uint8Array(row.update_data);
    Y.applyUpdate(ydoc, updateData);
  }

  console.log('\nDocument shared types:', Array.from(ydoc.share.keys()));

  const defaultType = ydoc.share.get('default');
  console.log('Default type:', defaultType.constructor.name);

  // Check if it's an XmlFragment
  if (defaultType._start) {
    console.log('\nDocument structure:');
    let item = defaultType._start;
    let count = 0;
    while (item && count < 15) {
      count++;
      if (item.content && item.content.type) {
        const type = item.content.type;
        console.log(`\n[${count}] ${type.nodeName || 'unknown'}:`);
        console.log('  Type:', type.constructor.name);

        // Check children
        if (type._start) {
          let child = type._start;
          let childCount = 0;
          while (child && childCount < 5) {
            childCount++;
            console.log(`  Child ${childCount}:`, child.constructor.name);
            if (child.content) {
              console.log('    Content type:', child.content.constructor.name);
              if (child.content.str !== undefined) {
                console.log('    str:', JSON.stringify(child.content.str));
              }
              if (child.content.arr !== undefined) {
                console.log('    arr:', child.content.arr.map(x => typeof x === 'string' ? JSON.stringify(x) : `[${typeof x}]`).join(', '));
              }
            }
            child = child.right;
          }
        } else {
          console.log('  No children (_start is null)');
        }
      }
      item = item.right;
    }
  }

  // Try to get as XmlFragment and convert to string
  console.log('\n\n--- Trying toString ---');
  try {
    console.log(defaultType.toString());
  } catch (e) {
    console.log('Error:', e.message);
  }
}

test().catch(console.error).finally(() => process.exit(0));
