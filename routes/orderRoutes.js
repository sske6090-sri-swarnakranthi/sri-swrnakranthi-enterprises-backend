const router = require('express').Router()
const pool = require('../db')

function safeJson(v) {
  if (!v) return {}
  if (typeof v === 'object') return v
  try {
    return JSON.parse(v)
  } catch {
    return {}
  }
}

function toInt(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toText(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
}

router.post('/web/place', async (req, res) => {
  const user_id = toInt(req.body?.user_id)
  const total_amount = toNum(req.body?.total_amount)
  const payment_status = toText(req.body?.payment_status) || 'pending'
  const order_status = toText(req.body?.order_status) || 'placed'
  const customer_name = toText(req.body?.customer_name)
  const customer_email = toText(req.body?.customer_email)
  const customer_mobile = toText(req.body?.customer_mobile)
  const shipping_address_line1 = toText(req.body?.shipping_address_line1)
  const shipping_address_line2 = toText(req.body?.shipping_address_line2)
  const shipping_city = toText(req.body?.shipping_city)
  const shipping_state = toText(req.body?.shipping_state)
  const shipping_pincode = toText(req.body?.shipping_pincode)
  const shipping_country = toText(req.body?.shipping_country) || 'India'
  const payment_method = toText(req.body?.payment_method) || 'COD'
  const payment_ref = toText(req.body?.payment_ref)

  const totals = safeJson(req.body?.totals)
  const items = Array.isArray(req.body?.items) ? req.body.items : []

  if (!total_amount || total_amount <= 0) return res.status(400).json({ message: 'total_amount required' })
  if (!customer_name) return res.status(400).json({ message: 'customer_name required' })
  if (!customer_mobile) return res.status(400).json({ message: 'customer_mobile required' })
  if (!shipping_address_line1 || !shipping_city || !shipping_state || !shipping_pincode) {
    return res.status(400).json({ message: 'shipping address fields required' })
  }
  if (!items.length) return res.status(400).json({ message: 'items required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const orderIns = await client.query(
      `INSERT INTO gift_orders (
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
        payment_ref,
        totals
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id`,
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
        payment_ref,
        JSON.stringify(totals || {})
      ]
    )

    const orderId = orderIns.rows[0]?.id
    if (!orderId) throw new Error('Order not created')

    for (const it of items) {
      const product_id = toInt(it?.product_id)
      const product_name = toText(it?.product_name) || toText(it?.name) || ''
      const brand = toText(it?.brand) || ''
      const qty = Math.max(1, toInt(it?.qty) || 1)
      const price = toNum(it?.price)
      const mrp = toNum(it?.mrp) || price
      const size = toText(it?.size)
      const colour = toText(it?.colour || it?.color)
      const image_url = toText(it?.image_url)

      await client.query(
        `INSERT INTO gift_order_items (
          order_id,
          product_id,
          product_name,
          brand,
          qty,
          price,
          mrp,
          size,
          colour,
          image_url
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [orderId, product_id, product_name, brand, qty, price, mrp, size, colour, image_url]
      )
    }

    if (user_id) {
      await client.query('DELETE FROM gift_cart WHERE user_id = $1', [user_id])
    }

    await client.query('COMMIT')
    return res.status(201).json({ id: orderId })
  } catch (e) {
    await client.query('ROLLBACK')
    return res.status(500).json({ message: 'Failed to place order', error: e.message })
  } finally {
    client.release()
  }
})

router.get('/web/admin', async (req, res) => {
  try {
    const ordersQ = await pool.query(
      `SELECT
         o.id,
         o.order_status,
         o.payment_status,
         o.payment_method,
         o.created_at,
         o.totals,
         o.customer_name,
         o.customer_email,
         o.customer_mobile,
         o.total_amount
       FROM gift_orders o
       ORDER BY o.created_at DESC NULLS LAST, o.id DESC
       LIMIT 500`
    )

    if (!ordersQ.rowCount) return res.json([])

    const orderIds = ordersQ.rows.map((r) => r.id)

    const itemsQ = await pool.query(
      `SELECT
         i.order_id,
         i.product_id,
         i.product_name,
         i.brand,
         i.qty,
         i.price,
         i.mrp,
         i.size,
         i.colour,
         i.image_url
       FROM gift_order_items i
       WHERE i.order_id = ANY($1::bigint[])`,
      [orderIds]
    )

    const byOrder = new Map()

    for (const o of ordersQ.rows) {
      byOrder.set(o.id, {
        ...o,
        totals: safeJson(o.totals),
        items: []
      })
    }

    for (const it of itemsQ.rows) {
      const rec = byOrder.get(it.order_id)
      if (rec) {
        rec.items.push({
          product_id: Number(it.product_id || 0),
          product_name: it.product_name || '',
          brand: it.brand || '',
          qty: Number(it.qty || 0),
          price: Number(it.price || 0),
          mrp: Number(it.mrp || 0),
          size: it.size || '',
          colour: it.colour || '',
          image_url: it.image_url || ''
        })
      }
    }

    return res.json(Array.from(byOrder.values()))
  } catch {
    return res.status(500).json({ message: 'Server error' })
  }
})

router.get('/web/by-user', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim()
    const mobile = String(req.query.mobile || '').trim()

    if (!email && !mobile) {
      return res.status(400).json({ message: 'email or mobile required' })
    }

    const params = []
    const ors = []

    if (email) {
      params.push(email)
      ors.push(`LOWER(o.customer_email) = LOWER($${params.length})`)
    }

    if (mobile) {
      params.push(mobile)
      ors.push(`regexp_replace(o.customer_mobile,'\\D','','g') = regexp_replace($${params.length},'\\D','','g')`)
    }

    const whereSql = ors.length ? `WHERE (${ors.join(' OR ')})` : ''

    const ordersQ = await pool.query(
      `SELECT
         o.id,
         o.order_status,
         o.payment_status,
         o.payment_method,
         o.created_at,
         o.totals,
         o.customer_name,
         o.customer_email,
         o.customer_mobile,
         o.total_amount
       FROM gift_orders o
       ${whereSql}
       ORDER BY o.created_at DESC NULLS LAST, o.id DESC
       LIMIT 200`,
      params
    )

    if (!ordersQ.rowCount) return res.json([])

    const orderIds = ordersQ.rows.map((r) => r.id)

    const itemsQ = await pool.query(
      `SELECT
         i.order_id,
         i.product_id,
         i.product_name,
         i.brand,
         i.qty,
         i.price,
         i.mrp,
         i.size,
         i.colour,
         i.image_url
       FROM gift_order_items i
       WHERE i.order_id = ANY($1::bigint[])`,
      [orderIds]
    )

    const byOrder = new Map()

    for (const o of ordersQ.rows) {
      byOrder.set(o.id, {
        ...o,
        totals: safeJson(o.totals),
        items: []
      })
    }

    for (const it of itemsQ.rows) {
      const rec = byOrder.get(it.order_id)
      if (rec) {
        rec.items.push({
          product_id: Number(it.product_id || 0),
          product_name: it.product_name || '',
          brand: it.brand || '',
          qty: Number(it.qty || 0),
          price: Number(it.price || 0),
          mrp: Number(it.mrp || 0),
          size: it.size || '',
          colour: it.colour || '',
          image_url: it.image_url || ''
        })
      }
    }

    return res.json(Array.from(byOrder.values()))
  } catch {
    return res.status(500).json({ message: 'Server error' })
  }
})

router.get('/web/:id', async (req, res) => {
  try {
    const id = Number(req.params.id || 0)
    if (!id) return res.status(400).json({ message: 'id required' })

    const oQ = await pool.query(
      `SELECT
         o.id,
         o.order_status,
         o.payment_status,
         o.payment_method,
         o.created_at,
         o.totals,
         o.customer_name,
         o.customer_email,
         o.customer_mobile,
         o.total_amount,
         o.shipping_address_line1,
         o.shipping_address_line2,
         o.shipping_city,
         o.shipping_state,
         o.shipping_pincode,
         o.shipping_country
       FROM gift_orders o
       WHERE o.id = $1`,
      [id]
    )

    if (!oQ.rowCount) return res.status(404).json({ message: 'Not found' })

    const itemsQ = await pool.query(
      `SELECT
         i.product_id,
         i.product_name,
         i.brand,
         i.qty,
         i.price,
         i.mrp,
         i.size,
         i.colour,
         i.image_url
       FROM gift_order_items i
       WHERE i.order_id = $1
       ORDER BY i.id ASC`,
      [id]
    )

    const order = oQ.rows[0]
    const items = itemsQ.rows.map((it) => ({
      product_id: Number(it.product_id || 0),
      product_name: it.product_name || '',
      brand: it.brand || '',
      qty: Number(it.qty || 0),
      price: Number(it.price || 0),
      mrp: Number(it.mrp || 0),
      size: it.size || '',
      colour: it.colour || '',
      image_url: it.image_url || ''
    }))

    return res.json({
      order: {
        ...order,
        totals: safeJson(order.totals)
      },
      items
    })
  } catch {
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
