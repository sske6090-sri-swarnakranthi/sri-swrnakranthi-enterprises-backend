const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool
