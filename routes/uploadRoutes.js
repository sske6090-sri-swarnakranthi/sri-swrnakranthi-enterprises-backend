const express = require('express')
const multer = require('multer')
const unzipper = require('unzipper')
const { v2: cloudinary } = require('cloudinary')

const router = express.Router()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
})

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

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })

  try {
    const result = await uploadBufferToCloudinary(req.file.buffer)
    return res.json({ imageUrl: result.secure_url })
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Internal Server Error' })
  }
})

router.post('/zip', upload.single('zip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No zip uploaded' })

  try {
    const zip = await unzipper.Open.buffer(req.file.buffer)
    const files = (zip.files || []).filter((f) => !f.path.endsWith('/') && !f.type)
    const imageFiles = files.filter((f) => {
      const p = String(f.path || '').toLowerCase()
      return p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.png') || p.endsWith('.webp')
    })

    if (!imageFiles.length) return res.status(400).json({ message: 'No images found in zip' })

    const uploadedUrls = []
    for (const f of imageFiles) {
      const buf = await f.buffer()
      const up = await uploadBufferToCloudinary(buf)
      if (up?.secure_url) uploadedUrls.push(up.secure_url)
    }

    if (!uploadedUrls.length) return res.status(500).json({ message: 'Failed to upload images from zip' })

    return res.json({ imageUrls: uploadedUrls })
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Internal Server Error' })
  }
})

module.exports = router
