const express = require('express')
const multer = require('multer')
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
  limits: { fileSize: 10 * 1024 * 1024 }
})

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'uploads',
          resource_type: 'image'
        },
        (err, uploaded) => {
          if (err) return reject(err)
          resolve(uploaded)
        }
      )
      stream.end(req.file.buffer)
    })

    return res.json({ imageUrl: result.secure_url })
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Internal Server Error' })
  }
})

module.exports = router
