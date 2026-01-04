const express = require('express')
const pool = require('../db')
const router = express.Router()

const toInt = v => {
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

router.post('/', async (req, res) => {
  const user_id = req.body?.user_id
  const product_id = req.body?.product_id

  const uid = toInt(user_id)
  const pid = toInt(product_id)

  if (!uid || !pid) return res.status(400).json({ message: 'Invalid user_id or product_id' })

  try {
    const userOk = await pool.query('SELECT 1 FROM gift_users WHERE id = $1', [uid])
    if (!userOk.rowCount) return res.status(400).json({ message: 'Invalid user_id (no such user)' })

    const prodOk = await pool.query('SELECT 1 FROM gift_products WHERE id = $1', [pid])
    if (!prodOk.rowCount) return res.status(400).json({ message: 'Invalid product_id (no such product)' })

    await pool.query(
      `INSERT INTO gift_wishlist (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
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
        p.category,
        p.brand,
        p.product_name,
        p.b2b_actual_price,
        p.b2b_discount,
        p.b2b_final_price,
        p.b2c_actual_price,
        p.b2c_discount,
        p.b2c_final_price,
        p.count,
        p.images,
        w.created_at
      FROM gift_wishlist w
      JOIN gift_products p ON p.id = w.product_id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
    `
    const { rows } = await pool.query(sql, [uid])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ message: 'Error fetching wishlist', error: err.message })
  }
})

router.delete('/', async (req, res) => {
  const user_id = req.body?.user_id
  const product_id = req.body?.product_id

  const uid = toInt(user_id)
  const pid = toInt(product_id)

  if (!uid || !pid) return res.status(400).json({ message: 'Invalid user_id or product_id' })

  try {
    await pool.query('DELETE FROM gift_wishlist WHERE user_id = $1 AND product_id = $2', [uid, pid])
    res.json({ message: 'Removed from wishlist' })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

module.exports = router
