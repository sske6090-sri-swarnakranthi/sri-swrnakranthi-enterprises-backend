const express = require('express')
const pool = require('../db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

const isValidEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || '').trim())
const isValidMobile = (v) => /^[6-9]\d{9}$/.test(String(v || '').trim())

const getBearer = (req) => {
  const h = String(req.headers?.authorization || '')
  if (!h.toLowerCase().startsWith('bearer ')) return ''
  return h.slice(7).trim()
}

const decodeJwt = (token) => {
  try {
    return jwt.decode(token) || {}
  } catch {
    return {}
  }
}

router.get('/me', async (req, res) => {
  try {
    const token = getBearer(req)
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    const payload = decodeJwt(token)
    const email = String(payload?.email || '').trim().toLowerCase()
    if (!isValidEmail(email)) return res.status(401).json({ message: 'Unauthorized' })

    const q = await pool.query('SELECT id, name, email, mobile, type FROM users WHERE lower(email) = $1 LIMIT 1', [email])
    if (!q.rowCount) return res.status(404).json({ message: 'User not found' })

    const u = q.rows[0]
    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
        type: u.type || 'B2C'
      }
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.post('/firebase-sync', async (req, res) => {
  try {
    const token = getBearer(req)
    const payload = token ? decodeJwt(token) : {}

    const bodyEmail = String(req.body?.email || '').trim().toLowerCase()
    const tokenEmail = String(payload?.email || '').trim().toLowerCase()
    const email = bodyEmail || tokenEmail

    const nameFromToken = String(payload?.name || payload?.displayName || '').trim()
    const nameFromBody = String(req.body?.name || '').trim()
    const name = nameFromBody || nameFromToken || (email ? email.split('@')[0] : '')

    const mobile = String(req.body?.mobile || '').trim()
    const type = String(req.body?.type || 'B2C').trim() || 'B2C'

    if (!isValidEmail(email)) return res.status(400).json({ message: 'Valid email is required' })

    const existing = await pool.query('SELECT id, name, email, mobile, type FROM users WHERE lower(email) = $1 LIMIT 1', [email])

    if (existing.rowCount) {
      const upd = await pool.query(
        'UPDATE users SET name = $1, mobile = $2, type = $3 WHERE lower(email) = $4 RETURNING id, name, email, mobile, type',
        [name || existing.rows[0].name, mobile || existing.rows[0].mobile, type || existing.rows[0].type, email]
      )
      const u = upd.rows[0]
      return res.json({
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
          type: u.type || 'B2C'
        }
      })
    }

    const randomPwd = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const hashed = await bcrypt.hash(randomPwd, 10)

    const inserted = await pool.query(
      `INSERT INTO users (name, email, mobile, password, type, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, name, email, mobile, type, created_at`,
      [name || email.split('@')[0], email, mobile, hashed, type || 'B2C']
    )

    const u = inserted.rows[0]
    res.status(201).json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
        type: u.type || 'B2C'
      }
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const mobile = String(req.body?.mobile || '').trim()
    const password = String(req.body?.password || '')

    if (!name) return res.status(400).json({ message: 'Name is required' })
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Valid email is required' })
    if (!isValidMobile(mobile)) return res.status(400).json({ message: 'Valid mobile number is required' })
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email])
    if (existing.rowCount) return res.status(409).json({ message: 'Email already exists' })

    const hashed = await bcrypt.hash(password, 10)

    const inserted = await pool.query(
      `INSERT INTO users (name, email, mobile, password, type, created_at)
       VALUES ($1, $2, $3, $4, 'B2C', NOW())
       RETURNING id, name, email, mobile, type, created_at`,
      [name, email, mobile, hashed]
    )

    const user = inserted.rows[0]
    const token = jwt.sign({ id: user.id, email: user.email, type: user.type }, JWT_SECRET, { expiresIn: '7d' })

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        type: user.type
      }
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')

    if (!isValidEmail(email)) return res.status(400).json({ message: 'Valid email is required' })
    if (!password) return res.status(400).json({ message: 'Password is required' })

    const q = await pool.query(
      'SELECT id, name, email, mobile, password, type FROM users WHERE lower(email) = $1 LIMIT 1',
      [email]
    )

    if (!q.rowCount) return res.status(401).json({ message: 'Invalid credentials' })

    const u = q.rows[0]
    const ok = await bcrypt.compare(password, u.password || '')
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    const token = jwt.sign({ id: u.id, email: u.email, type: u.type || 'B2C' }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        type: u.type || 'B2C'
      }
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.get('/by-email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '').trim().toLowerCase()
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Email is required' })

    const q = await pool.query('SELECT id, name, email, mobile, type FROM users WHERE lower(email) = $1 LIMIT 1', [email])
    if (!q.rowCount) return res.status(404).json({ message: 'User not found' })

    const u = q.rows[0]
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
      type: u.type || 'B2C'
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.post('/update-mobile', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const mobile = String(req.body?.mobile || '').trim()

    if (!isValidEmail(email)) return res.status(400).json({ message: 'Email is required' })
    if (!isValidMobile(mobile)) return res.status(400).json({ message: 'Invalid mobile number' })

    const upd = await pool.query(
      'UPDATE users SET mobile = $1 WHERE lower(email) = $2 RETURNING id, name, email, mobile, type, created_at',
      [mobile, email]
    )

    if (!upd.rowCount) return res.status(404).json({ message: 'User not found' })

    const u = upd.rows[0]
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
      type: u.type || 'B2C',
      created_at: u.created_at
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.get('/b2c-customers', async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT id, name, email, mobile, type, created_at
       FROM users
       WHERE type = 'B2C'
       ORDER BY created_at DESC`
    )

    const rows = q.rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
      type: u.type || 'B2C',
      created_at: u.created_at
    }))

    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.get('/b2b-customers', async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT id, name, email, mobile, type, created_at
       FROM users
       WHERE type = 'B2B'
       ORDER BY created_at DESC`
    )

    const rows = q.rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
      type: u.type || 'B2B',
      created_at: u.created_at
    }))

    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.post('/b2b-customers', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const mobile = String(req.body?.mobile || '').trim()
    const password = String(req.body?.password || '')

    if (!name) return res.status(400).json({ message: 'Name is required' })
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Valid email is required' })
    if (!isValidMobile(mobile)) return res.status(400).json({ message: 'Valid mobile number is required' })
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email])
    if (existing.rowCount) return res.status(409).json({ message: 'Email already exists' })

    const hashed = await bcrypt.hash(password, 10)

    const inserted = await pool.query(
      `INSERT INTO users (name, email, mobile, password, type, created_at)
       VALUES ($1, $2, $3, $4, 'B2B', NOW())
       RETURNING id, name, email, mobile, type, created_at`,
      [name, email, mobile, hashed]
    )

    const u = inserted.rows[0]

    res.status(201).json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
        type: u.type || 'B2B',
        created_at: u.created_at
      }
    })
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message })
  }
})

module.exports = router
