# Roadmap: Claude SMS Connect

## Overview

This roadmap delivers a lightweight SMS relay that bridges Claude Code prompts to your phone via Twilio. We start with the core server and Twilio integration to enable end-to-end hook-to-SMS-to-reply flow, then add multi-project support with numbered prompts and arming controls, and finish with security hardening and developer setup automation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Core Server + Twilio Integration** - Hook receiver, tmux capture, SMS send/receive, auth, reply routing
- [x] **Phase 2: Multi-Project Support** - Numbered prompts, state management, arming, welcome messages
- [ ] **Phase 3: Hardening + Setup** - Sensitive data filtering, rate limiting, setup automation, documentation

## Phase Details

### Phase 1: Core Server + Twilio Integration
**Goal**: Users can receive Claude Code prompts via SMS and reply from their phone, with responses piped to the correct tmux session
**Depends on**: Nothing (first phase)
**Requirements**: RELAY-01, RELAY-02, RELAY-03, RELAY-04, RELAY-05, RELAY-06, SEC-01, SEC-02, SEC-04, SEC-05, OPS-04
**Success Criteria** (what must be TRUE):
  1. User receives SMS with Claude Code prompt and terminal context when hook fires
  2. User can reply "Y" or "N" and response is piped to correct tmux session
  3. User can reply with freeform text and it is sent to tmux session verbatim
  4. All hook endpoints require valid bearer token auth
  5. All inbound SMS webhooks validate Twilio signature
**Plans**: 3 plans in 2 waves

Plans:
- [x] 01-01-PLAN.md — Bootstrap Node.js + Express server with bearer auth middleware
- [x] 01-02-PLAN.md — Tmux integration service (capture context, send keys)
- [x] 01-03-PLAN.md — Twilio integration and end-to-end hook-to-SMS flow

### Phase 2: Multi-Project Support
**Goal**: Users can manage multiple simultaneous Claude Code sessions through a single SMS thread with numbered prompts and arming controls
**Depends on**: Phase 1
**Requirements**: RELAY-07, RELAY-08, RELAY-09, RELAY-10, OPS-01, OPS-05
**Success Criteria** (what must be TRUE):
  1. User receives SMS with numbered prompt when multiple projects need input (e.g., "[1] project-a")
  2. User can reply with number + response (e.g., "1 Y") and it routes to correct project
  3. User can text "ON" to arm SMS alerts and "OFF" to disarm
  4. User receives welcome SMS when a new project registers for the first time
  5. Notifications respect rate limiting (max 1 per 5 seconds per project)
**Plans**: 2 plans in 2 waves

Plans:
- [x] 02-01-PLAN.md — ProjectRegistry service and per-project rate limiter middleware
- [x] 02-02-PLAN.md — Multi-project routing, ON/OFF arming, welcome SMS, graceful session handling

### Phase 3: Hardening + Setup
**Goal**: Server filters sensitive data from terminal output and provides one-command setup for new users
**Depends on**: Phase 2
**Requirements**: SEC-03, OPS-02, OPS-03
**Success Criteria** (what must be TRUE):
  1. Terminal output is scanned and sensitive data (API keys, tokens, passwords) is redacted before SMS
  2. User can run setup script that generates auth token, creates .env, installs deps, and prints instructions
  3. User has ready-to-copy Claude Code hook configuration template
**Plans**: TBD

Plans:
- [ ] TBD (planned during /gsd:plan-phase 3)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Server + Twilio Integration | 3/3 | ✓ Complete | 2026-02-15 |
| 2. Multi-Project Support | 2/2 | ✓ Complete | 2026-02-15 |
| 3. Hardening + Setup | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-15*
*Last updated: 2026-02-15 after Phase 2 execution complete*
