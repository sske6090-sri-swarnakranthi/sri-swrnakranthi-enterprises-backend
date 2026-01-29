const express = require('express')
const pool = require('../db')
const bcrypt = require('bcryptjs')
const admin = require('firebase-admin')
const router = express.Router()

const isValidEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || '').trim())
const isValidMobile = (v) => /^[6-9]\d{9}$/.test(String(v || '').trim())

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing')
  const serviceAccount = JSON.parse(raw)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
}

async function verifyFirebase(req, res, next) {
  try {
    const h = String(req.headers.authorization || '')
    const token = h.startsWith('Bearer ') ? h.slice(7) : ''
    if (!token) return res.status(401).json({ message: 'Missing token' })
    const decoded = await admin.auth().verifyIdToken(token)
    req.firebaseUser = decoded
    req.firebaseToken = token
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

router.get('/me', verifyFirebase, async (req, res) => {
  try {
    const email = String(req.firebaseUser?.email || '').trim().toLowerCase()
    const uid = String(req.firebaseUser?.uid || '').trim()
    if (!email || !isValidEmail(email) || !uid) return res.status(400).json({ message: 'Invalid user' })

    const q = await pool.query(
      `SELECT id, name, email, mobile, type, firebase_uid, created_at
       FROM users
       WHERE firebase_uid = $1 OR lower(email) = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [uid, email]
    )

    if (!q.rowCount) return res.status(404).json({ message: 'User not found. Please signup.' })

    return res.json({
      user: {
        id: q.rows[0].id,
        name: q.rows[0].name,
        email: q.rows[0].email,
        mobile: isValidMobile(q.rows[0].mobile) ? String(q.rows[0].mobile) : '',
        type: q.rows[0].type || 'B2C',
        firebase_uid: q.rows[0].firebase_uid,
        created_at: q.rows[0].created_at
      }
    })
  } catch (e) {
    return res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.post('/firebase-sync', verifyFirebase, async (req, res) => {
  try {
    const uid = String(req.firebaseUser?.uid || '').trim()
    const email = String(req.body?.email || req.firebaseUser?.email || '').trim().toLowerCase()
    const name = String(req.body?.name || req.firebaseUser?.name || '').trim()
    const mobile = String(req.body?.mobile || '').trim()
    const type = String(req.body?.type || 'B2C').trim().toUpperCase() === 'B2B' ? 'B2B' : 'B2C'

    if (!uid) return res.status(400).json({ message: 'Invalid user' })
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Valid email is required' })
    if (mobile && !isValidMobile(mobile)) return res.status(400).json({ message: 'Valid mobile number is required' })

    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email])

    if (existing.rowCount) {
      const upd = await pool.query(
        `UPDATE users
         SET name = COALESCE(NULLIF($1, ''), name),
             mobile = COALESCE(NULLIF($2, ''), mobile),
             type = COALESCE(NULLIF($3, ''), type),
             firebase_uid = COALESCE(NULLIF($4, ''), firebase_uid)
         WHERE lower(email) = $5
         RETURNING id, name, email, mobile, type, firebase_uid, created_at`,
        [name, mobile, type, uid, email]
      )

      return res.json({
        user: {
          id: upd.rows[0].id,
          name: upd.rows[0].name,
          email: upd.rows[0].email,
          mobile: isValidMobile(upd.rows[0].mobile) ? String(upd.rows[0].mobile) : '',
          type: upd.rows[0].type || 'B2C',
          firebase_uid: upd.rows[0].firebase_uid,
          created_at: upd.rows[0].created_at
        }
      })
    }

    const randomPwd = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    const hashed = await bcrypt.hash(randomPwd, 10)

    const inserted = await pool.query(
      `INSERT INTO users (name, email, mobile, password, type, created_at, firebase_uid)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       RETURNING id, name, email, mobile, type, firebase_uid, created_at`,
      [name || email, email, mobile || '', hashed, type, uid]
    )

    return res.status(201).json({
      user: {
        id: inserted.rows[0].id,
        name: inserted.rows[0].name,
        email: inserted.rows[0].email,
        mobile: isValidMobile(inserted.rows[0].mobile) ? String(inserted.rows[0].mobile) : '',
        type: inserted.rows[0].type || 'B2C',
        firebase_uid: inserted.rows[0].firebase_uid,
        created_at: inserted.rows[0].created_at
      }
    })
  } catch (e) {
    return res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.post('/update-mobile', verifyFirebase, async (req, res) => {
  try {
    const email = String(req.body?.email || req.firebaseUser?.email || '').trim().toLowerCase()
    const mobile = String(req.body?.mobile || '').trim()

    if (!isValidEmail(email)) return res.status(400).json({ message: 'Email is required' })
    if (!isValidMobile(mobile)) return res.status(400).json({ message: 'Invalid mobile number' })

    const upd = await pool.query(
      `UPDATE users
       SET mobile = $1
       WHERE lower(email) = $2
       RETURNING id, name, email, mobile, type, firebase_uid, created_at`,
      [mobile, email]
    )

    if (!upd.rowCount) return res.status(404).json({ message: 'User not found' })

    const u = upd.rows[0]
    return res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
        type: u.type || 'B2C',
        firebase_uid: u.firebase_uid,
        created_at: u.created_at
      }
    })
  } catch (e) {
    return res.status(500).json({ message: 'Server error', error: e.message })
  }
})

router.get('/by-email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '').trim().toLowerCase()
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Email is required' })

    const q = await pool.query(
      'SELECT id, name, email, mobile, type, firebase_uid, created_at FROM users WHERE lower(email) = $1 LIMIT 1',
      [email]
    )
    if (!q.rowCount) return res.status(404).json({ message: 'User not found' })

    const u = q.rows[0]
    return res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: isValidMobile(u.mobile) ? String(u.mobile) : '',
      type: u.type || 'B2C',
      firebase_uid: u.firebase_uid,
      created_at: u.created_at
    })
  } catch (e) {
    return res.status(500).json({ message: 'Server error', error: e.message })
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

    return res.json(rows)
  } catch (e) {
    return res.status(500).json({ message: 'Server error', error: e.message })
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

    return res.json(rows)
  } catch (e) {
    return res.status(500).json({ message: 'Server error', error: e.message })
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
      `INSERT INTO users (name, email, mobile, password, type, created_at, firebase_uid)
       VALUES ($1, $2, $3, $4, 'B2B', NOW(), NULL)
       RETURNING id, name, email, mobile, type, created_at`,
      [name, email, mobile, hashed]
    )

    const u = inserted.rows[0]
    return res.status(201).json({
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
    return res.status(500).json({ message: 'Server error', error: e.message })
  }
})

module.exports = router
