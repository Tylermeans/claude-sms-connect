# Claude SMS Connect

## What This Is

A lightweight relay system that lets you respond to Claude Code prompts from your phone via SMS when you're away from your computer. When Claude Code gets stuck waiting for input or permission, it sends an SMS to your phone with context about what it needs. You text back your response and it gets piped into the terminal — no app to install, no browser needed. Works across multiple simultaneous projects through a single SMS thread with numbered prompts.

**This is NOT a chatbot or Claude API wrapper.** It bridges your phone's SMS to running `tmux` sessions where Claude Code is active.

## Core Value

When you walk away from your computer, Claude Code doesn't stall — you can approve, deny, or respond to any prompt from your phone with a simple text message.

## Requirements

### Validated

- ✓ Relay server receives Claude Code hook payloads and sends SMS via Twilio — v1.0
- ✓ SMS includes numbered prompts when multiple projects need input, with terminal context — v1.0
- ✓ User replies with number + response (e.g., "1 Y") to target specific projects — v1.0
- ✓ Freeform text responses piped back into correct tmux session via send-keys — v1.0
- ✓ SMS alerts off by default, text "ON"/"OFF" to arm/disarm — v1.0
- ✓ Welcome SMS on new project registration — v1.0
- ✓ Bearer token auth on all API routes, Twilio signature validation on SMS routes — v1.0
- ✓ Sensitive data redaction (13 patterns) before SMS transmission — v1.0
- ✓ Per-project rate limiting (1 per 5s) — v1.0
- ✓ One-command setup with crypto-secure token generation — v1.0

### Active

(None — next milestone not yet planned)

### Out of Scope

- PWA / phone app — SMS is the interface, no app needed
- Public internet exposure — local/Tailscale access only
- Multiple simultaneous phone clients — one phone number, one user
- Terminal output streaming — snapshot context in SMS is sufficient
- Database / persistent storage — in-memory state is sufficient
- Auto-respond to prompts — explicit Y/N per prompt is the safety feature

## Context

Shipped v1.0 with 1,345 LOC TypeScript + 238 LOC tests.
Tech stack: Node.js 22, Express, Twilio SDK, tmux, TypeScript (ES modules), vitest.
Built in 3 phases, 7 plans, 31 commits in a single day.

**Architecture:**

```
┌──────────────────┐   HTTP POST    ┌──────────────────┐    Twilio API   ┌──────────────────┐
│   Claude Code    │ ────────────► │   Relay Server   │ ──────────────► │    Your Phone    │
│  (runs in tmux)  │               │  (Node/Express)  │                 │     (SMS)        │
│                  │ tmux send-keys │                  │ ◄────────────── │                  │
│                  │ ◄──────────── │  Twilio webhook  │  Inbound SMS    │                  │
└──────────────────┘               └──────────────────┘                 └──────────────────┘
```

## Constraints

- **SMS Provider**: Twilio — industry standard, webhook-based, ~$0.01/msg
- **Transport**: SMS only — no app, no browser, no WebSocket
- **Deployment**: Same machine as Claude Code — local Mac
- **Network**: Local/Tailscale only for relay server; ngrok or Tailscale Funnel needed for Twilio webhook callback
- **SMS Length**: Keep messages concise — SMS has 160 char segments (GSM-7 enforced)
- **Rate Limiting**: Max 1 SMS per 5 seconds per project to prevent flooding

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SMS over PWA | No app to install/maintain, works on any phone, simpler architecture | ✓ Good — zero client-side code |
| Twilio for SMS | Industry standard, reliable webhooks, good SDK | ✓ Good — seamless integration |
| Numbered prompts for multi-project | Single SMS thread, parse "1 Y" format for routing | ✓ Good — intuitive UX |
| Text ON/OFF for arming | No terminal needed to toggle, works from anywhere | ✓ Good — simple control |
| Off by default | Don't spam when user is at keyboard, explicit opt-in | ✓ Good — noise-free |
| execFile with args arrays | Prevent shell injection, never use exec with string interpolation | ✓ Good — security best practice |
| GSM-7 encoding (strip non-ASCII) | 160 vs 70 chars/segment, significant cost savings | ✓ Good — 2x efficiency |
| crypto.timingSafeEqual for auth | Prevent timing attacks on bearer token comparison | ✓ Good — security hardened |
| TDD for redaction patterns | Security-critical code benefits from test-first approach | ✓ Good — 34 tests, zero false positives |
| In-memory Map for project state | ES2015 insertion order guarantees, no database needed | ✓ Good — simple and sufficient |

---
*Last updated: 2026-02-16 after v1.0 milestone*
