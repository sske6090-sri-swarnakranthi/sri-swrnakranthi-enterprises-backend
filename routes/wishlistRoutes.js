const express = require('express')
const pool = require('../db')

const router = express.Router()

const toInt = (v) => {
  const n = Number(v)
  return Number.isInteger(n) ? n : parseInt(String(v ?? '').trim(), 10)
}

router.get('/:userId', async (req, res) => {
  try {
    const userId = toInt(req.params.userId)
    if (!userId || userId < 1) return res.status(400).json({ message: 'Invalid user id' })

    const q = await pool.query(
      `
      SELECT
        w.user_id,
        w.product_id,
        w.variant,
        w.created_at AS wish_created_at,
        p.id,
        p.name,
        p.model_name,
        p.brand,
        p.category_slug,
        p.price,
        p.discounted_price,
        p.description,
        p.images,
        p.published,
        p.created_at
      FROM wishlist w
      JOIN products p ON p.id = w.product_id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
      `,
      [userId]
    )

    const rows = (q.rows || []).map((r) => ({
      user_id: r.user_id,
      id: r.product_id,
      product_id: r.product_id,
      variant: r.variant || '',
      name: r.name,
      model_name: r.model_name,
      brand: r.brand,
      category_slug: r.category_slug,
      price: r.price,
      discounted_price: r.discounted_price,
      description: r.description,
      published: r.published,
      created_at: r.created_at,
      images: Array.isArray(r.images) ? r.images : []
    }))

    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Error fetching wishlist', error: e.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const user_id = toInt(req.body?.user_id)
    const product_id = toInt(req.body?.product_id)
    const variant = String(req.body?.variant || '').trim()

    if (!user_id || user_id < 1 || !product_id || product_id < 1) {
      return res.status(400).json({ message: 'Missing fields' })
    }

    await pool.query(
      `
      INSERT INTO wishlist (user_id, product_id, variant)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, product_id) DO NOTHING
      `,
      [user_id, product_id, variant || null]
    )

    res.status(201).json({ message: 'Added' })
  } catch (e) {
    res.status(500).json({ message: 'Error adding wishlist', error: e.message })
  }
})

router.delete('/', async (req, res) => {
  try {
    const user_id = toInt(req.body?.user_id)
    const product_id = toInt(req.body?.product_id)

    if (!user_id || user_id < 1 || !product_id || product_id < 1) {
      return res.status(400).json({ message: 'Missing fields' })
    }

    const q = await pool.query(
      `
      DELETE FROM wishlist
      WHERE user_id = $1 AND product_id = $2
      RETURNING user_id, product_id
      `,
      [user_id, product_id]
    )

    if (!q.rowCount) return res.status(404).json({ message: 'Not found' })
    res.json({ message: 'Removed' })
  } catch (e) {
    res.status(500).json({ message: 'Error removing wishlist', error: e.message })
  }
})

module.exports = router
