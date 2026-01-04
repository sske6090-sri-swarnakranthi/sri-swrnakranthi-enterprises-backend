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

router.get('/web/admin', async (req, res) => {
  try {
    const ordersQ = await pool.query(
      `SELECT
         o.id,
         o.status,
         o.payment_status,
         o.payment_method,
         o.created_at,
         o.totals,
         o.customer_name,
         o.customer_email,
         o.customer_mobile
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
    const conds = []
    const ors = []

    if (email) {
      params.push(email)
      ors.push(`LOWER(o.customer_email) = LOWER($${params.length})`)
    }

    if (mobile) {
      params.push(mobile)
      ors.push(
        `regexp_replace(o.customer_mobile,'\\D','','g') = regexp_replace($${params.length},'\\D','','g')`
      )
    }

    if (ors.length) conds.push(`(${ors.join(' OR ')})`)

    const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const ordersQ = await pool.query(
      `SELECT
         o.id,
         o.status,
         o.payment_status,
         o.payment_method,
         o.created_at,
         o.totals,
         o.customer_name,
         o.customer_email,
         o.customer_mobile
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
         o.status,
         o.payment_status,
         o.payment_method,
         o.created_at,
         o.totals,
         o.shipping_address,
         o.customer_name,
         o.customer_email,
         o.customer_mobile
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
        totals: safeJson(order.totals),
        shipping_address: safeJson(order.shipping_address)
      },
      items
    })
  } catch {
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
