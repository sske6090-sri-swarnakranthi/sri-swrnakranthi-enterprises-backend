const router = require('express').Router()
const pool = require('../db')

const toInt = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const toText = (v) => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
}

const normMobile = (v) => String(v || '').replace(/\D/g, '').slice(0, 10)

router.post('/web/place', async (req, res) => {
  const uidRaw = req.body?.user_id
  const uid = uidRaw === null || uidRaw === undefined || uidRaw === '' ? null : toInt(uidRaw)

  const total_amount = toNum(req.body?.total_amount)

  const customer_name = toText(req.body?.customer_name)
  const customer_email = toText(req.body?.customer_email)
  const customer_mobile = normMobile(req.body?.customer_mobile)

  const shipping_address_line1 = toText(req.body?.shipping_address_line1)
  const shipping_address_line2 = toText(req.body?.shipping_address_line2)
  const shipping_city = toText(req.body?.shipping_city)
  const shipping_state = toText(req.body?.shipping_state)
  const shipping_pincode = String(req.body?.shipping_pincode || '').replace(/\D/g, '').slice(0, 6)
  const shipping_country = toText(req.body?.shipping_country) || 'India'

  const payment_method = 'COD'
  const payment_status = 'pending'
  const order_status = 'placed'
  const payment_ref = null

  const items = Array.isArray(req.body?.items) ? req.body.items : []

  if (!total_amount || total_amount <= 0) return res.status(400).json({ message: 'total_amount required' })
  if (!customer_name) return res.status(400).json({ message: 'customer_name required' })
  if (!customer_mobile || customer_mobile.length !== 10) return res.status(400).json({ message: 'customer_mobile required' })
  if (!shipping_address_line1) return res.status(400).json({ message: 'shipping_address_line1 required' })
  if (!shipping_city) return res.status(400).json({ message: 'shipping_city required' })
  if (!shipping_state) return res.status(400).json({ message: 'shipping_state required' })
  if (!shipping_pincode || shipping_pincode.length !== 6) return res.status(400).json({ message: 'shipping_pincode required' })
  if (!items.length) return res.status(400).json({ message: 'items required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (uid) {
      const userOk = await client.query('SELECT 1 FROM users WHERE id = $1', [uid])
      if (!userOk.rowCount) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: 'Invalid user_id (no such user)' })
      }
    }

    const orderInsert = await client.query(
      `
      INSERT INTO orders (
        user_id,
        total_amount,
        payment_status,
        order_status,
        customer_name,
        customer_email,
        customer_mobile,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_pincode,
        shipping_country,
        payment_method,
        payment_ref
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id, created_at
      `,
      [
        uid,
        total_amount,
        payment_status,
        order_status,
        customer_name,
        customer_email,
        customer_mobile,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_pincode,
        shipping_country,
        payment_method,
        payment_ref
      ]
    )

    const orderId = orderInsert.rows[0].id

    for (const it of items) {
      const product_id = toInt(it?.product_id ?? it?.id)
      const quantity = toInt(it?.quantity ?? it?.qty) || 1
      let price = toNum(it?.price)
      if (!price || price <= 0) price = toNum(it?.offer ?? it?.final_price ?? it?.discounted_price ?? 0)

      const productQ = await client.query(
        `SELECT id, name, brand, price, discounted_price, images
         FROM products
         WHERE id = $1`,
        [product_id]
      )

      if (!productQ.rowCount) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: `Invalid product_id (no such product): ${product_id}` })
      }

      const p = productQ.rows[0]
      const product_name = toText(it?.product_name ?? it?.name) || p.name || ''
      const rowPrice = price > 0 ? price : toNum(p.discounted_price ?? p.price ?? 0)
      const image_url =
        toText(it?.image_url) ||
        (Array.isArray(p.images) && p.images.length ? String(p.images[0]) : '') ||
        ''

      await client.query(
        `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name,
          quantity,
          price
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [orderId, product_id, product_name, quantity, rowPrice]
      )

      await client.query(
        `
        INSERT INTO sales (order_id, total_amount)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [orderId, total_amount]
      )
    }

    if (uid) {
      await client.query('DELETE FROM cart WHERE user_id = $1', [uid])
    }

    await client.query('COMMIT')
    return res.status(201).json({ id: orderId, created_at: orderInsert.rows[0].created_at })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    return res.status(500).json({ message: 'Server error', error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
