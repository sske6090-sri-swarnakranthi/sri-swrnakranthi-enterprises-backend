const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing')
}

let ca = ''

if (process.env.PG_SSL_CA_B64) {
  ca = Buffer.from(process.env.PG_SSL_CA_B64, 'base64').toString('utf8')
} else if (process.env.PG_SSL_CA) {
  ca = process.env.PG_SSL_CA
}

const ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool
