const db = require('./db');

async function check() {
  const roomId = process.argv[2] || 'test';
  
  console.log('Checking database for room:', roomId, '\n');
  
  // Check yjs_updates table
  const result = await db.query(
    'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
    [roomId]
  );
  console.log('Updates count:', result.rows[0].count);
  
  // Get latest update
  const latest = await db.query(
    'SELECT id, created_at FROM yjs_updates WHERE room_name = $1 ORDER BY id DESC LIMIT 1',
    [roomId]
  );
  
  if (latest.rows.length > 0) {
    console.log('Latest update ID:', latest.rows[0].id);
    console.log('Latest update time:', latest.rows[0].created_at);
  } else {
    console.log('No updates found');
  }
}

check().catch(console.error).finally(() => process.exit(0));
