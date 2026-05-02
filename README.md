# play.2k

a chill combat surf frutiger aero game 

An isometric multiplayer shooter built with Next.js + Three.js, with a server-authoritative Node.js game server.

## Architecture

The project is split into two processes:

| Process | What it does | Port |
|---|---|---|
| **Next.js frontend** (`app/`, `components/`) | Renders the Three.js scene, sends input, receives snapshots | 3000 |
| **Game server** (`server/`) | Runs the authoritative game loop at 20 Hz, validates movement, broadcasts state | 3001 |

The client sends raw input (`WASD` + mouse rotation) and the server moves every player, enforcing speed and bounds. The client uses local prediction to stay responsive and reconciles toward the server position each frame.

## Local development

Run both processes in separate terminals:

```bash
# Terminal 1 — Next.js frontend
npm run dev

# Terminal 2 — Game server (hot-reloads via tsx)
npm run dev:server
```

Open http://localhost:3000. The client connects to `ws://localhost:3001` by default.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_SERVER_URL` | `ws://localhost:3001` | WebSocket URL the browser connects to |
| `PORT` | `3001` | Port the game server listens on |

Set `NEXT_PUBLIC_SERVER_URL` in `.env.local` for local overrides, or in your hosting dashboard for production.

## Deploying to production

The frontend and game server must be deployed **separately** — the game server is a long-lived stateful process and cannot run on serverless platforms like Vercel or Netlify.

### Frontend → Vercel (recommended)

1. Push to GitHub and import the repo in Vercel.
2. Add the env var `NEXT_PUBLIC_SERVER_URL=wss://your-game-server.fly.dev` in the Vercel dashboard.
3. Deploy — Vercel handles the Next.js build automatically.

### Game server → Fly.io (recommended)

Fly.io is purpose-built for persistent, low-latency WebSocket servers and has a generous free tier.

1. Install the Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. From the project root:

```bash
fly launch --no-deploy          # creates fly.toml, pick a region close to your players
fly secrets set PORT=3001
fly deploy
```

A minimal `fly.toml` for this server:

```toml
app = "project-foobar-server"

[build]
  dockerfile = "server/Dockerfile"

[[services]]
  internal_port = 3001
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
```

#### `server/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY dist/server/ ./dist/server/
CMD ["node", "dist/server/index.js"]
```

Build the server before deploying: `npm run build:server`

### Scaling

| Concurrent players | Recommended setup |
|---|---|
| < 100 | Single Fly.io `shared-cpu-1x` instance (~$3-5/mo) |
| 100–1 000 | Single `performance-1x` instance + room sharding |
| 1 000+ | Multiple instances + a Redis pub/sub relay between shards |

The `Room` class in `server/Room.ts` is the natural boundary for sharding — each room runs an independent game loop, and you can route players into rooms by a `roomId` query param on the WebSocket URL.

## Adding features

- **Shooting**: add a `shoot` client message type; server validates rate-of-fire, spawns a projectile in the room's game loop, broadcasts hits.
- **Building**: add a `placeBlock` message; server validates position and collision, adds to a world-state map, includes in snapshots.
- **Chat**: add a `chat` message; server relays directly — no physics needed, just broadcast to the room.

All new features follow the same pattern: client sends intent, server validates and mutates state, snapshot broadcasts the result.
