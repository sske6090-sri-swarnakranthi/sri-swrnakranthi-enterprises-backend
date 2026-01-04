const express = require('express')
const pool = require('../db')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const jwt = require('jsonwebtoken')
const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })

  try {
    const result = await pool.query('SELECT id, name, email, password, type FROM userstaras WHERE lower(email) = $1 LIMIT 1', [email])
    if (!result.rowCount) return res.status(401).json({ message: 'Invalid credentials' })

    const user = result.rows[0]
    const match = await bcrypt.compare(password, user.password || '')
    if (!match) return res.status(401).json({ message: 'Invalid credentials' })

    const payload = { id: user.id, email: user.email, type: user.type || 'B2C' }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        type: user.type || 'B2C'
      }
    })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.post('/firebase-login', async (req, res) => {
  const uid = String(req.body?.uid || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const name = String(req.body?.name || '').trim()

  if (!uid || !email) return res.status(400).json({ message: 'uid and email are required' })

  const displayName = name || email.split('@')[0] || 'User'

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const existing = await client.query(
        'SELECT id, name, email, mobile, type FROM userstaras WHERE lower(email) = $1 LIMIT 1',
        [email]
      )

      let user
      if (existing.rowCount) {
        user = existing.rows[0]
      } else {
        const inserted = await client.query(
          'INSERT INTO userstaras (name, email, mobile, password, type, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, name, email, mobile, type',
          [displayName, email, '', '', 'B2C']
        )
        user = inserted.rows[0]
      }

      await client.query('COMMIT')

      const payload = { id: user.id, email: user.email, type: user.type || 'B2C' }
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          type: user.type || 'B2C'
        }
      })
    } catch (e) {
      await client.query('ROLLBACK')
      res.status(500).json({ message: 'Server error' })
    } finally {
      client.release()
    }
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/forgot/start', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ message: 'Email is required' })

  try {
    const result = await pool.query('SELECT id FROM userstaras WHERE lower(email) = $1 LIMIT 1', [email])
    if (!result.rowCount) return res.status(404).json({ message: 'You are a new user. Please register' })

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await pool.query('UPDATE userstaras SET otp = $1, otp_expiry = $2 WHERE lower(email) = $3', [otp, expiresAt, email])

    await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: 'Your OTP',
      text: `Your OTP is ${otp}. It is valid for 10 minutes.`,
      html: `<div style="font-family:Arial,sans-serif;font-size:16px;color:#111">
        <p>Your OTP is <strong>${otp}</strong></p>
        <p>This code is valid for 10 minutes.</p>
      </div>`
    })

    res.json({ message: 'OTP sent' })
  } catch (e) {
    res.status(500).json({ message: 'Could not start reset' })
  }
})

router.post('/forgot/verify', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const otp = String(req.body?.otp || '').trim()

  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' })

  try {
    const result = await pool.query('SELECT otp, otp_expiry FROM userstaras WHERE lower(email) = $1 LIMIT 1', [email])
    if (!result.rowCount) return res.status(400).json({ message: 'Invalid or expired OTP' })

    const user = result.rows[0]
    if (String(user.otp || '') !== otp) return res.status(400).json({ message: 'Invalid OTP' })
    if (new Date(user.otp_expiry).getTime() < Date.now()) return res.status(400).json({ message: 'OTP expired' })

    res.json({ message: 'OTP verified' })
  } catch (e) {
    res.status(500).json({ message: 'Verification failed' })
  }
})

router.post('/forgot/reset', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const otp = String(req.body?.otp || '').trim()
  const newPassword = String(req.body?.newPassword || '')

  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Email, OTP, and new password are required' })

  try {
    const result = await pool.query('SELECT otp, otp_expiry FROM userstaras WHERE lower(email) = $1 LIMIT 1', [email])
    if (!result.rowCount) return res.status(400).json({ message: 'Invalid or expired OTP' })

    const user = result.rows[0]
    if (String(user.otp || '') !== otp) return res.status(400).json({ message: 'Invalid OTP' })
    if (new Date(user.otp_expiry).getTime() < Date.now()) return res.status(400).json({ message: 'OTP expired' })

    const hashed = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE userstaras SET password = $1, otp = NULL, otp_expiry = NULL WHERE lower(email) = $2', [hashed, email])

    res.json({ message: 'Password updated successfully' })
  } catch (e) {
    res.status(500).json({ message: 'Password reset failed' })
  }
})

module.exports = router
