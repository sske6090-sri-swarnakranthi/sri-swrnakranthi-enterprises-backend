const express = require('express')
const pool = require('../db')
const router = express.Router()

const toInt = (v) => {
  const n = Number(v)
  return Number.isInteger(n) ? n : parseInt(String(v ?? '').trim(), 10)
}

const normalizeImages = (images) => {
  if (!images) return []
  if (Array.isArray(images)) return images.filter(Boolean).map(String)
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images)
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String)
    } catch {}
    return images.trim() ? [images.trim()] : []
  }
  return []
}

router.post('/', async (req, res) => {
  const uid = toInt(req.body?.user_id)
  const pid = toInt(req.body?.product_id)

  if (!uid || !pid) return res.status(400).json({ message: 'Invalid user_id or product_id' })

  try {
    const userOk = await pool.query('SELECT 1 FROM users WHERE id = $1', [uid])
    if (!userOk.rowCount) return res.status(400).json({ message: 'Invalid user_id (no such user)' })

    const prodOk = await pool.query('SELECT 1 FROM products WHERE id = $1', [pid])
    if (!prodOk.rowCount) return res.status(400).json({ message: 'Invalid product_id (no such product)' })

    await pool.query(
      `INSERT INTO wishlist (user_id, product_id)
       SELECT $1, $2
       WHERE NOT EXISTS (
         SELECT 1 FROM wishlist WHERE user_id = $1 AND product_id = $2
       )`,
      [uid, pid]
    )

    res.json({ message: 'Added to wishlist' })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/:user_id', async (req, res) => {
  const uid = toInt(req.params.user_id)
  if (!uid) return res.status(400).json({ message: 'Invalid user_id' })

  try {
    const sql = `
      SELECT
        w.id AS wishlist_id,
        w.user_id,
        p.id AS product_id,
        p.name,
        p.brand,
        p.category_slug,
        p.price,
        p.discounted_price,
        p.description,
        p.images,
        p.published,
        w.created_at
      FROM wishlist w
      JOIN products p ON p.id = w.product_id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
    `
    const { rows } = await pool.query(sql, [uid])
    const out = rows.map((r) => ({
      ...r,
      images: normalizeImages(r.images),
      image_url: Array.isArray(r.images) && r.images.length ? r.images[0] : ''
    }))
    res.json(out)
  } catch (err) {
    res.status(500).json({ message: 'Error fetching wishlist', error: err.message })
  }
})

router.delete('/', async (req, res) => {
  const uid = toInt(req.body?.user_id)
  const pid = toInt(req.body?.product_id)

  if (!uid || !pid) return res.status(400).json({ message: 'Invalid user_id or product_id' })

  try {
    await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2', [uid, pid])
    res.json({ message: 'Removed from wishlist' })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

module.exports = router
