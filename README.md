# Cinnect Socket Server

Standalone WebSocket server for real-time notifications and messaging. Deploy separately from the Next.js app which runs on Vercel.

## Deployment Options

### Option 1: Railway (Recommended)

1. Push the `socket-server` folder to a separate GitHub repo or use Railway's CLI
2. Go to [railway.app](https://railway.app)
3. Create new project → Deploy from GitHub
4. Set environment variables:
   ```
   PORT=3001
   JWT_SECRET=<same as your Vercel app>
   ALLOWED_ORIGINS=https://your-app.vercel.app
   INTERNAL_API_KEY=<generate a secure key>
   ```
5. Railway will auto-detect the Dockerfile and deploy
6. Copy the deployment URL (e.g., `https://cinnect-socket.up.railway.app`)

### Option 2: Render

1. Push to GitHub
2. Go to [render.com](https://render.com)
3. New → Web Service → Connect repo
4. Set environment:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add environment variables (same as above)
6. Deploy

### Option 3: Fly.io

1. Install flyctl: `curl -L https://fly.io/install.sh | sh`
2. Run in socket-server directory:
   ```bash
   fly launch
   fly secrets set JWT_SECRET=xxx ALLOWED_ORIGINS=xxx INTERNAL_API_KEY=xxx
   fly deploy
   ```

## Vercel Configuration

After deploying the socket server, add these environment variables to your Vercel project:

```
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server-url.com
SOCKET_SERVER_URL=https://your-socket-server-url.com
SOCKET_INTERNAL_API_KEY=<same key you set on the socket server>
```

## Local Development

To run locally alongside your Next.js app:

```bash
cd socket-server
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

Then set in your Next.js `.env.local`:
```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
SOCKET_SERVER_URL=http://localhost:3001
SOCKET_INTERNAL_API_KEY=your_local_key
```

## Architecture

```
┌─────────────┐     HTTP/REST      ┌─────────────────┐
│   Vercel    │ ──────────────────>│  Socket Server  │
│  (Next.js)  │                    │   (Railway)     │
└─────────────┘                    └─────────────────┘
       │                                   │
       │ REST API                          │ WebSocket
       │                                   │
       ▼                                   ▼
┌─────────────────────────────────────────────────────┐
│                     Browser                          │
│  (HTTP requests to Vercel, WebSocket to Socket srv) │
└─────────────────────────────────────────────────────┘
```

When your Next.js API needs to send a real-time notification:
1. API route calls `emitNotification()` from `socketServer.js`
2. Since there's no local `io` instance on Vercel, it sends HTTP POST to the socket server
3. Socket server emits the event to connected clients
