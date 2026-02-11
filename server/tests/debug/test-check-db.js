const db = require('./db');

async function check() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Checking database for room:', roomId, '\n');
  
  // Check yjs_updates table
  const updatesResult = await db.query(
    'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
    [roomId]
  );
  console.log('Updates count:', updatesResult.rows[0].count);
  
  // Get latest update
  const latestResult = await db.query(
    'SELECT id, created_at FROM yjs_updates WHERE room_name = $1 ORDER BY id DESC LIMIT 1',
    [roomId]
  );
  
  if (latestResult.rows.length > 0) {
    console.log('\nLatest update:');
    console.log('  ID:', latestResult.rows[0].id);
    console.log('  Created at:', latestResult.rows[0].created_at);
  }
  
  // Load and check document content
  const Y = require('yjs');
  const persistence = require('./yjs-persistence');
  const ydoc = await persistence.getYDoc(roomId);
  
  console.log('\nDocument content:');
  console.log('  Shared types:', Array.from(ydoc.share.keys()));
  
  const defaultType = ydoc.share.get('default');
  if (defaultType) {
    console.log('  Default type:', defaultType.constructor.name);
    
    // Try to extract text
    let text = '';
    if (defaultType._start) {
      let item = defaultType._start;
      let paraCount = 0;
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
            text += paraText + '\n';
          }
        }
        item = item.right;
      }
      console.log('  Paragraphs:', paraCount);
    }
    console.log('\n  Extracted text:');
    console.log(text || '(empty)');
  }
}

check().catch(console.error).finally(() => process.exit(0));
