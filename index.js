import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

const port = parseInt(process.env.PORT, 10) || 3001

// Parse allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000']

console.log('🔧 Config:')
console.log('   Port:', port)
console.log('   Allowed origins:', allowedOrigins)
console.log('   JWT_SECRET set:', !!process.env.JWT_SECRET)
console.log('   INTERNAL_API_KEY set:', !!process.env.INTERNAL_API_KEY)

// Single request handler for HTTP endpoints
const server = createServer((req, res) => {
  // Enable CORS for HTTP endpoints
  const origin = req.headers.origin
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check endpoint
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
    return
  }

  // Emit endpoint for Vercel to send notifications
  if (req.method === 'POST' && req.url === '/emit') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const apiKey = req.headers['x-api-key']
        if (apiKey !== process.env.INTERNAL_API_KEY) {
          console.log('❌ Unauthorized emit attempt')
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }

        const { event, room, data } = JSON.parse(body)
        console.log(`📤 Emitting ${event} to ${room || 'all'}`)

        if (room) {
          io.to(room).emit(event, data)
        } else {
          io.emit(event, data)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (err) {
        console.error('❌ Emit error:', err.message)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  console.log('🔐 Auth attempt, token exists:', !!token)

  if (!token) {
    console.log('❌ No token provided')
    return next(new Error('Authentication required'))
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    socket.userId = decoded.userId || decoded.id
    console.log('✅ Token verified for user:', socket.userId)
    next()
  } catch (err) {
    console.log('❌ Token verification failed:', err.message)
    return next(new Error('Invalid token'))
  }
})

io.on('connection', (socket) => {
  const userId = socket.userId
  if (userId) {
    socket.join(`user:${userId}`)
    console.log(`🔌 Socket connected: user ${userId} (${socket.id})`)
  }

  // Handle typing indicators
  socket.on('typing:start', (data) => {
    console.log(`⌨️ Typing start from ${userId} to ${data.recipientId}`)
    socket.to(`user:${data.recipientId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userId
    })
  })

  socket.on('typing:stop', (data) => {
    socket.to(`user:${data.recipientId}`).emit('typing:stop', {
      conversationId: data.conversationId,
      userId
    })
  })

  // Handle message events (for real-time messaging)
  socket.on('message:send', (data) => {
    console.log(`💬 Message from ${userId} to ${data.recipientId}`)
    socket.to(`user:${data.recipientId}`).emit('message:new', data.message)
  })

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: user ${userId} (${reason})`)
  })

  socket.on('error', (err) => {
    console.error(`❌ Socket error for user ${userId}:`, err.message)
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Socket server running on port ${port}`)
  console.log(`📡 WebSocket path: /socket.io`)
})
