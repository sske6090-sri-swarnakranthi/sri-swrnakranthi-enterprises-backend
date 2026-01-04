const express = require('express')
const pool = require('../db')

const router = express.Router()

router.post('/web/place', async (req, res) => {
  const {
    customer_email,
    customer_name,
    customer_mobile,
    shipping_address,
    totals,
    items,
    payment_status,
    payment_method,
    login_email
  } = req.body || {}

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items required' })
  }

  const finalPaymentMethod = String(payment_method || 'COD').toUpperCase()
  const finalPaymentStatus = String(payment_status || 'COD').toUpperCase()

  const client = await pool.connect()
  let orderId = null

  try {
    await client.query('BEGIN')

    const storedEmail = login_email || customer_email || null

    const inserted = await client.query(
      `INSERT INTO gift_orders
       (customer_email, customer_name, customer_mobile, shipping_address, totals, payment_method, payment_status, status)
       VALUES
       ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)
       RETURNING id`,
      [
        storedEmail,
        customer_name || null,
        customer_mobile || null,
        shipping_address ? JSON.stringify(shipping_address) : JSON.stringify({}),
        totals ? JSON.stringify(totals) : JSON.stringify({}),
        finalPaymentMethod,
        finalPaymentStatus,
        'PLACED'
      ]
    )

    orderId = inserted.rows[0].id

    for (const it of items) {
      const productId = Number(it?.product_id || it?.id)
      const qty = Number(it?.qty ?? 1) || 1
      const price = Number(it?.price ?? 0) || 0
      const mrp = Number(it?.mrp ?? it?.price ?? 0) || 0

      if (!productId || qty <= 0) continue

      await client.query(
        `INSERT INTO gift_order_items
         (order_id, product_id, product_name, brand, qty, price, mrp, size, colour, image_url)
         VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          orderId,
          productId,
          String(it?.product_name || it?.name || 'Product'),
          String(it?.brand || ''),
          qty,
          price,
          mrp,
          String(it?.size || ''),
          String(it?.colour || it?.color || ''),
          it?.image_url || null
        ]
      )
    }

    await client.query('COMMIT')
    client.release()

    return res.json({
      id: orderId,
      status: 'PLACED',
      totals: totals || null
    })
  } catch {
    try {
      await client.query('ROLLBACK')
    } catch {}
    try {
      client.release()
    } catch {}
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
