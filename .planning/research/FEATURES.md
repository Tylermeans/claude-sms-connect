# Feature Research

**Domain:** SMS-based terminal relay / remote Claude Code responder
**Researched:** 2026-02-15
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Send SMS when Claude needs input | Core purpose — without this, nothing works | MEDIUM | Twilio API + hook integration |
| Receive SMS reply and pipe to terminal | Core purpose — response must reach tmux | MEDIUM | Twilio webhook + tmux send-keys |
| Auth on all endpoints | Security — anyone with the URL could control your terminal | LOW | Bearer token for hooks, Twilio signature for inbound |
| Terminal context in SMS | User needs to know WHAT Claude is asking | MEDIUM | tmux capture-pane + ANSI stripping + truncation for SMS limits |
| Quick Y/N responses | 90% of Claude Code prompts are permission approvals | LOW | Parse single-char replies |
| Freeform text responses | Some prompts need typed answers | LOW | Pass-through to tmux send-keys |
| Error resilience | Server must not crash if tmux session disappears | LOW | Try/catch on all tmux operations, return 200 to hooks |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-project numbered prompts | Handle multiple Claude Code sessions from one SMS thread | MEDIUM | State management for project→session mapping |
| ON/OFF arming via text | Don't get SMS when at your desk | LOW | Simple boolean flag toggled by inbound SMS |
| Welcome SMS on new project | Awareness of new projects without noise | LOW | Triggered by first hook from unknown project |
| Sensitive data filtering | Terminal output may contain secrets — strip before SMS | MEDIUM | Regex patterns for common secret formats |
| Rate limiting | Prevent notification flooding from rapid hook fires | LOW | express-rate-limit, 1 per 5s |
| SMS message optimization | Keep within 160 chars when possible to save cost | MEDIUM | Smart truncation of context, abbreviations |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full terminal streaming via SMS | "I want to see everything" | SMS costs add up fast, floods phone, 160 char limit | Snapshot context on demand — text "?" to get current state |
| Web dashboard alongside SMS | "Sometimes I want more detail" | Doubles maintenance, scope creep, defeats simplicity | Keep it SMS-only; if you need more, you're at your desk |
| Auto-respond to common prompts | "Just approve everything" | Dangerous — could approve destructive actions blindly | Explicit Y/N per prompt is the safety feature |
| MMS for screenshots | "Show me what Claude sees" | MMS is expensive, slow, carrier-dependent | Text context is sufficient; if you need visual, go to desk |

## Feature Dependencies

```
[SMS Sending (Twilio)]
    └──requires──> [Server + Hook Receiver]
                       └──requires──> [tmux Integration]

[Multi-project Prompts]
    └──requires──> [Project Registry / State Management]
                       └──requires──> [Hook Receiver (to register projects)]

[ON/OFF Arming]
    └──requires──> [Inbound SMS Parsing]
                       └──requires──> [Twilio Webhook Setup]

[Sensitive Data Filtering]
    └──enhances──> [Terminal Context Capture]
```

### Dependency Notes

- **SMS Sending requires Server + Hook Receiver:** Can't send SMS without receiving the hook trigger first
- **Multi-project requires Project Registry:** Need to track which tmux session maps to which project number
- **ON/OFF Arming requires Inbound SMS:** Must be able to receive and parse texts before toggling state
- **Sensitive Data Filtering enhances Terminal Context:** Applied as a post-processing step on captured pane output

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Express server with hook endpoint — receives Claude Code notifications
- [ ] tmux integration — capture-pane for context, send-keys for responses
- [ ] Twilio outbound SMS — send notification with context to phone
- [ ] Twilio inbound webhook — receive replies and route to tmux
- [ ] Basic reply parsing — Y/N and freeform text
- [ ] Bearer token auth on hook endpoint
- [ ] Twilio signature validation on inbound webhook
- [ ] Setup script — generate token, create .env, print instructions

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Multi-project numbered prompts — when multiple sessions are active
- [ ] ON/OFF arming via text command
- [ ] Welcome SMS on new project registration
- [ ] Sensitive data filtering before SMS
- [ ] Rate limiting on notifications
- [ ] SMS message optimization (smart truncation)

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] On-demand context refresh (text "?" to get current terminal state)
- [ ] Saved response templates
- [ ] Multiple phone numbers support
- [ ] Notification preferences per project

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Hook receiver + SMS send | HIGH | MEDIUM | P1 |
| Inbound SMS + tmux send-keys | HIGH | MEDIUM | P1 |
| Terminal context in SMS | HIGH | LOW | P1 |
| Auth (bearer + Twilio sig) | HIGH | LOW | P1 |
| Multi-project prompts | HIGH | MEDIUM | P1 |
| ON/OFF arming | MEDIUM | LOW | P2 |
| Welcome SMS | LOW | LOW | P2 |
| Sensitive data filtering | MEDIUM | MEDIUM | P2 |
| Rate limiting | MEDIUM | LOW | P2 |
| Setup script | HIGH | LOW | P1 |

## Competitor Feature Analysis

No direct competitors — this is a novel integration between Claude Code hooks and SMS. Closest analogues:

| Feature | PagerDuty/OpsGenie | ntfy.sh | Our Approach |
|---------|-------------------|---------|--------------|
| Notifications | Alert routing, escalation | Push notifications | SMS — simplest possible |
| Responses | Acknowledge/resolve | No response channel | Full text response piped to terminal |
| Multi-source | Yes, complex routing | Topic-based | Numbered prompts in one thread |
| Setup | Complex, requires accounts | Simple, topic-based | One script, one env file |

## Sources

- Twilio SMS documentation and pricing
- Claude Code hooks documentation
- tmux man pages for send-keys and capture-pane
- Domain experience with webhook-driven notification systems

---
*Feature research for: SMS-based terminal relay*
*Researched: 2026-02-15*
