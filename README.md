# RuneClipy Discord Bot

Standalone Discord bot service for the RuneClipy platform.  
Runs separately from the Next.js web app — deploy on **Railway**, **Render**, or any Node.js host.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create .env from example
cp .env.example .env
# Edit .env and add your MONGODB_URI

# Run in development
npm run dev

# Run in production
npm start
```

## 🔧 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ Yes | MongoDB connection string (same as web app) |
| `DISCORD_BOT_TOKEN` | ❌ Optional | Can also be set from admin dashboard |

## 📦 Deploy to Railway

1. Push this folder to a GitHub repo
2. Create a new project on [Railway](https://railway.app)
3. Connect the repo
4. Add `MONGODB_URI` as environment variable
5. Railway will auto-detect `npm start`

## 📦 Deploy to Render

1. Push this folder to a GitHub repo
2. Create a new **Background Worker** on [Render](https://render.com)
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add `MONGODB_URI` as environment variable

## 🔄 How It Works

The bot polls MongoDB every 5 seconds for commands from the admin dashboard:
- **start** → Connect to Discord
- **stop** → Disconnect
- **restart** → Stop then start
- **idle** → Do nothing

Bot status (online/offline/error), ping, guild count, and heartbeat are stored in MongoDB and displayed on the admin dashboard in real-time.

## ⚙️ Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌────────────────┐
│  Admin Dashboard │────▶│   MongoDB   │◀────│  Discord Bot   │
│  (Vercel)        │     │  (Atlas)    │     │  (Railway)     │
└─────────────────┘     └─────────────┘     └────────────────┘
```

The web app and bot communicate through MongoDB — no direct connection needed.
