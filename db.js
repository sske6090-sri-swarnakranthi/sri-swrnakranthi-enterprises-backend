const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing')
}

const isVercel = !!process.env.VERCEL

const pool = new Pool({
  connectionString: String(process.env.DATABASE_URL).trim(),
  ssl: isVercel ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool
