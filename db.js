const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

const stripSslMode = (url) => {
  try {
    const u = new URL(url)
    u.searchParams.delete('sslmode')
    u.searchParams.delete('ssl')
    return u.toString()
  } catch {
    return String(url).split('?')[0]
  }
}

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
} else if (process.env.PG_SSL_CA) {
  ca = normalizePem(process.env.PG_SSL_CA)
}

const pool = new Pool({
  connectionString: stripSslMode(process.env.DATABASE_URL),
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

module.exports = pool
