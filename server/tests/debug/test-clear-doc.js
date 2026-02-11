const db = require('./db');

async function clear() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Clearing document:', roomId);
  
  // Delete all updates for this room
  const result = await db.query(
    'DELETE FROM yjs_updates WHERE room_name = $1',
    [roomId]
  );
  
  console.log('Deleted', result.rowCount, 'updates');
  
  // Clear cache
  const persistence = require('./yjs-persistence');
  persistence.clearDocumentCache(roomId);
  
  console.log('Document cleared');
}

clear().catch(console.error).finally(() => process.exit(0));
