const db = require('./db')

async function migrate() {
  try {
    // 添加 avatar 字段
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(500)')
    console.log('Migration completed: added avatar column to users table')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

migrate()
