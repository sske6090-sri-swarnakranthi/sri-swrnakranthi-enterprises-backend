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
  const user_id = req.body?.user_id
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

  const uid = user_id === null || user_id === undefined || user_id === '' ? null : toInt(user_id)

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
      const userOk = await client.query('SELECT 1 FROM gift_users WHERE id = $1', [uid])
      if (!userOk.rowCount) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: 'Invalid user_id (no such user)' })
      }
    }

    const orderInsert = await client.query(
      `
      INSERT INTO gift_orders (
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
      const product_id = it?.product_id === null || it?.product_id === undefined ? null : toInt(it.product_id)
      const qty = toInt(it?.qty) || 1
      const price = toNum(it?.price)
      const mrp = toNum(it?.mrp)
      const product_name = toText(it?.product_name) || ''
      const brand = toText(it?.brand) || ''
      const size = toText(it?.size) || ''
      const colour = toText(it?.colour) || ''
      const image_url = toText(it?.image_url) || ''

      if (!product_id) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: 'Invalid product_id in items' })
      }

      const prodOk = await client.query('SELECT 1 FROM gift_products WHERE id = $1', [product_id])
      if (!prodOk.rowCount) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: `Invalid product_id (no such product): ${product_id}` })
      }

      await client.query(
        `
        INSERT INTO gift_order_items (
          order_id, product_id, product_name, brand, qty, price, mrp, size, colour, image_url
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [orderId, product_id, product_name, brand, qty, price, mrp, size, colour, image_url]
      )
    }

    if (uid) {
      await client.query('DELETE FROM gift_cart WHERE user_id = $1', [uid])
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

router.get('/web/admin', async (req, res) => {
  try {
    const ordersQ = await pool.query(
      `SELECT
         o.id,
         o.order_status,
         o.payment_status,
         o.payment_method,
         o.total_amount,
         o.created_at,
         o.customer_name,
         o.customer_email,
         o.customer_mobile,
         o.shipping_address_line1,
         o.shipping_address_line2,
         o.shipping_city,
         o.shipping_state,
         o.shipping_pincode,
         o.shipping_country
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
      byOrder.set(o.id, { ...o, items: [] })
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
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/web/by-user', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim()
    const mobile = String(req.query.mobile || '').trim()

    if (!email && !mobile) return res.status(400).json({ message: 'email or mobile required' })

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
         o.total_amount,
         o.created_at,
         o.customer_name,
         o.customer_email,
         o.customer_mobile,
         o.shipping_address_line1,
         o.shipping_address_line2,
         o.shipping_city,
         o.shipping_state,
         o.shipping_pincode,
         o.shipping_country
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
      byOrder.set(o.id, { ...o, items: [] })
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
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
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
         o.total_amount,
         o.created_at,
         o.customer_name,
         o.customer_email,
         o.customer_mobile,
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

    return res.json({ order, items })
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

module.exports = router
