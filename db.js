const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing')
}

const normalizePem = (v) => {
  if (!v) return ''
  let s = String(v).trim()

  s = s.replace(/\\n/g, '\n')

  if (s.includes('BEGIN CERTIFICATE') && !s.includes('\n')) {
    s = s
      .replace('-----BEGIN CERTIFICATE-----', '-----BEGIN CERTIFICATE-----\n')
      .replace('-----END CERTIFICATE-----', '\n-----END CERTIFICATE-----\n')
  }

  return s.trim() + '\n'
}

let ca = ''

if (process.env.PG_SSL_CA_B64) {
  const decoded = Buffer.from(String(process.env.PG_SSL_CA_B64).trim(), 'base64').toString('utf8')
  ca = normalizePem(decoded)
} else if (process.env.PG_SSL_CA) {
  ca = normalizePem(process.env.PG_SSL_CA)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool
