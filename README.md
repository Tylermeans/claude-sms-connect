# Claude SMS Connect

Respond to Claude Code prompts from your phone via SMS. When Claude Code needs input — a Y/N approval, a file path, a design decision — it texts you. You text back, and your response gets piped straight into the terminal.

No app to install. No browser needed. Just SMS.

```
┌──────────────────┐   HTTP POST    ┌──────────────────┐    Twilio API   ┌──────────────────┐
│   Claude Code    │ ────────────► │   Relay Server   │ ──────────────► │    Your Phone    │
│  (runs in tmux)  │               │  (Node/Express)  │                 │     (SMS)        │
│                  │ tmux send-keys │                  │ ◄────────────── │                  │
│                  │ ◄──────────── │  Twilio webhook  │  Inbound SMS    │                  │
└──────────────────┘               └──────────────────┘                 └──────────────────┘
```

## Prerequisites

- **Node.js 22+** — `node -v` to check
- **tmux** — `brew install tmux` on macOS
- **Twilio account** — [sign up](https://www.twilio.com/try-twilio) (free trial works)
- **ngrok** — `brew install ngrok` (to expose webhook endpoint to Twilio)

## Quick Start

### 1. Clone and set up

```bash
git clone <your-repo-url> claude-sms-connect
cd claude-sms-connect
npm run setup
```

The setup script will:
- Generate a cryptographically secure auth token
- Create your `.env` file from the template
- Install dependencies
- Print next steps

### 2. Add your Twilio credentials

Edit `.env` and fill in your Twilio details:

```bash
# From https://console.twilio.com (Account Info section)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# Your Twilio phone number (the one that sends/receives SMS)
TWILIO_PHONE_NUMBER=+15551234567

# Your personal phone number (where you receive alerts)
USER_PHONE_NUMBER=+15559876543
```

### 3. Start the server

```bash
npm run dev
```

You should see:

```
Claude SMS Connect server listening on port 3000
Health check: http://localhost:3000/health
Notification endpoint: http://localhost:3000/api/notify
SMS webhook endpoint: http://localhost:3000/sms/inbound
```

### 4. Start ngrok tunnel

In a separate terminal:

```bash
ngrok http 3000
```

Copy the `https://` forwarding URL (e.g., `https://abc123.ngrok-free.app`).

### 5. Configure Twilio webhook

1. Go to [Twilio Console > Phone Numbers > Active Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your Twilio phone number
3. Under **Messaging > A message comes in**, set:
   - Webhook URL: `https://YOUR-NGROK-URL/sms/inbound`
   - Method: `POST`
4. Save

### 6. Configure the Claude Code hook

Claude Code needs to know to call your relay server when it needs input. There are two ways to set this up:

**Option A: Use the included hook script**

```bash
# Copy the hook script
cp hooks/claude-code-hook.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/claude-code-hook.sh

# Edit the AUTH_TOKEN to match your .env
nano ~/.claude/hooks/claude-code-hook.sh
```

Then add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/claude-code-hook.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Option B: Inline curl command**

Add directly to `~/.claude/settings.json` (replace `YOUR_AUTH_TOKEN`):

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/notify -H 'Authorization: Bearer YOUR_AUTH_TOKEN' -H 'Content-Type: application/json' -d '{\"session_id\": \"'\"$CLAUDE_SESSION_ID\"'\", \"project_id\": \"'\"$(basename $CLAUDE_PROJECT_DIR)\"'\", \"project_name\": \"'\"$(basename $CLAUDE_PROJECT_DIR)\"'\", \"tmux_session\": \"'\"$CLAUDE_SESSION_ID\"'\"}' --max-time 5 > /dev/null 2>&1 || true",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### 7. Run Claude Code inside tmux

Claude SMS Connect uses tmux to capture terminal context and pipe responses back. Your Claude Code session must be running inside a tmux session.

```bash
# Create a named tmux session
tmux new-session -s my-project

# Inside tmux, run Claude Code
claude
```

### 8. Arm the system

Text **ON** to your Twilio number from your phone. You'll get a confirmation:

```
SMS notifications ARMED. You will receive alerts when Claude Code needs input.
```

Now walk away. When Claude Code needs input, you'll get a text.

## Usage

### Replying to prompts

**Single project running:**

```
Claude Code needs input:

Allow file write to src/index.ts?
> ...terminal context...

Reply Y/N or text response
```

Reply with just your answer:
- `Y` — approve
- `N` — deny
- `use the auth middleware instead` — freeform response

**Multiple projects running:**

```
[1] my-api
[2] my-frontend

Latest (my-api):
Allow npm install express?

Reply: N RESPONSE (e.g., "1 Y")
```

Reply with the project number + your answer:
- `1 Y` — approve for my-api
- `2 N` — deny for my-frontend
- `1 use redis instead` — freeform to my-api

### Control commands

| Command | Effect |
|---------|--------|
| `ON`    | Arm notifications — start receiving SMS alerts |
| `OFF`   | Disarm notifications — silence all alerts |

Notifications are **off by default**. You must text ON to start receiving them.

### Welcome messages

When a new project first triggers a notification (and the system is armed), you'll receive a welcome SMS:

```
Welcome! "my-project" registered with Claude SMS Connect.

Reply with "N Y" where N is the project number.
Text ON to arm alerts, OFF to disarm.
```

## How It Works

1. **Claude Code hook fires** — when Claude Code needs input, it calls your hook script
2. **Hook sends POST to relay server** — `POST /api/notify` with project info and bearer token auth
3. **Server returns 200 immediately** — never blocks Claude Code (processes async)
4. **Server captures tmux context** — grabs last 8 lines of terminal output via `tmux capture-pane`
5. **Server redacts sensitive data** — strips API keys, tokens, passwords (13 patterns) before sending
6. **Server sends SMS via Twilio** — formatted with project context and reply instructions
7. **You text back** — your reply hits the Twilio webhook at `/sms/inbound`
8. **Server validates Twilio signature** — confirms the SMS is genuinely from Twilio
9. **Server parses your reply** — handles numbered responses, Y/N, freeform text
10. **Server pipes response to tmux** — `tmux send-keys -l` (literal mode, prevents injection) + Enter

## Security

- **Bearer token auth** on all `/api` routes — timing-safe comparison via `crypto.timingSafeEqual`
- **Twilio signature validation** on all `/sms` routes — verifies webhook authenticity
- **Sensitive data redaction** — AWS keys, GitHub tokens, OpenAI keys, JWTs, passwords, private key blocks are all redacted before SMS
- **Shell injection prevention** — all tmux commands use `execFile` with args arrays (never `exec` with string interpolation)
- **Literal send-keys** — `-l` flag prevents tmux from interpreting user input as key bindings
- **Phone number authorization** — only SMS from your configured `USER_PHONE_NUMBER` are accepted
- **GSM-7 encoding** — non-ASCII stripped to force 160 chars/segment (cost optimization)

## Project Structure

```
src/
├── index.ts                    # Express server entry point
├── types.ts                    # TypeScript type definitions
├── lib/
│   ├── redact.ts               # Sensitive data redaction (13 patterns)
│   ├── redact.test.ts          # 34 redaction tests
│   └── sanitize.ts             # SMS formatting pipeline (ANSI strip → redact → truncate)
├── middleware/
│   ├── auth.ts                 # Bearer token authentication
│   ├── rate-limit.ts           # Per-project rate limiting (1 per 5s)
│   └── twilio-auth.ts          # Twilio signature validation
├── routes/
│   ├── notify.ts               # POST /api/notify — hook receiver
│   └── sms.ts                  # POST /sms/inbound — Twilio webhook
└── services/
    ├── project-registry.ts     # Multi-project state tracking
    ├── tmux.ts                 # tmux capture/send-keys (injection-safe)
    └── twilio.ts               # Twilio SMS client
scripts/
└── setup.js                    # One-command setup automation
hooks/
└── claude-code-hook.sh         # Ready-to-use Claude Code hook script
```

## Troubleshooting

**"System disarmed" in server logs, no SMS received**
Text `ON` to your Twilio number. Notifications are off by default.

**"Twilio credentials not configured"**
Check your `.env` has `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` set.

**"No tmux session identifier found"**
Make sure Claude Code is running inside a tmux session, and the hook script includes `tmux_session` in the payload.

**"Invalid project number"**
You sent a numbered reply but the project index was wrong. The numbers in the SMS correspond to the order projects registered. If projects have restarted, numbers may have changed.

**SMS not arriving**
1. Check server logs — is the notification reaching the server?
2. Verify ngrok is running and the tunnel URL matches your Twilio webhook config
3. Check Twilio Console > Messaging > Logs for delivery errors

**Reply not reaching Claude Code**
1. Confirm tmux session is still running: `tmux list-sessions`
2. Check server logs for routing messages
3. Verify the session name in the hook payload matches the tmux session

**Rate limited**
Notifications are throttled to 1 per 5 seconds per project. If Claude Code fires hooks rapidly, some will be silently dropped.

## API Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | None | Health check |
| `/api/notify` | POST | Bearer token | Receive Claude Code hook notifications |
| `/sms/inbound` | POST | Twilio signature | Receive inbound SMS from Twilio |

## License

ISC
