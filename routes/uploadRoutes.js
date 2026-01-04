const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const router = express.Router()

const uploadDir = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase()
    cb(null, `${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
})

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
  const base = process.env.ASSETS_BASE || 'http://localhost:5000/uploads'
  const imageUrl = `${base}/${req.file.filename}`
  res.json({ imageUrl })
})

module.exports = router
