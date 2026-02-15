# Stack Research

**Domain:** SMS-based terminal relay system
**Researched:** 2026-02-15
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS | Server runtime | Stable LTS, native ES modules, great child_process support for tmux |
| Express | 4.x | HTTP server | Simple, mature, minimal — perfect for a handful of webhook routes |
| TypeScript | 5.x | Type safety | Twilio SDK is written in TS, types help with webhook payload handling |
| Twilio Node SDK | 5.x | SMS send/receive | Official SDK, TypeScript-native since v4, handles signature validation |
| tmux | system | Terminal session management | Industry standard for persistent sessions, `send-keys` and `capture-pane` APIs |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 16.x | Environment config | Load .env file for AUTH_TOKEN, Twilio credentials, etc. |
| express-rate-limit | 7.x | Rate limiting | Prevent notification flooding from rapid hook fires |
| strip-ansi | 7.x | ANSI escape removal | Clean terminal output before including in SMS |
| ngrok | 5.x (npm) | Tunnel for webhooks | Expose local server for Twilio inbound SMS webhooks |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | Run TypeScript directly | Faster than ts-node, no tsconfig fuss for dev |
| nodemon | Auto-restart on changes | Pair with tsx for `nodemon --exec tsx src/index.ts` |

## Installation

```bash
# Core
npm install express twilio dotenv strip-ansi express-rate-limit

# Dev dependencies
npm install -D typescript @types/express @types/node tsx nodemon
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Express | Fastify | If you need built-in schema validation; overkill here |
| ngrok | Cloudflare Tunnel | Free, stable; good if you have a Cloudflare account |
| ngrok | localtunnel | Free, open-source; less reliable than ngrok |
| ngrok | Tailscale Funnel | If already on Tailscale; persistent URL without tunnel restarts |
| dotenv | Node --env-file | Node 22+ has native .env support; dotenv more flexible |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Socket.io | SMS replaces WebSockets entirely — no realtime browser connection needed | Twilio webhooks for bidirectional SMS |
| React/Vite/any frontend | No web UI — phone interaction is purely SMS | Twilio SMS |
| Vonage/MessageBird | Twilio has best webhook DX and Node SDK | Twilio |
| child_process.exec with string interpolation | Command injection risk with tmux send-keys | child_process.execFile with args array |

## Stack Patterns by Variant

**If using Tailscale already:**
- Use Tailscale Funnel instead of ngrok
- Persistent HTTPS URL, no tunnel restarts
- Set as Twilio webhook URL once

**If ngrok free tier is limiting:**
- Use Cloudflare Tunnel (free, stable)
- Or localtunnel (`npx localtunnel --port 3000`)

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| twilio@5.x | Node 18+ | Requires Node 18 minimum |
| express@4.x | Node 18+ | Express 5 is available but 4.x is battle-tested |
| strip-ansi@7.x | ESM only | Need `"type": "module"` in package.json or use dynamic import |

## Sources

- [Twilio npm package](https://www.npmjs.com/package/twilio) — version 5.11.2 verified
- [Twilio Node.js v4 announcement](https://www.twilio.com/en-us/blog/introducing-twilio-for-nodejs-v4) — TypeScript rewrite details
- [ngrok alternatives analysis](https://pinggy.io/blog/best_ngrok_alternatives/) — tunnel comparison

---
*Stack research for: SMS-based terminal relay*
*Researched: 2026-02-15*
