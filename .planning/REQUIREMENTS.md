# Requirements: Claude SMS Connect

**Defined:** 2026-02-15
**Core Value:** When you walk away from your computer, Claude Code doesn't stall — you can approve, deny, or respond to any prompt from your phone with a simple text message.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Relay

- [ ] **RELAY-01**: Server receives Claude Code hook payloads via POST /api/notify with bearer token auth
- [ ] **RELAY-02**: Server captures last 5-8 lines of tmux pane output, strips ANSI codes
- [ ] **RELAY-03**: Server sends SMS via Twilio with project identifier and terminal context
- [ ] **RELAY-04**: Server receives inbound SMS via Twilio webhook at POST /sms/inbound
- [ ] **RELAY-05**: User can reply with "Y" or "N" and response is piped to correct tmux session
- [ ] **RELAY-06**: User can reply with freeform text and it is piped to correct tmux session via send-keys
- [ ] **RELAY-07**: Multiple simultaneous projects are tracked with numbered prompts (e.g., "[1] project-a")
- [ ] **RELAY-08**: User replies with number + response (e.g., "1 Y") to target specific project
- [ ] **RELAY-09**: SMS alerts are off by default — user texts "ON" to arm, "OFF" to disarm
- [ ] **RELAY-10**: Welcome SMS is sent when a new project registers with the relay for the first time

### Security

- [ ] **SEC-01**: All /api routes require valid bearer token in Authorization header
- [ ] **SEC-02**: All /sms routes validate Twilio request signature (X-Twilio-Signature)
- [ ] **SEC-03**: Terminal output is filtered for sensitive data (API keys, tokens, passwords) before including in SMS
- [ ] **SEC-04**: All tmux commands use child_process.execFile with args array (never exec with string interpolation)
- [ ] **SEC-05**: tmux send-keys uses -l (literal) flag for all user input

### Operations

- [ ] **OPS-01**: Rate limiting on /api/notify — max 1 notification per 5 seconds per project
- [ ] **OPS-02**: Setup script generates auth token, creates .env, installs deps, prints instructions
- [ ] **OPS-03**: Claude Code hook configuration template provided (ready to copy into settings.json)
- [ ] **OPS-04**: Server returns 200 immediately on hook receipt, processes notification asynchronously
- [ ] **OPS-05**: Server handles missing tmux sessions gracefully (no crash, logs error, notifies user via SMS)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced UX

- **UX-01**: User can text "?" to get current terminal state on demand
- **UX-02**: Configurable sensitive data filter patterns via environment variable
- **UX-03**: Per-project arming (arm/disarm individual projects instead of all)

### Operations

- **OPS-06**: Health check endpoint at GET /api/health
- **OPS-07**: Server serves confirmation SMS after each reply ("Sent 'Y' to project-a")

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web UI / PWA | SMS is the interface — no app needed |
| WebSocket connections | SMS replaces realtime browser connections |
| Database / persistent storage | In-memory state is sufficient; projects re-register on hook fire |
| Multiple phone numbers | Single-user tool, one phone number |
| MMS / image messages | Text context is sufficient |
| Auto-respond to prompts | Explicit Y/N per prompt is the safety feature |
| Public internet exposure | Local/Tailscale only for server; ngrok/tunnel for Twilio webhook only |
| Terminal output streaming | Snapshot context in SMS is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RELAY-01 | — | Pending |
| RELAY-02 | — | Pending |
| RELAY-03 | — | Pending |
| RELAY-04 | — | Pending |
| RELAY-05 | — | Pending |
| RELAY-06 | — | Pending |
| RELAY-07 | — | Pending |
| RELAY-08 | — | Pending |
| RELAY-09 | — | Pending |
| RELAY-10 | — | Pending |
| SEC-01 | — | Pending |
| SEC-02 | — | Pending |
| SEC-03 | — | Pending |
| SEC-04 | — | Pending |
| SEC-05 | — | Pending |
| OPS-01 | — | Pending |
| OPS-02 | — | Pending |
| OPS-03 | — | Pending |
| OPS-04 | — | Pending |
| OPS-05 | — | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 0
- Unmapped: 20

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after initial definition*
