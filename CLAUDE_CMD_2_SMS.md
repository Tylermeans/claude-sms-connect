# Claude Relay — Remote Terminal Responder for Claude Code

## What This Is

A lightweight relay system that lets you respond to Claude Code prompts from your phone when you're away from your computer. When Claude Code gets stuck waiting for input or permission, it sends a push notification to your phone with context about what it needs. You tap in, type your response, and it gets piped back into the terminal — no SSH required.

**This is NOT a chatbot or Claude API wrapper.** It simply bridges your phone to a running `tmux` session where Claude Code is active.

---

## Architecture Overview

```
┌──────────────────┐   HTTP POST    ┌──────────────────┐  WebSocket   ┌──────────────────┐
│   Claude Code    │ ────────────► │   Relay Server   │ ◄──────────► │    Phone PWA     │
│  (runs in tmux)  │               │  (Node/Express)  │              │   (React app)    │
│                  │ tmux send-keys │                  │              │                  │
│                  │ ◄──────────── │                  │              │                  │
└──────────────────┘               └──────────────────┘              └──────────────────┘
        │                                  │
        │  Claude Code Hook fires ──►  /api/notify endpoint receives context
        │                                  │
        │                           Server scrapes tmux pane for full context
        │                                  │
        │                           Pushes payload to phone via WebSocket
        │                                  │
        │                           User types response on phone
        │                                  │
        │  ◄──── tmux send-keys pipes response back into terminal session
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Server | Node.js + Express + Socket.io | Simple, fast, great WebSocket support |
| Phone Client | React PWA (Vite) | Installable on phone, no app store needed |
| Terminal Mgmt | tmux | Session persistence, `send-keys` for input injection, `capture-pane` for context |
| Auth | Shared bearer token | Simple, sufficient for local/tailnet use |
| Push Fallback | ntfy.sh (optional) | Wake the phone when WebSocket disconnects |

---

## Project Structure

```
claude-relay/
├── CLAUDE.md                    # ← You are here. Project spec for the AI builder.
├── package.json                 # Root workspace config
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts             # Express + Socket.io server entrypoint
│   │   ├── routes/
│   │   │   └── notify.ts        # POST /api/notify — receives Claude Code hook payloads
│   │   ├── services/
│   │   │   ├── tmux.ts          # tmux interaction: send-keys, capture-pane, list-sessions
│   │   │   └── pusher.ts        # WebSocket push + optional ntfy.sh fallback
│   │   ├── middleware/
│   │   │   └── auth.ts          # Bearer token validation middleware
│   │   └── types.ts             # Shared TypeScript interfaces
│   ├── tsconfig.json
│   └── .env.example             # AUTH_TOKEN, TMUX_SESSION, PORT, NTFY_TOPIC
├── client/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json        # PWA manifest for installability
│   │   └── sw.js                # Service worker for offline + push notifications
│   └── src/
│       ├── main.tsx             # React entrypoint
│       ├── App.tsx              # Root component, socket connection manager
│       ├── components/
│       │   ├── TerminalContext.tsx   # Shows last N lines from tmux pane
│       │   ├── ResponseInput.tsx    # Text input + send button for custom responses
│       │   ├── QuickActions.tsx     # Preset buttons: "y", "n", "continue", "skip", etc.
│       │   ├── SessionPicker.tsx    # Dropdown to select active tmux session
│       │   ├── ConnectionStatus.tsx # Shows WebSocket connection state
│       │   └── NotificationBanner.tsx # In-app notification when new prompt arrives
│       ├── hooks/
│       │   ├── useSocket.ts     # Socket.io connection hook with reconnect logic
│       │   └── useNotification.ts # Browser Notification API hook
│       ├── lib/
│       │   └── api.ts           # HTTP helpers for REST endpoints
│       └── styles/
│           └── global.css       # Mobile-first responsive styles
├── hooks/                       # Claude Code hook configs (copy into ~/.claude/)
│   └── claude-relay-hook.json   # Ready-to-use hook configuration
└── scripts/
    └── setup.sh                 # One-command setup: installs deps, generates token, prints instructions
```

---

## Detailed Component Specs

### 1. Server (`server/src/index.ts`)

**Entrypoint that wires everything together.**

```
- Create Express app
- Attach Socket.io server (CORS configured for client origin)
- Apply auth middleware to all /api routes
- Apply auth to Socket.io via handshake query param: io({ auth: { token } })
- Mount routes
- On startup, verify tmux is available (child_process.execSync('which tmux'))
- Listen on PORT (default 3000)
- In production, serve client/dist as static files so only one port is needed
```

**Environment variables (.env):**

```env
# REQUIRED
AUTH_TOKEN=             # Shared secret. setup.sh generates via: openssl rand -hex 32
TMUX_SESSION=claude     # Default tmux session name to target

# OPTIONAL
PORT=3000               # Server port
NTFY_TOPIC=             # If set, also sends push via ntfy.sh as WebSocket fallback
CLIENT_ORIGIN=http://localhost:5173   # CORS origin for dev. In prod, set to Tailscale IP.
```

### 2. Notify Route (`server/src/routes/notify.ts`)

**POST /api/notify** — Called by Claude Code's Notification hook.

```typescript
// Expected request body (from Claude Code hook):
interface HookPayload {
  session_id?: string;
  cwd?: string;
  message?: string;
  notification_type?: string;  // "idle_prompt" | "permission_prompt" | etc.
  hook_event_name?: string;    // "Notification" | "Stop"
}

// What the route does:
// 1. Parse the hook payload from request body
// 2. Call tmuxService.capturePaneContext() to get the last 30 lines of terminal output
//    - This gives the phone user REAL context about what Claude is asking
// 3. Build a notification payload:
//    {
//      type: payload.notification_type || payload.hook_event_name,
//      message: payload.message,
//      terminalContext: <last 30 lines from tmux>,
//      cwd: payload.cwd,
//      timestamp: Date.now()
//    }
// 4. Call pusherService.push(notificationPayload)
// 5. Return 200 OK
```

### 3. Tmux Service (`server/src/services/tmux.ts`)

**All tmux interaction lives here. Uses child_process.exec for all commands.**

```typescript
// NOTE: All exec calls should be promisified (util.promisify)
// and wrapped in try/catch with meaningful error messages.

class TmuxService {
  constructor(private sessionName: string) {}

  // Get last N lines of terminal output for context
  // Command: tmux capture-pane -t {session} -p -S -{lines}
  async capturePaneContext(lines: number = 30): Promise<string>

  // Send keystrokes to the tmux session
  // Command: tmux send-keys -t {session} -l "{input}" Enter
  //   → Use -l flag for LITERAL mode to avoid key binding interpretation
  // IMPORTANT: Escape double quotes and special chars in the input!
  async sendKeys(input: string): Promise<void>

  // Send a special key (like Escape, Ctrl+C, etc.)
  // Command: tmux send-keys -t {session} {key}
  //   → These are NOT literal, they're tmux key names
  async sendSpecialKey(key: 'Escape' | 'C-c' | 'Enter' | 'y' | 'n'): Promise<void>

  // List available tmux sessions (for session picker on phone)
  // Command: tmux list-sessions -F "#{session_name}:#{session_activity}"
  async listSessions(): Promise<Array<{ name: string; lastActivity: number }>>

  // Check if the session exists
  // Command: tmux has-session -t {session}
  async sessionExists(): Promise<boolean>
}
```

### 4. Pusher Service (`server/src/services/pusher.ts`)

**Manages pushing notifications to connected phone clients.**

```typescript
class PusherService {
  constructor(private io: SocketIOServer, private ntfyTopic?: string) {}

  // Push notification payload to all connected clients via WebSocket.
  // If no clients connected AND ntfyTopic is set, POST to ntfy.sh as fallback:
  //   fetch(`https://ntfy.sh/${ntfyTopic}`, {
  //     method: 'POST',
  //     body: `Claude Code needs attention: ${payload.type}`,
  //     headers: { 'Title': 'Claude Relay', 'Priority': 'high' }
  //   })
  async push(payload: NotificationPayload): Promise<void>
}
```

### 5. Auth Middleware (`server/src/middleware/auth.ts`)

**Simple bearer token check.**

```typescript
// Express middleware:
// - Check Authorization header for "Bearer {AUTH_TOKEN}"
// - If missing/wrong, return 401
// - Otherwise next()

// Socket.io auth (in io.use() middleware):
// - Check socket.handshake.auth.token
// - If missing/wrong, call next(new Error('Authentication failed'))
```

### 6. Phone Client — Key Components

#### App.tsx
```
- Manages Socket.io connection lifecycle
- On first load, shows token input screen — stores token in localStorage
- Also stores server URL (defaults to window.location.origin)
- Constructs socket connection with auth: { token }
- Listens for 'notification' events from server
- Plays notification sound + vibration (navigator.vibrate) on new notification
- Layout: ConnectionStatus (top bar), TerminalContext (scrollable middle),
  QuickActions + ResponseInput (sticky bottom)
```

#### TerminalContext.tsx
```
- Receives terminal output string (last 30 lines) from notification payload
- Renders in a monospace, dark-themed, scrollable <pre> container
- Auto-scrolls to bottom on new content
- Strip ANSI escape codes for clean display (simple regex or ansi-to-html lib)
- Should feel like a mini terminal on your phone
- Show timestamp of when this context was captured
- "Refresh" button to request fresh capture via socket event
```

#### QuickActions.tsx
```
- Grid of preset buttons for common responses:
  - "y" (approve/yes)        — most common, make it largest
  - "n" (deny/no)
  - "continue"
  - "skip"
  - "Ctrl+C" (abort)         — sends special key C-c
  - "Esc" (escape)           — sends special key Escape
- Each button emits socket event: { type: 'quick_action', key: 'y' }
- Server calls tmuxService.sendKeys() or sendSpecialKey() accordingly
- Buttons MUST be large (min 48px height), high contrast, easy to tap one-handed
- Brief visual feedback on tap (color flash + "Sent ✓")
```

#### ResponseInput.tsx
```
- Text input + send button for freeform typed responses
- On submit: emit socket event { type: 'response', text: userInput }
- Server calls tmuxService.sendKeys(text)
- Auto-focus input field when new notification arrives
- Clear input after sending
- Show brief "Sent ✓" confirmation
- Support Enter key to submit (but also have the button for phone keyboards)
```

#### SessionPicker.tsx
```
- On mount + on refresh click, emits socket event to request sessions list
- Server calls tmuxService.listSessions() and responds
- Dropdown/select to pick which tmux session to target
- Emits socket event: { type: 'switch_session', session: name }
- Server updates target session for this socket connection
- Show current active session name prominently
```

#### ConnectionStatus.tsx
```
- Shows connection state: 🟢 Connected / 🟡 Reconnecting / 🔴 Disconnected
- If disconnected > 10s, show "Check your network connection" message
- Thin bar at very top of app, non-intrusive
- Tap to see more details (server URL, session name, uptime)
```

### 7. PWA Configuration

#### manifest.json
```json
{
  "name": "Claude Relay",
  "short_name": "Relay",
  "description": "Respond to Claude Code prompts from your phone",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#e94560",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Generate placeholder icons** during setup (a simple colored square with "CR" text is fine for v1).

#### Service Worker (sw.js)
```
- Basic cache-first strategy for static assets (CSS, JS, icons)
- Listen for push events (for future Web Push integration)
- Show browser notification on push event with payload title/body
- Minimal — don't over-engineer for v1
```

### 8. Claude Code Hook Configuration

**File: `hooks/claude-relay-hook.json`**

This is what the user copies into their `~/.claude/settings.json` under the `hooks` key. The setup script should auto-substitute the token.

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/notify -H 'Content-Type: application/json' -H 'Authorization: Bearer YOUR_TOKEN_HERE' -d '{\"notification_type\": \"notification\", \"message\": \"Claude needs input\", \"cwd\": \"'\"$CLAUDE_PROJECT_DIR\"'\", \"hook_event_name\": \"Notification\"}' > /dev/null 2>&1"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/notify -H 'Content-Type: application/json' -H 'Authorization: Bearer YOUR_TOKEN_HERE' -d '{\"hook_event_name\": \"Stop\", \"message\": \"Task complete\", \"cwd\": \"'\"$CLAUDE_PROJECT_DIR\"'\"}' > /dev/null 2>&1"
          }
        ]
      }
    ]
  }
}
```

### 9. Setup Script (`scripts/setup.sh`)

```bash
#!/bin/bash
# This script should:
#
# 1. Check for required tools: node >= 18, npm, tmux
#    - If missing, print install instructions and exit
#
# 2. Generate a random AUTH_TOKEN:
#    TOKEN=$(openssl rand -hex 32)
#
# 3. Create server/.env from server/.env.example with generated token
#
# 4. Run npm install in both server/ and client/
#
# 5. Generate placeholder PWA icons (192x192 and 512x512 PNGs)
#    - Use a simple node script or ImageMagick if available
#    - Fallback: create a basic SVG and convert, or just a colored square
#
# 6. Substitute token into hooks/claude-relay-hook.json → hooks/claude-relay-hook-configured.json
#
# 7. Print setup instructions:
#    a. How to start: "npm run dev" in server/ and client/
#    b. How to add the hook: copy the configured JSON into ~/.claude/settings.json
#    c. How to start Claude Code in tmux: tmux new -s claude && claude
#    d. How to access from phone:
#       - Same wifi: http://<detected-local-ip>:5173
#       - Remote: Install Tailscale → http://<tailscale-ip>:5173
#    e. Reminder: "Add to Home Screen" on phone for PWA install
#    f. Print the generated AUTH_TOKEN so user can enter it in the phone app
```

---

## Socket.io Event Reference

### Client → Server

| Event | Payload | Server Action |
|-------|---------|---------------|
| `response` | `{ text: string }` | `tmux.sendKeys(text)` — types freeform text into tmux |
| `quick_action` | `{ key: string }` | `tmux.sendSpecialKey(key)` or `tmux.sendKeys(key)` |
| `switch_session` | `{ session: string }` | Update this connection's target tmux session |
| `refresh_context` | `{}` | `tmux.capturePaneContext()` → emit `context_update` back |
| `list_sessions` | `{}` | `tmux.listSessions()` → emit `sessions_list` back |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `notification` | `{ type, message, terminalContext, cwd, timestamp }` | Claude Code needs attention |
| `context_update` | `{ lines: string, timestamp: number }` | Fresh terminal context snapshot |
| `send_confirmed` | `{ text: string, timestamp: number }` | Confirms input was sent to tmux |
| `error` | `{ message: string }` | Error (session not found, tmux error, etc.) |
| `sessions_list` | `Array<{ name, lastActivity }>` | Available tmux sessions |

---

## REST API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/notify` | Bearer | Receive Claude Code hook payloads |
| GET | `/api/sessions` | Bearer | List available tmux sessions |
| GET | `/api/context` | Bearer | Get current tmux pane output |
| POST | `/api/send` | Bearer | Send input to tmux (HTTP fallback) |
| GET | `/api/health` | None | Health check → `{ ok: true, tmux: true/false }` |

---

## Design Guidelines for Phone Client

**This app is used on a phone with one hand, often in a hurry. Optimize for speed and clarity.**

### Visual Design
- **Dark theme** — dark background, light text, easy on eyes
- **Color palette**: Background `#1a1a2e`, primary `#e94560`, secondary `#0f3460`, surface `#16213e`, text `#eeeeee`
- **Terminal section**: monospace font (system monospace), dark bg `#0a0a1a`, green/white text
- **Minimal chrome** — no navbars, no sidebars, no hamburger menus

### Layout (top to bottom)
1. **Connection bar** — thin strip, connection status + session name (8% height)
2. **Terminal context** — scrollable monospace area showing what Claude printed (55% height)
3. **Quick actions** — grid of large tap-friendly buttons (20% height)
4. **Text input** — input field + send button, sticky at bottom (17% height)

### Interaction
- All buttons minimum **48px height**, ideally 56px
- Touch feedback on all interactive elements (scale + color shift)
- **"y" button should be visually dominant** — it's the most common action
- Vibrate on new notification: `navigator.vibrate(200)`
- Auto-focus text input when notification arrives
- "Sent ✓" toast appears briefly after any action

---

## Build & Run Commands

```bash
# Development (run in separate terminals)
cd server && npm run dev     # nodemon + ts-node
cd client && npm run dev     # Vite dev server with HMR

# Production build
cd server && npm run build && npm start    # Compiles TS → dist/, runs with node
cd client && npm run build                 # Outputs to dist/

# In production, the server serves the client's built files:
#   if (process.env.NODE_ENV === 'production') {
#     app.use(express.static(path.join(__dirname, '../../client/dist')));
#     app.get('*', (req, res) => res.sendFile(/* client index.html */));
#   }
# This way only one port (3000) is needed.
```

---

## Critical Implementation Notes

1. **tmux send-keys escaping** — User input MUST be sanitized before passing to shell. Use `tmux send-keys -l` (literal mode) to prevent key binding interpretation. Still escape shell metacharacters in the exec call. Consider using `child_process.execFile` with args array instead of string interpolation.

2. **Per-connection session tracking** — Store the active tmux session per Socket.io connection, not globally. This allows multiple phone clients to target different sessions.

3. **Reconnection** — Socket.io has built-in reconnection. Client should show last known terminal context even after reconnect, and auto-request a fresh capture on reconnect.

4. **Sensitive data in terminal output** — Terminal context may contain secrets. Add a configurable regex filter to strip common patterns before sending to client:
   - Lines matching `export.*KEY=`, `Authorization:`, `Bearer `, `password`, `secret`
   - Make this configurable via env var: `SENSITIVE_PATTERNS`

5. **Rate limiting** — Add basic rate limiting to `/api/notify` (max 1 notification per 5 seconds) to prevent hook misfires from flooding the phone with notifications.

6. **Error resilience** — If tmux session doesn't exist when a hook fires, the server should not crash. Log the error, return 200 to the hook (so Claude Code doesn't hang), and emit an error event to connected clients.

7. **Hook environment variables** — Claude Code hooks expose `$CLAUDE_PROJECT_DIR` and other env vars. The hook JSON above uses these. See Claude Code hooks docs for the full list.

---

## Testing Checklist

Before considering this complete, verify:

- [ ] `setup.sh` runs cleanly on a fresh machine with node + tmux installed
- [ ] Server starts and `/api/health` returns ok
- [ ] Can manually POST to `/api/notify` and see it arrive on the phone client
- [ ] Quick action buttons ("y", "n", etc.) actually type into the tmux session
- [ ] Freeform text input works, including with special characters
- [ ] Session picker shows real tmux sessions and switching works
- [ ] "Refresh" updates terminal context on demand
- [ ] PWA is installable (Add to Home Screen works on phone)
- [ ] Connection status accurately reflects WebSocket state
- [ ] Auth rejects requests without valid token
- [ ] ntfy.sh fallback fires when no WebSocket clients are connected (if configured)

---

## Future Enhancements (Out of Scope for v1)

- Web Push notifications via service worker (replace ntfy.sh)
- Multiple simultaneous phone connections
- Terminal output streaming (live tail instead of snapshots)
- Saved response templates per project
- E2E encryption for terminal context
- Desktop Electron wrapper
