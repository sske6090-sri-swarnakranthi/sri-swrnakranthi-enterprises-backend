require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')

const app = express()

app.set('etag', false)

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'https://sri-swrnakranthi-enterprises-websit.vercel.app',
  'https://sri-swrnakranthi-enterprises-admin.vercel.app'
]

const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const allowedOrigins = envOrigins.length ? envOrigins : defaultOrigins

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true)
      if (allowedOrigins.includes('*')) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type'],
    credentials: true
  })
)

app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api/upload', require('./routes/uploadRoutes'))
app.use('/api/products', require('./routes/productRoutes'))
app.use('/api/user', require('./routes/userRoutes'))
app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/wishlist', require('./routes/wishlistRoutes'))
app.use('/api/cart', require('./routes/cartRoutes'))
app.use('/api/sales', require('./routes/salesRoutes'))
app.use('/api/orders', require('./routes/orderRoutes'))

app.get('/', (req, res) => res.status(200).send('Gifts API'))
app.get('/healthz', (req, res) => res.status(200).send('ok'))

app.use((req, res) => res.status(404).json({ message: 'Not found' }))

module.exports = app
