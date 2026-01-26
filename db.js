const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing')
}

let ssl = { rejectUnauthorized: false }

if (process.env.PG_SSL_CA_B64) {
  const ca = Buffer.from(String(process.env.PG_SSL_CA_B64).trim(), 'base64').toString('utf8')
  ssl = { rejectUnauthorized: true, ca }
}

const pool = new Pool({
  connectionString: String(process.env.DATABASE_URL).trim(),
  ssl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool
