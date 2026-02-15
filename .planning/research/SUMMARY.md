# Project Research Summary

**Project:** Claude SMS Connect
**Domain:** SMS-based terminal relay system
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

Claude SMS Connect is a lightweight Node.js/Express server that bridges Claude Code prompts to your phone via Twilio SMS. The architecture is intentionally simple: an HTTP endpoint receives Claude Code hook payloads, captures tmux terminal context, sends an SMS via Twilio, and routes your text reply back into the correct tmux session. No database, no frontend, no WebSockets.

The recommended approach is a single Express server with three core services (tmux, twilio, state management) running on the same Mac as Claude Code. The biggest technical risks are command injection via tmux send-keys (mitigated by using `execFile` with args arrays and the `-l` literal flag) and missing webhook signature validation on inbound SMS (mitigated by Twilio's built-in validation helpers). SMS message length and cost management require upfront attention — terminal output must be aggressively truncated and stripped of non-ASCII characters.

The project is small enough to build in 3-4 focused phases, starting with core server + Twilio integration, then adding multi-project support and hardening.

## Key Findings

### Recommended Stack

The stack is intentionally minimal — a handful of battle-tested packages.

**Core technologies:**
- **Node.js 22 LTS + Express 4.x:** Simple HTTP server, great child_process support for tmux
- **Twilio SDK 5.x:** TypeScript-native, handles SMS send/receive and signature validation
- **TypeScript 5.x:** Type safety for webhook payloads and tmux command construction

**Supporting:**
- **strip-ansi:** Clean terminal output before SMS
- **express-rate-limit:** Prevent notification flooding
- **ngrok/Tailscale Funnel:** Tunnel for Twilio webhook delivery to localhost

### Expected Features

**Must have (table stakes):**
- Hook endpoint that receives Claude Code notifications
- SMS with terminal context sent to phone
- Inbound SMS parsing and routing to correct tmux session
- Auth on all endpoints (bearer + Twilio signature)
- Quick Y/N responses and freeform text

**Should have (competitive):**
- Multi-project numbered prompts (single SMS thread)
- ON/OFF arming via text command
- Welcome SMS on new project registration
- Sensitive data filtering

**Defer (v2+):**
- On-demand context refresh
- Saved response templates
- Multiple phone numbers

### Architecture Approach

Single Express server with service layer pattern. Routes are thin HTTP handlers that delegate to TmuxService, TwilioService, and StateManager. All state is in-memory (acceptable for single-user tool — projects re-register on hook fire if server restarts). No database, no frontend build step.

**Major components:**
1. **Hook Receiver** — accepts Claude Code notifications, triggers async SMS flow
2. **SMS Handler** — receives Twilio webhooks for inbound replies, parses commands
3. **Tmux Service** — capture-pane for context, send-keys for responses (always execFile, never exec)
4. **Twilio Service** — SMS formatting and sending, message length optimization
5. **State Manager** — project registry, armed state, prompt numbering

### Critical Pitfalls

1. **Command injection via tmux send-keys** — MUST use `execFile` with args array and `-l` literal flag. Never string interpolation with exec().
2. **Missing Twilio webhook signature validation** — inbound SMS endpoint must validate `X-Twilio-Signature` or anyone with the tunnel URL controls your terminal.
3. **SMS segmentation costs** — Unicode chars force UCS-2 encoding (70 char segments). Strip non-ASCII, limit to ~450 chars total.
4. **Tunnel instability** — free ngrok URLs change on restart; recommend persistent tunnel solution.
5. **Blocking hook responses** — return 200 immediately, process notification async. Never make Claude Code wait.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Server + Twilio Integration
**Rationale:** Everything depends on the server receiving hooks and sending SMS — this is the foundation
**Delivers:** Working end-to-end flow: hook → capture → SMS → reply → tmux
**Addresses:** Hook receiver, tmux integration, Twilio outbound/inbound, auth, basic reply parsing
**Avoids:** Command injection (execFile from day 1), missing auth (built-in from start)

### Phase 2: Multi-Project Support + State Management
**Rationale:** Multi-project requires the core flow working first, then adds state tracking and numbered prompts
**Delivers:** Numbered prompts, project registry, ON/OFF arming, welcome SMS
**Addresses:** State manager, SMS parser for commands, per-project routing
**Avoids:** SMS cost overrun (optimized formatting), notification noise (arming)

### Phase 3: Hardening + Setup
**Rationale:** Security hardening and setup automation come after core features work
**Delivers:** Sensitive data filtering, rate limiting, setup script, hook config template, documentation
**Addresses:** Sanitization, rate limiting, developer experience
**Avoids:** Sensitive data leaks, notification flooding

### Phase Ordering Rationale

- Phase 1 first because everything depends on the core hook→SMS→reply flow
- Phase 2 before Phase 3 because multi-project support changes SMS formatting (impacts hardening decisions)
- Phase 3 last because hardening and setup polish the working system

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Twilio webhook setup with ngrok — exact configuration steps for webhook URL
- **Phase 2:** SMS parser edge cases — handling malformed replies gracefully

Phases with standard patterns (skip research-phase):
- **Phase 3:** Rate limiting and setup scripting — well-documented, standard patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Mature, well-documented technologies with current versions verified |
| Features | HIGH | Feature set derived directly from user requirements and domain analysis |
| Architecture | HIGH | Simple service-layer pattern, no novel components |
| Pitfalls | HIGH | Security concerns (injection, auth) are well-understood; SMS cost model is documented |

**Overall confidence:** HIGH

### Gaps to Address

- Exact Claude Code hook payload format — verify against current hooks documentation during Phase 1 planning
- Twilio pricing for current SMS rates — verify during setup, may vary by phone number type

## Sources

### Primary (HIGH confidence)
- [Twilio npm package](https://www.npmjs.com/package/twilio) — SDK v5.11.2 verified
- tmux man pages — send-keys, capture-pane, has-session
- Node.js child_process documentation — execFile security

### Secondary (MEDIUM confidence)
- [ngrok alternatives analysis](https://pinggy.io/blog/best_ngrok_alternatives/) — tunnel options
- Express.js webhook server patterns

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
