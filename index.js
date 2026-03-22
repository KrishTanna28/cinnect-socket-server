import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

const port = parseInt(process.env.PORT, 10) || 3001

const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  res.writeHead(404)
  res.end()
})

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})

// Authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) {
    return next(new Error('Authentication required'))
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    socket.userId = decoded.userId || decoded.id
    next()
  } catch (err) {
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

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: user ${userId} (${reason})`)
  })
})

// Export io for external notification triggers (via HTTP endpoint)
// API to emit notifications from your Next.js backend
server.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/emit') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        // Verify internal API key
        const apiKey = req.headers['x-api-key']
        if (apiKey !== process.env.INTERNAL_API_KEY) {
          res.writeHead(401)
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }

        const { event, room, data } = JSON.parse(body)
        if (room) {
          io.to(room).emit(event, data)
        } else {
          io.emit(event, data)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (err) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Socket server running on port ${port}`)
})
