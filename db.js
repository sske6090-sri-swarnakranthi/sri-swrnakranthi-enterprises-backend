const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

const normalizePem = (s) => {
  if (!s) return ''
  let pem = String(s).replace(/\r/g, '').trim()
  pem = pem.replace(/\\n/g, '\n')

  if (pem.includes('BEGIN CERTIFICATE') && !pem.includes('\n')) {
    pem = pem
      .replace('-----BEGIN CERTIFICATE-----', '-----BEGIN CERTIFICATE-----\n')
      .replace('-----END CERTIFICATE-----', '\n-----END CERTIFICATE-----\n')
  }

  return pem.trim() + '\n'
}

let ca = ''

if (process.env.PG_SSL_CA_B64) {
  ca = Buffer.from(String(process.env.PG_SSL_CA_B64).trim(), 'base64').toString('utf8')
  ca = normalizePem(ca)
}

const pool = new Pool({
  connectionString: String(process.env.DATABASE_URL).trim(),
  ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool


console.log('PG_SSL_CA_B64 present:', !!process.env.PG_SSL_CA_B64)
console.log('DATABASE_URL has sslmode:', String(process.env.DATABASE_URL || '').includes('sslmode'))
