const express = require('express')
const pool = require('../db')
const router = express.Router()

const toInt = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

const toQty = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 1
  const i = Math.floor(n)
  return i > 0 ? i : 1
}

const toNullableText = (v) => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
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
  const qty = toQty(req.body?.quantity)
  const variant = toNullableText(req.body?.variant)

  if (!uid || !pid) return res.status(400).json({ message: 'Missing cart fields' })

  try {
    const userOk = await pool.query('SELECT 1 FROM users WHERE id = $1', [uid])
    if (!userOk.rowCount) return res.status(400).json({ message: 'Invalid user_id (no such user)' })

    const prodOk = await pool.query('SELECT 1 FROM products WHERE id = $1', [pid])
    if (!prodOk.rowCount) return res.status(400).json({ message: 'Invalid product_id (no such product)' })

    const existing = await pool.query(
      `
      SELECT id, quantity
      FROM cart
      WHERE user_id = $1
        AND product_id = $2
        AND COALESCE(variant,'') = COALESCE($3,'')
      LIMIT 1
      `,
      [uid, pid, variant]
    )

    if (existing.rowCount) {
      const row = existing.rows[0]
      const nextQty = toQty(Number(row.quantity) + qty)
      await pool.query('UPDATE cart SET quantity = $1 WHERE id = $2', [nextQty, row.id])
      return res.status(201).json({ message: 'Added to cart successfully' })
    }

    await pool.query(
      `
      INSERT INTO cart (user_id, product_id, quantity, variant)
      VALUES ($1, $2, $3, $4)
      `,
      [uid, pid, qty, variant]
    )

    res.status(201).json({ message: 'Added to cart successfully' })
  } catch (err) {
    res.status(500).json({ message: 'Error adding to cart', error: err.message })
  }
})

router.put('/', async (req, res) => {
  const cartId = toInt(req.body?.cart_id)
  const uid = toInt(req.body?.user_id)
  const pid = toInt(req.body?.product_id)
  const qty = toQty(req.body?.quantity)
  const variant = toNullableText(req.body?.variant)

  try {
    if (cartId) {
      await pool.query('UPDATE cart SET quantity = $1 WHERE id = $2', [qty, cartId])
      return res.json({ message: 'Quantity updated' })
    }

    if (!uid || !pid) return res.status(400).json({ message: 'Missing fields for update' })

    await pool.query(
      `
      UPDATE cart
      SET quantity = $4
      WHERE user_id = $1
        AND product_id = $2
        AND COALESCE(variant,'') = COALESCE($3,'')
      `,
      [uid, pid, variant, qty]
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
        c.quantity,
        c.variant,
        c.created_at,
        p.name,
        p.model_name,
        p.brand,
        p.category_slug,
        p.price,
        p.discounted_price,
        p.description,
        p.images,
        p.published
      FROM cart c
      JOIN products p ON p.id = c.product_id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `
    const { rows } = await pool.query(sql, [uid])
    const out = rows.map((r) => {
      const imgs = normalizeImages(r.images)
      return {
        ...r,
        images: imgs,
        image_url: imgs.length ? imgs[0] : ''
      }
    })
    res.json(out)
  } catch (err) {
    res.status(500).json({ message: 'Error fetching cart', error: err.message })
  }
})

router.delete('/', async (req, res) => {
  const cartId = toInt(req.body?.cart_id)
  const uid = toInt(req.body?.user_id)
  const pid = toInt(req.body?.product_id)
  const variant = toNullableText(req.body?.variant)

  try {
    if (cartId) {
      await pool.query('DELETE FROM cart WHERE id = $1', [cartId])
      return res.json({ message: 'Item removed from cart' })
    }

    if (!uid || !pid) return res.status(400).json({ message: 'Missing fields for delete' })

    await pool.query(
      `
      DELETE FROM cart
      WHERE user_id = $1
        AND product_id = $2
        AND COALESCE(variant,'') = COALESCE($3,'')
      `,
      [uid, pid, variant]
    )

    res.json({ message: 'Item removed from cart' })
  } catch (err) {
    res.status(500).json({ message: 'Error removing from cart', error: err.message })
  }
})

module.exports = router
