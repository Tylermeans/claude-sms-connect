# Claude SMS Connect

## What This Is

A lightweight relay system that lets you respond to Claude Code prompts from your phone via SMS when you're away from your computer. When Claude Code gets stuck waiting for input or permission, it sends an SMS to your phone with context about what it needs. You text back your response and it gets piped into the terminal — no app to install, no browser needed. Works across multiple simultaneous projects through a single SMS thread with numbered prompts.

**This is NOT a chatbot or Claude API wrapper.** It bridges your phone's SMS to running `tmux` sessions where Claude Code is active.

## Core Value

When you walk away from your computer, Claude Code doesn't stall — you can approve, deny, or respond to any prompt from your phone with a simple text message.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Relay server receives Claude Code hook payloads and sends SMS via Twilio
- [ ] SMS includes numbered prompts when multiple projects need input, with a few lines of terminal context
- [ ] User replies with number + response (e.g., "1 Y", "2 N", "3 use the auth middleware") to target specific projects
- [ ] Freeform text responses get piped back into the correct tmux session via `tmux send-keys`
- [ ] SMS alerts are off by default — text "ON" to arm, "OFF" to disarm
- [ ] Welcome SMS sent when a new project/repo is registered with the relay
- [ ] Quick responses: Y/N for approvals, plus freeform text for anything else
- [ ] Per-connection tmux session tracking — each project maps to its own tmux session
- [ ] Sensitive data filtering on terminal output before including in SMS
- [ ] Server runs on the same Mac as Claude Code — near-zero resource overhead

### Out of Scope

- PWA / phone app — SMS is the interface, no app needed
- Public internet exposure — local/Tailscale access only
- Web Push notifications — SMS replaces this entirely
- Multiple simultaneous phone clients — one phone number, one user
- Terminal output streaming — snapshot context in SMS is sufficient
- Desktop Electron wrapper
- E2E encryption
- OAuth or complex auth — bearer token for hook-to-server, Twilio handles SMS auth

## Context

The original spec (`CLAUDE_CMD_2_SMS.md`) described a PWA-based approach with WebSocket connections. This project pivots to SMS as the transport layer, which dramatically simplifies the architecture:

- No client app to build, install, or maintain
- No WebSocket connection management or reconnection logic
- No service worker or PWA configuration
- Works on any phone with SMS — no browser needed
- One Twilio number serves as the single interface across all projects

**Architecture:**

```
┌──────────────────┐   HTTP POST    ┌──────────────────┐    Twilio API   ┌──────────────────┐
│   Claude Code    │ ────────────► │   Relay Server   │ ──────────────► │    Your Phone    │
│  (runs in tmux)  │               │  (Node/Express)  │                 │     (SMS)        │
│                  │ tmux send-keys │                  │ ◄────────────── │                  │
│                  │ ◄──────────── │  Twilio webhook  │  Inbound SMS    │                  │
└──────────────────┘               └──────────────────┘                 └──────────────────┘
```

**Flow:**
1. Claude Code hook fires → POST to relay server
2. Server scrapes tmux pane for context
3. Server sends SMS via Twilio with numbered prompt + context
4. User texts back (e.g., "1 Y")
5. Twilio webhook delivers reply to server
6. Server parses reply, maps to correct tmux session, sends keys

**SMS Format — Outbound:**
```
[1] claude-sms-connect (Phase 2)
Claude asks: Allow file write to src/index.ts?
> ...last 3-4 lines of terminal context...

Reply: 1 Y / 1 N / 1 <your response>
```

**SMS Format — Inbound:**
```
1 Y          → sends "Y" + Enter to project 1's tmux session
2 N          → sends "N" + Enter to project 2's tmux session
3 use redis  → sends "use redis" + Enter to project 3's tmux session
ON           → arms SMS alerts
OFF          → disarms SMS alerts
```

**Tech Stack:**
- Server: Node.js + Express + Twilio SDK
- Terminal: tmux (session persistence, send-keys, capture-pane)
- SMS: Twilio (programmable SMS, webhook for inbound)
- Auth: Bearer token (hook → server), Twilio signature validation (inbound SMS)
- Tunnel: ngrok or Tailscale Funnel for Twilio webhook delivery

## Constraints

- **SMS Provider**: Twilio — industry standard, webhook-based, ~$0.01/msg
- **Transport**: SMS only — no app, no browser, no WebSocket
- **Deployment**: Same machine as Claude Code — local Mac
- **Network**: Local/Tailscale only for relay server; ngrok or Tailscale Funnel needed for Twilio webhook callback
- **SMS Length**: Keep messages concise — SMS has 160 char segments, longer messages split and cost more
- **Rate Limiting**: Max 1 SMS per 5 seconds to prevent hook misfires from flooding

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SMS over PWA | No app to install/maintain, works on any phone, simpler architecture | — Pending |
| Twilio for SMS | Industry standard, reliable webhooks, good SDK | — Pending |
| Numbered prompts for multi-project | Single SMS thread, parse "1 Y" format for routing | — Pending |
| Text ON/OFF for arming | No terminal needed to toggle, works from anywhere | — Pending |
| Off by default | Don't spam when user is at keyboard, explicit opt-in | — Pending |
| Welcome SMS on new project | Awareness without noise, invitation to arm | — Pending |

---
*Last updated: 2026-02-15 after initialization*
