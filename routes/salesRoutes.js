const express = require('express')
const pool = require('../db')

const router = express.Router()

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

router.post('/web/place', async (req, res) => {
  const b = req.body || {}

  const user_id = b.user_id != null ? Number(b.user_id) : null
  const total_amount = toNum(b.total_amount)
  const payment_status = String(b.payment_status || 'pending')
  const order_status = String(b.order_status || 'placed')
  const customer_name = b.customer_name ? String(b.customer_name) : null
  const customer_email = b.customer_email ? String(b.customer_email) : null
  const customer_mobile = b.customer_mobile ? String(b.customer_mobile) : null
  const shipping_address_line1 = b.shipping_address_line1 ? String(b.shipping_address_line1) : null
  const shipping_address_line2 = b.shipping_address_line2 ? String(b.shipping_address_line2) : null
  const shipping_city = b.shipping_city ? String(b.shipping_city) : null
  const shipping_state = b.shipping_state ? String(b.shipping_state) : null
  const shipping_pincode = b.shipping_pincode ? String(b.shipping_pincode) : null
  const shipping_country = b.shipping_country ? String(b.shipping_country) : 'India'
  const payment_method = b.payment_method ? String(b.payment_method) : 'COD'
  const payment_ref = b.payment_ref ? String(b.payment_ref) : null

  const items = Array.isArray(b.items) ? b.items : []
  if (!items.length) return res.status(400).json({ message: 'items required' })
  if (!customer_name || !customer_mobile || !shipping_address_line1 || !shipping_city || !shipping_state || !shipping_pincode) {
    return res.status(400).json({ message: 'missing required fields' })
  }
  if (!total_amount || total_amount <= 0) return res.status(400).json({ message: 'total_amount required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const inserted = await client.query(
      `INSERT INTO orders
       (user_id, total_amount, payment_status, order_status, customer_name, customer_email, customer_mobile,
        shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_pincode, shipping_country,
        payment_method, payment_ref)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, created_at`,
      [
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
      ]
    )

    const orderId = inserted.rows[0].id

    for (const it of items) {
      const productId = it?.product_id != null ? Number(it.product_id) : it?.id != null ? Number(it.id) : null
      const qty = toNum(it?.qty ?? it?.quantity ?? 1) || 1
      const price = toNum(it?.price ?? 0)

      if (!productId || qty <= 0 || price < 0) continue

      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, product_name, quantity, price)
         VALUES
         ($1,$2,$3,$4,$5)`,
        [
          orderId,
          productId,
          String(it?.product_name || it?.name || 'Product'),
          qty,
          price
        ]
      )
    }

    await client.query(
      `INSERT INTO sales (order_id, total_amount)
       VALUES ($1,$2)`,
      [orderId, total_amount]
    )

    if (user_id && Number.isInteger(user_id) && user_id > 0) {
      await client.query(`DELETE FROM cart WHERE user_id = $1`, [user_id])
    }

    await client.query('COMMIT')
    return res.json({
      id: orderId,
      order_id: orderId,
      total_amount,
      payment_status,
      order_status,
      created_at: inserted.rows[0].created_at
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    return res.status(500).json({ message: 'Server error' })
  } finally {
    try {
      client.release()
    } catch {}
  }
})

module.exports = router
