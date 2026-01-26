const express = require('express')
const pool = require('../db')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const router = express.Router()

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

const isValidEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || '').trim())

router.post('/forgot/start', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Enter a valid email' })

  try {
    const u = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email])
    if (!u.rowCount) return res.status(404).json({ message: 'You are a new user. Please register' })

    const userId = u.rows[0].id
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId])
    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at, used_at, created_at) VALUES ($1, $2, $3, NULL, NOW())',
      [userId, otp, expiresAt]
    )

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(500).json({ message: 'Email service not configured' })
    }

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

  if (!isValidEmail(email) || !otp) return res.status(400).json({ message: 'Email and OTP are required' })

  try {
    const u = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email])
    if (!u.rowCount) return res.status(400).json({ message: 'Invalid or expired OTP' })

    const userId = u.rows[0].id
    const q = await pool.query(
      `SELECT id, token, expires_at, used_at
       FROM password_resets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    )

    if (!q.rowCount) return res.status(400).json({ message: 'Invalid or expired OTP' })

    const row = q.rows[0]
    if (row.used_at) return res.status(400).json({ message: 'Invalid or expired OTP' })
    if (String(row.token || '') !== otp) return res.status(400).json({ message: 'Invalid OTP' })
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ message: 'OTP expired' })

    res.json({ message: 'OTP verified' })
  } catch {
    res.status(500).json({ message: 'Verification failed' })
  }
})

router.post('/forgot/reset', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const otp = String(req.body?.otp || '').trim()
  const newPassword = String(req.body?.newPassword || '')

  if (!isValidEmail(email) || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, OTP, and new password are required' })
  }
  if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })

  try {
    const u = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email])
    if (!u.rowCount) return res.status(400).json({ message: 'Invalid or expired OTP' })

    const userId = u.rows[0].id
    const q = await pool.query(
      `SELECT id, token, expires_at, used_at
       FROM password_resets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    )

    if (!q.rowCount) return res.status(400).json({ message: 'Invalid or expired OTP' })

    const row = q.rows[0]
    if (row.used_at) return res.status(400).json({ message: 'Invalid or expired OTP' })
    if (String(row.token || '') !== otp) return res.status(400).json({ message: 'Invalid OTP' })
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ message: 'OTP expired' })

    const hashed = await bcrypt.hash(newPassword, 10)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId])
      await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [row.id])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      return res.status(500).json({ message: 'Password reset failed' })
    } finally {
      client.release()
    }

    res.json({ message: 'Password updated successfully' })
  } catch {
    res.status(500).json({ message: 'Password reset failed' })
  }
})

module.exports = router
