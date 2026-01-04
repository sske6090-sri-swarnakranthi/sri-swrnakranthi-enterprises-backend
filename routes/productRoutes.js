const express = require('express')
const pool = require('../db')
const router = express.Router()

const toNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

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

router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? Math.max(1, toInt(req.query.limit)) : null

    const sql = `
      SELECT
        id,
        category,
        brand,
        product_name,
        b2b_actual_price,
        b2b_discount,
        b2b_final_price,
        b2c_actual_price,
        b2c_discount,
        b2c_final_price,
        count,
        images,
        created_at,
        updated_at
      FROM gift_products
      ORDER BY updated_at DESC
      ${limit ? 'LIMIT ' + limit : ''}
    `

    const { rows } = await pool.query(sql)
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Error fetching products', error: e.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id)
    if (!id || id < 1) return res.status(400).json({ message: 'Invalid product id' })

    const q = await pool.query(
      `SELECT
        id,
        category,
        brand,
        product_name,
        b2b_actual_price,
        b2b_discount,
        b2b_final_price,
        b2c_actual_price,
        b2c_discount,
        b2c_final_price,
        count,
        images,
        created_at,
        updated_at
      FROM gift_products
      WHERE id = $1`,
      [id]
    )

    if (!q.rowCount) return res.status(404).json({ message: 'Product not found' })
    res.json(q.rows[0])
  } catch (e) {
    res.status(500).json({ message: 'Error fetching product', error: e.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const category = String(req.body?.category || '').trim()
    const brand = String(req.body?.brand || '').trim()
    const product_name = String(req.body?.product_name || '').trim()

    const b2b_actual_price = toNum(req.body?.b2b_actual_price)
    const b2b_discount = toNum(req.body?.b2b_discount)
    const b2b_final_price = toNum(req.body?.b2b_final_price)

    const b2c_actual_price = toNum(req.body?.b2c_actual_price)
    const b2c_discount = toNum(req.body?.b2c_discount)
    const b2c_final_price = toNum(req.body?.b2c_final_price)

    const count = Math.max(0, toInt(req.body?.count || 0))
    const images = normalizeImages(req.body?.images)

    if (!category || !brand || !product_name) {
      return res.status(400).json({ message: 'Missing product fields' })
    }

    const q = await pool.query(
      `INSERT INTO gift_products (
        category,
        brand,
        product_name,
        b2b_actual_price,
        b2b_discount,
        b2b_final_price,
        b2c_actual_price,
        b2c_discount,
        b2c_final_price,
        count,
        images
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      RETURNING *`,
      [
        category,
        brand,
        product_name,
        b2b_actual_price,
        b2b_discount,
        b2b_final_price,
        b2c_actual_price,
        b2c_discount,
        b2c_final_price,
        count,
        JSON.stringify(images)
      ]
    )

    res.status(201).json(q.rows[0])
  } catch (e) {
    res.status(500).json({ message: 'Error creating product', error: e.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id)
    if (!id || id < 1) return res.status(400).json({ message: 'Invalid product id' })

    const category = String(req.body?.category || '').trim()
    const brand = String(req.body?.brand || '').trim()
    const product_name = String(req.body?.product_name || '').trim()

    const b2b_actual_price = toNum(req.body?.b2b_actual_price)
    const b2b_discount = toNum(req.body?.b2b_discount)
    const b2b_final_price = toNum(req.body?.b2b_final_price)

    const b2c_actual_price = toNum(req.body?.b2c_actual_price)
    const b2c_discount = toNum(req.body?.b2c_discount)
    const b2c_final_price = toNum(req.body?.b2c_final_price)

    const count = Math.max(0, toInt(req.body?.count || 0))
    const images = normalizeImages(req.body?.images)

    if (!category || !brand || !product_name) {
      return res.status(400).json({ message: 'Missing product fields' })
    }

    const q = await pool.query(
      `UPDATE gift_products
       SET
        category = $1,
        brand = $2,
        product_name = $3,
        b2b_actual_price = $4,
        b2b_discount = $5,
        b2b_final_price = $6,
        b2c_actual_price = $7,
        b2c_discount = $8,
        b2c_final_price = $9,
        count = $10,
        images = $11::jsonb,
        updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        category,
        brand,
        product_name,
        b2b_actual_price,
        b2b_discount,
        b2b_final_price,
        b2c_actual_price,
        b2c_discount,
        b2c_final_price,
        count,
        JSON.stringify(images),
        id
      ]
    )

    if (!q.rowCount) return res.status(404).json({ message: 'Product not found' })
    res.json(q.rows[0])
  } catch (e) {
    res.status(500).json({ message: 'Error updating product', error: e.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id)
    if (!id || id < 1) return res.status(400).json({ message: 'Invalid product id' })

    const q = await pool.query('DELETE FROM gift_products WHERE id = $1 RETURNING id', [id])
    if (!q.rowCount) return res.status(404).json({ message: 'Product not found' })

    res.json({ message: 'Deleted', id: q.rows[0].id })
  } catch (e) {
    res.status(500).json({ message: 'Error deleting product', error: e.message })
  }
})

module.exports = router
