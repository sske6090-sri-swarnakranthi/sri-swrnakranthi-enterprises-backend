const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing')
}

let ssl = { rejectUnauthorized: false }

if (process.env.PG_SSL_CA) {
  ssl = { ca: process.env.PG_SSL_CA }
} else if (process.env.PG_SSL_CA_B64) {
  ssl = { ca: Buffer.from(process.env.PG_SSL_CA_B64, 'base64').toString('utf8') }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool
