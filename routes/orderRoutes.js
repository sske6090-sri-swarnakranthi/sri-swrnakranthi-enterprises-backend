const router = require('express').Router()
const pool = require('../db')

const toText = (v) => {
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

const safeNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

router.get('/web/admin', async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit ?? 200)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200

    const ordersQ = await pool.query(
      `
      SELECT
        o.id,
        o.user_id,
        o.total_amount,
        o.payment_status,
        o.order_status,
        o.payment_method,
        o.created_at,
        o.customer_name,
        o.customer_email,
        o.customer_mobile,
        o.shipping_address_line1,
        o.shipping_address_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_pincode,
        o.shipping_country,
        o.payment_ref
      FROM orders o
      ORDER BY o.created_at DESC NULLS LAST, o.id DESC
      LIMIT $1
      `,
      [limit]
    )

    if (!ordersQ.rowCount) return res.json([])

    const orderIds = ordersQ.rows.map((r) => r.id)

    const itemsQ = await pool.query(
      `
      SELECT
        i.id,
        i.order_id,
        i.product_id,
        i.product_name,
        i.quantity,
        i.price,
        p.brand,
        p.images
      FROM order_items i
      LEFT JOIN products p ON p.id = i.product_id
      WHERE i.order_id = ANY($1::int[])
      ORDER BY i.id ASC
      `,
      [orderIds]
    )

    const byOrder = new Map()

    for (const o of ordersQ.rows) {
      byOrder.set(o.id, {
        id: o.id,
        user_id: o.user_id,
        total_amount: safeNum(o.total_amount),
        payment_status: o.payment_status || 'pending',
        order_status: o.order_status || 'placed',
        payment_method: o.payment_method || 'COD',
        payment_ref: o.payment_ref || null,
        created_at: o.created_at,
        customer_name: o.customer_name || '',
        customer_email: o.customer_email || '',
        customer_mobile: o.customer_mobile || '',
        shipping_address_line1: o.shipping_address_line1 || '',
        shipping_address_line2: o.shipping_address_line2 || '',
        shipping_city: o.shipping_city || '',
        shipping_state: o.shipping_state || '',
        shipping_pincode: o.shipping_pincode || '',
        shipping_country: o.shipping_country || 'India',
        items: []
      })
    }

    for (const it of itemsQ.rows) {
      const rec = byOrder.get(it.order_id)
      if (!rec) continue
      const images = it.images
      const image_url = (Array.isArray(images) && images.length ? String(images[0]) : '') || ''
      rec.items.push({
        product_id: it.product_id ? Number(it.product_id) : null,
        product_name: it.product_name || '',
        brand: it.brand || '',
        qty: Number(it.quantity || 1),
        price: safeNum(it.price),
        mrp: safeNum(it.price),
        size: '',
        colour: '',
        image_url
      })
    }

    return res.json(Array.from(byOrder.values()))
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/web/by-user', async (req, res) => {
  try {
    const email = toText(req.query.email).toLowerCase()
    const mobile = toText(req.query.mobile).replace(/\D/g, '').slice(0, 10)

    if (!email && !mobile) return res.status(400).json({ message: 'email or mobile required' })

    const params = []
    const ors = []

    if (email) {
      params.push(email)
      ors.push(`LOWER(o.customer_email) = $${params.length}`)
    }

    if (mobile) {
      params.push(mobile)
      ors.push(`regexp_replace(o.customer_mobile,'\\D','','g') = $${params.length}`)
    }

    const whereSql = ors.length ? `WHERE (${ors.join(' OR ')})` : ''

    const ordersQ = await pool.query(
      `
      SELECT
        o.id,
        o.user_id,
        o.total_amount,
        o.payment_status,
        o.order_status,
        o.payment_method,
        o.created_at,
        o.customer_name,
        o.customer_email,
        o.customer_mobile,
        o.shipping_address_line1,
        o.shipping_address_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_pincode,
        o.shipping_country,
        o.payment_ref
      FROM orders o
      ${whereSql}
      ORDER BY o.created_at DESC NULLS LAST, o.id DESC
      LIMIT 200
      `,
      params
    )

    if (!ordersQ.rowCount) return res.json([])

    const orderIds = ordersQ.rows.map((r) => r.id)

    const itemsQ = await pool.query(
      `
      SELECT
        i.order_id,
        i.product_id,
        i.product_name,
        i.quantity,
        i.price,
        p.brand,
        p.images
      FROM order_items i
      LEFT JOIN products p ON p.id = i.product_id
      WHERE i.order_id = ANY($1::int[])
      ORDER BY i.id ASC
      `,
      [orderIds]
    )

    const byOrder = new Map()

    for (const o of ordersQ.rows) {
      byOrder.set(o.id, {
        id: o.id,
        user_id: o.user_id,
        total_amount: safeNum(o.total_amount),
        payment_status: o.payment_status || 'pending',
        order_status: o.order_status || 'placed',
        payment_method: o.payment_method || 'COD',
        payment_ref: o.payment_ref || null,
        created_at: o.created_at,
        customer_name: o.customer_name || '',
        customer_email: o.customer_email || '',
        customer_mobile: o.customer_mobile || '',
        shipping_address_line1: o.shipping_address_line1 || '',
        shipping_address_line2: o.shipping_address_line2 || '',
        shipping_city: o.shipping_city || '',
        shipping_state: o.shipping_state || '',
        shipping_pincode: o.shipping_pincode || '',
        shipping_country: o.shipping_country || 'India',
        items: []
      })
    }

    for (const it of itemsQ.rows) {
      const rec = byOrder.get(it.order_id)
      if (!rec) continue
      const images = it.images
      const image_url = (Array.isArray(images) && images.length ? String(images[0]) : '') || ''
      rec.items.push({
        product_id: it.product_id ? Number(it.product_id) : null,
        product_name: it.product_name || '',
        brand: it.brand || '',
        qty: Number(it.quantity || 1),
        price: safeNum(it.price),
        mrp: safeNum(it.price),
        size: '',
        colour: '',
        image_url
      })
    }

    return res.json(Array.from(byOrder.values()))
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/web/:id', async (req, res) => {
  try {
    const id = Number(req.params.id || 0)
    if (!id) return res.status(400).json({ message: 'id required' })

    const oQ = await pool.query(
      `
      SELECT
        o.id,
        o.user_id,
        o.total_amount,
        o.payment_status,
        o.order_status,
        o.payment_method,
        o.created_at,
        o.customer_name,
        o.customer_email,
        o.customer_mobile,
        o.shipping_address_line1,
        o.shipping_address_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_pincode,
        o.shipping_country,
        o.payment_ref
      FROM orders o
      WHERE o.id = $1
      `,
      [id]
    )

    if (!oQ.rowCount) return res.status(404).json({ message: 'Not found' })

    const itemsQ = await pool.query(
      `
      SELECT
        i.id,
        i.order_id,
        i.product_id,
        i.product_name,
        i.quantity,
        i.price,
        p.brand,
        p.images
      FROM order_items i
      LEFT JOIN products p ON p.id = i.product_id
      WHERE i.order_id = $1
      ORDER BY i.id ASC
      `,
      [id]
    )

    const order = oQ.rows[0]

    const items = itemsQ.rows.map((it) => {
      const images = it.images
      const image_url = (Array.isArray(images) && images.length ? String(images[0]) : '') || ''
      return {
        product_id: it.product_id ? Number(it.product_id) : null,
        product_name: it.product_name || '',
        brand: it.brand || '',
        qty: Number(it.quantity || 1),
        price: safeNum(it.price),
        mrp: safeNum(it.price),
        size: '',
        colour: '',
        image_url
      }
    })

    return res.json({
      order: {
        id: order.id,
        user_id: order.user_id,
        total_amount: safeNum(order.total_amount),
        payment_status: order.payment_status || 'pending',
        order_status: order.order_status || 'placed',
        payment_method: order.payment_method || 'COD',
        payment_ref: order.payment_ref || null,
        created_at: order.created_at,
        customer_name: order.customer_name || '',
        customer_email: order.customer_email || '',
        customer_mobile: order.customer_mobile || '',
        shipping_address_line1: order.shipping_address_line1 || '',
        shipping_address_line2: order.shipping_address_line2 || '',
        shipping_city: order.shipping_city || '',
        shipping_state: order.shipping_state || '',
        shipping_pincode: order.shipping_pincode || '',
        shipping_country: order.shipping_country || 'India'
      },
      items
    })
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

module.exports = router
