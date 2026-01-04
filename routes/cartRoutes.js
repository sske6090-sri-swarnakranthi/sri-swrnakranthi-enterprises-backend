const express = require('express')
const pool = require('../db')
const router = express.Router()

const toInt = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

const toNullableText = (v) => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
}

router.post('/', async (req, res) => {
  const { user_id, product_id, selected_size, selected_color, quantity } = req.body

  const uid = toInt(user_id)
  const pid = toInt(product_id)
  const qty = toInt(quantity) || 1

  const size = toNullableText(selected_size)
  const color = toNullableText(selected_color)

  if (!uid || !pid) {
    return res.status(400).json({ message: 'Missing cart fields' })
  }

  try {
    const userOk = await pool.query('SELECT 1 FROM gift_users WHERE id = $1', [uid])
    if (!userOk.rowCount) return res.status(400).json({ message: 'Invalid user_id (no such user)' })

    const prodOk = await pool.query('SELECT 1 FROM gift_products WHERE id = $1', [pid])
    if (!prodOk.rowCount) return res.status(400).json({ message: 'Invalid product_id (no such product)' })

    await pool.query(
      `
      INSERT INTO gift_cart (user_id, product_id, selected_size, selected_color, quantity)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, product_id, COALESCE(selected_size,''), COALESCE(selected_color,''))
      DO UPDATE SET quantity = gift_cart.quantity + EXCLUDED.quantity, updated_at = NOW()
      `,
      [uid, pid, size, color, qty]
    )

    res.status(201).json({ message: 'Added to cart successfully' })
  } catch (err) {
    res.status(500).json({ message: 'Error adding to cart', error: err.message })
  }
})

router.put('/', async (req, res) => {
  const { user_id, product_id, selected_size, selected_color, quantity } = req.body

  const uid = toInt(user_id)
  const pid = toInt(product_id)
  const qty = toInt(quantity)

  const size = toNullableText(selected_size)
  const color = toNullableText(selected_color)

  if (!uid || !pid || !qty || qty < 1) {
    return res.status(400).json({ message: 'Missing fields for update' })
  }

  try {
    await pool.query(
      `
      UPDATE gift_cart
      SET quantity=$5, updated_at=NOW()
      WHERE user_id=$1
        AND product_id=$2
        AND COALESCE(selected_size,'') = COALESCE($3,'')
        AND COALESCE(selected_color,'') = COALESCE($4,'')
      `,
      [uid, pid, size, color, qty]
    )
    res.json({ message: 'Quantity updated' })
  } catch (err) {
    res.status(500).json({ message: 'Error updating cart', error: err.message })
  }
})

router.get('/:userId', async (req, res) => {
  const uid = toInt(req.params.userId)
  if (!uid) return res.status(400).json({ message: 'Invalid userId' })

  try {
    const sql = `
      SELECT
        c.id AS cart_id,
        c.user_id,
        c.product_id,
        c.selected_size,
        c.selected_color,
        c.quantity,
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
        c.created_at,
        c.updated_at
      FROM gift_cart c
      JOIN gift_products p ON p.id = c.product_id
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC
    `
    const { rows } = await pool.query(sql, [uid])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ message: 'Error fetching cart', error: err.message })
  }
})

router.delete('/', async (req, res) => {
  const { user_id, product_id, selected_size, selected_color } = req.body

  const uid = toInt(user_id)
  const pid = toInt(product_id)

  const size = toNullableText(selected_size)
  const color = toNullableText(selected_color)

  if (!uid || !pid) {
    return res.status(400).json({ message: 'Missing fields for delete' })
  }

  try {
    await pool.query(
      `
      DELETE FROM gift_cart
      WHERE user_id=$1
        AND product_id=$2
        AND COALESCE(selected_size,'') = COALESCE($3,'')
        AND COALESCE(selected_color,'') = COALESCE($4,'')
      `,
      [uid, pid, size, color]
    )
    res.json({ message: 'Item removed from cart' })
  } catch (err) {
    res.status(500).json({ message: 'Error removing from cart', error: err.message })
  }
})

module.exports = router
