const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'quant_user',
  password: process.env.DB_PASSWORD || 'dahuangfeng.96',
  database: process.env.DB_NAME || 'doc_online_db',
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
  process.exit(-1)
})

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
}
