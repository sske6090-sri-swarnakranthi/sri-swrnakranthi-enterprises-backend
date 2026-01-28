const express = require('express')
const multer = require('multer')
const unzipper = require('unzipper')
const { v2: cloudinary } = require('cloudinary')
const pool = require('../db')
const router = express.Router()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
})

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
})

const toNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim())
  return Number.isFinite(n) ? n : null
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

const normalizeBool = (v, fallback = true) => {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true') return true
    if (s === 'false') return false
  }
  if (typeof v === 'number') return v === 1
  return fallback
}

const uploadBufferToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'uploads', resource_type: 'image' },
      (err, uploaded) => {
        if (err) return reject(err)
        resolve(uploaded)
      }
    )
    stream.end(buffer)
  })

router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? Math.max(1, toInt(req.query.limit)) : null

    const sql = `
      SELECT
        id,
        name,
        model_name,
        brand,
        category_slug,
        price,
        discounted_price,
        description,
        images,
        published,
        created_at
      FROM products
      ORDER BY created_at DESC
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
        name,
        model_name,
        brand,
        category_slug,
        price,
        discounted_price,
        description,
        images,
        published,
        created_at
      FROM products
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
    const name = String(req.body?.name || '').trim()
    const model_name_raw = req.body?.model_name
    const model_name = model_name_raw === null ? null : String(model_name_raw || '').trim() || null

    const brand_raw = req.body?.brand
    const brand = brand_raw === null ? null : String(brand_raw || '').trim() || null

    const category_slug_raw = req.body?.category_slug
    const category_slug = category_slug_raw === null ? null : String(category_slug_raw || '').trim() || null

    const price = toNum(req.body?.price)
    const discounted_price =
      req.body?.discounted_price === null || req.body?.discounted_price === undefined ? null : toNum(req.body?.discounted_price)

    const description_raw = req.body?.description
    const description = description_raw === null ? null : String(description_raw || '').trim() || null

    const images = normalizeImages(req.body?.images)
    const published = normalizeBool(req.body?.published, true)

    if (!name || price === null || price <= 0) {
      return res.status(400).json({ message: 'Missing product fields' })
    }

    const q = await pool.query(
      `INSERT INTO products (
        name,
        model_name,
        brand,
        category_slug,
        price,
        discounted_price,
        description,
        images,
        published
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [name, model_name, brand, category_slug, price, discounted_price, description, images, published]
    )

    res.status(201).json(q.rows[0])
  } catch (e) {
    res.status(500).json({ message: 'Error creating product', error: e.message })
  }
})

router.post('/upload-zip', zipUpload.single('zip'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No zip uploaded' })

    const metaRaw = req.body?.meta
    let meta = null
    try {
      meta = metaRaw ? JSON.parse(metaRaw) : null
    } catch {
      return res.status(400).json({ message: 'Invalid meta JSON' })
    }

    const name = String(meta?.name || '').trim()
    const model_name_raw = meta?.model_name
    const model_name = model_name_raw === null ? null : String(model_name_raw || '').trim() || null

    const brand_raw = meta?.brand
    const brand = brand_raw === null ? null : String(brand_raw || '').trim() || null

    const category_slug_raw = meta?.category_slug
    const category_slug = category_slug_raw === null ? null : String(category_slug_raw || '').trim() || null

    const price = toNum(meta?.price)
    const discounted_price = meta?.discounted_price === null || meta?.discounted_price === undefined ? null : toNum(meta?.discounted_price)

    const description_raw = meta?.description
    const description = description_raw === null ? null : String(description_raw || '').trim() || null

    const published = normalizeBool(meta?.published, true)

    if (!name || price === null || price <= 0) {
      return res.status(400).json({ message: 'Missing product fields' })
    }

    const zip = await unzipper.Open.buffer(req.file.buffer)
    const files = (zip.files || []).filter((f) => !f.path.endsWith('/') && !f.type)
    const imageFiles = files.filter((f) => {
      const p = String(f.path || '').toLowerCase()
      return p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.png') || p.endsWith('.webp')
    })

    if (!imageFiles.length) return res.status(400).json({ message: 'No images found in zip' })

    const imageUrls = []
    for (const f of imageFiles) {
      const buf = await f.buffer()
      const up = await uploadBufferToCloudinary(buf)
      if (up?.secure_url) imageUrls.push(up.secure_url)
    }

    if (!imageUrls.length) return res.status(500).json({ message: 'Failed to upload images from zip' })

    const q = await pool.query(
      `INSERT INTO products (
        name,
        model_name,
        brand,
        category_slug,
        price,
        discounted_price,
        description,
        images,
        published
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [name, model_name, brand, category_slug, price, discounted_price, description, imageUrls, published]
    )

    res.status(201).json(q.rows[0])
  } catch (e) {
    res.status(500).json({ message: 'Error creating product from zip', error: e.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id)
    if (!id || id < 1) return res.status(400).json({ message: 'Invalid product id' })

    const name = String(req.body?.name || '').trim()
    const model_name_raw = req.body?.model_name
    const model_name = model_name_raw === null ? null : String(model_name_raw || '').trim() || null

    const brand_raw = req.body?.brand
    const brand = brand_raw === null ? null : String(brand_raw || '').trim() || null

    const category_slug_raw = req.body?.category_slug
    const category_slug = category_slug_raw === null ? null : String(category_slug_raw || '').trim() || null

    const price = toNum(req.body?.price)
    const discounted_price =
      req.body?.discounted_price === null || req.body?.discounted_price === undefined ? null : toNum(req.body?.discounted_price)

    const description_raw = req.body?.description
    const description = description_raw === null ? null : String(description_raw || '').trim() || null

    const images = normalizeImages(req.body?.images)
    const published = normalizeBool(req.body?.published, true)

    if (!name || price === null || price <= 0) {
      return res.status(400).json({ message: 'Missing product fields' })
    }

    const q = await pool.query(
      `UPDATE products
       SET
        name = $1,
        model_name = $2,
        brand = $3,
        category_slug = $4,
        price = $5,
        discounted_price = $6,
        description = $7,
        images = $8,
        published = $9
       WHERE id = $10
       RETURNING *`,
      [name, model_name, brand, category_slug, price, discounted_price, description, images, published, id]
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

    const q = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id])
    if (!q.rowCount) return res.status(404).json({ message: 'Product not found' })

    res.json({ message: 'Deleted', id: q.rows[0].id })
  } catch (e) {
    res.status(500).json({ message: 'Error deleting product', error: e.message })
  }
})

module.exports = router
