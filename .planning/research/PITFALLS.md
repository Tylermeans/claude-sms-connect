# Pitfalls Research

**Domain:** SMS-based terminal relay with Twilio + tmux
**Researched:** 2026-02-15
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Command Injection via tmux send-keys

**What goes wrong:**
User input from SMS is passed to `tmux send-keys` via shell string interpolation. An attacker (or accidental input) containing shell metacharacters (`;`, `|`, `$()`, backticks) executes arbitrary commands on the host machine.

**Why it happens:**
Using `child_process.exec()` with string templates is the intuitive approach. The `-l` (literal) flag for send-keys is easy to miss.

**How to avoid:**
- ALWAYS use `child_process.execFile` with an args array — never `exec` with string interpolation
- ALWAYS use tmux's `-l` flag for literal mode (prevents tmux key binding interpretation)
- Validate input length (reasonable max: 500 chars)
- Never pass user input through a shell

**Warning signs:**
- Any use of `exec()` or backtick template strings for tmux commands
- Missing `-l` flag on send-keys calls

**Phase to address:**
Phase 1 (Core server) — must be correct from the start

---

### Pitfall 2: Missing Twilio Webhook Signature Validation

**What goes wrong:**
Inbound SMS endpoint accepts any POST request. Anyone who discovers the ngrok URL can send fake "SMS replies" that execute commands in your terminal.

**Why it happens:**
Developers skip validation during development ("I'll add it later") and forget. ngrok URLs look obscure enough to feel safe.

**How to avoid:**
- Use `twilio.validateRequest()` or the `validateExpressRequest` helper from the Twilio SDK
- Validate on EVERY inbound SMS request, no exceptions
- In development, still validate — ngrok URLs are discoverable via scan

**Warning signs:**
- `/sms/inbound` route with no middleware checking `X-Twilio-Signature` header
- "TODO: add validation" comments

**Phase to address:**
Phase 1 (Core server) — auth must be built in from day one

---

### Pitfall 3: SMS Message Segmentation and Cost

**What goes wrong:**
SMS messages over 160 characters (GSM-7 encoding) or 70 characters (UCS-2/Unicode) get split into segments. Each segment costs separately. Terminal output often contains Unicode characters (box-drawing, emoji from Claude), forcing UCS-2 encoding and 70-char segments.

**Why it happens:**
Developers test with short messages, then real terminal output is 500+ chars. A single notification becomes 8+ segments at $0.01 each.

**How to avoid:**
- Strip all non-ASCII characters from terminal context before including in SMS
- Hard limit SMS body to ~450 chars (3 GSM-7 segments)
- Use abbreviations: "Y/N" not "yes/no", project numbers not full names
- Monitor Twilio billing dashboard during testing

**Warning signs:**
- SMS messages showing up split/out-of-order on phone
- Twilio bill higher than expected
- Unicode characters in outbound messages

**Phase to address:**
Phase 1 (Twilio integration) — build SMS formatting with limits from the start

---

### Pitfall 4: ngrok Tunnel Instability

**What goes wrong:**
Free ngrok tunnels get new URLs on restart. Twilio webhook URL becomes stale. Inbound SMS silently fails — you reply but nothing happens.

**Why it happens:**
ngrok free tier doesn't support persistent URLs. Computer sleeps, ngrok dies, URL changes.

**How to avoid:**
- Use ngrok paid tier ($8/mo) for persistent URLs
- OR use Tailscale Funnel (free, persistent if you use Tailscale)
- OR use Cloudflare Tunnel (free, persistent)
- Add a health check that verifies the tunnel is live
- Setup script should warn about this and suggest persistent options

**Warning signs:**
- Replies not reaching the server
- Twilio showing webhook delivery failures in console
- Server logs showing no inbound traffic

**Phase to address:**
Phase 1 (Setup/tunneling) — document the tunnel options clearly

---

### Pitfall 5: Sensitive Data Leaking in SMS

**What goes wrong:**
Terminal output captured by `tmux capture-pane` includes API keys, tokens, passwords, or other secrets that Claude Code printed. These get sent via SMS in plaintext over carrier networks.

**Why it happens:**
Terminal output is captured indiscriminately. Developers forget that terminal context goes over SMS (less secure than HTTPS).

**How to avoid:**
- Apply regex filters BEFORE including terminal context in SMS:
  - Lines matching `Bearer `, `Authorization:`, `token=`, `KEY=`, `SECRET=`, `password`
  - Mask matched content: `[REDACTED]`
- Make filter patterns configurable via env var `SENSITIVE_PATTERNS`
- Default to aggressive filtering — better to over-redact than leak

**Warning signs:**
- SMS messages containing `export API_KEY=...` or similar
- Any credential-looking strings in outbound SMS

**Phase to address:**
Phase 2 (Hardening) — core flow works first, then add filtering

---

### Pitfall 6: Blocking Claude Code with Slow Hook Response

**What goes wrong:**
The hook HTTP POST to `/api/notify` takes too long (waiting for Twilio API, tmux operations). Claude Code's hook has a timeout — if it doesn't get a response, it may hang or error.

**Why it happens:**
Developers chain async operations (capture pane → filter → send SMS) in the request handler before responding.

**How to avoid:**
- Return 200 IMMEDIATELY after receiving the hook payload
- Process the notification asynchronously (fire-and-forget)
- Wrap all processing in try/catch — never let errors propagate to the HTTP response

**Warning signs:**
- Claude Code showing hook timeout errors
- `/api/notify` response times > 1 second

**Phase to address:**
Phase 1 (Hook handler) — async processing pattern from the start

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-memory state (no persistence) | No database dependency | State lost on restart | Always — projects re-register on next hook |
| Hardcoded SMS formatting | Faster to build | Harder to customize per project | v1 — revisit if formatting needs diverge |
| Single phone number | Simple config | Can't notify different people | v1 — single user tool |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Twilio webhook URL | Setting ngrok URL that changes on restart | Use persistent tunnel or update webhook URL in setup script |
| Twilio TwiML response | Returning plain text instead of TwiML XML | Return empty `<Response></Response>` or use `twiml.MessagingResponse()` |
| tmux capture-pane | Capturing too many lines, blowing SMS budget | Default to 5-8 lines max, strip ANSI, trim whitespace |
| tmux send-keys | Forgetting `-l` flag, keys get interpreted as tmux bindings | Always use `-l` for user input, only omit for special keys (Escape, C-c) |
| Claude Code hooks | Assuming specific payload format | Be defensive — use optional chaining, provide defaults |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No auth on `/api/notify` | Anyone on network can trigger notifications | Bearer token middleware on all `/api` routes |
| No Twilio signature check | Fake SMS commands execute in terminal | `validateExpressRequest` middleware on `/sms` routes |
| exec() for tmux commands | Remote code execution via SMS reply | execFile() with args array, always |
| Logging SMS content | Secrets from terminal appear in server logs | Sanitize before logging, or don't log SMS bodies |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| SMS too long/verbose | Hard to read on phone, expensive | Keep under 3 segments, lead with the question |
| No confirmation after reply | User unsure if response was received | Send brief "Sent 'Y' to project-a" confirmation |
| Numbered prompts start at 0 | Confusing for humans | Start at 1, always |
| Unclear SMS format instructions | User doesn't know how to reply | Include format hint in first notification: "Reply: 1 Y" |

## "Looks Done But Isn't" Checklist

- [ ] **Auth:** Both bearer (hooks) AND Twilio signature (inbound SMS) validated — not just one
- [ ] **tmux send-keys:** Uses `-l` flag AND execFile (not exec) — both required
- [ ] **SMS formatting:** Tested with real terminal output containing ANSI codes and Unicode
- [ ] **Error handling:** Server stays up when tmux session doesn't exist
- [ ] **Tunnel:** Twilio webhook URL actually reaches the server (test with real SMS, not just curl)
- [ ] **Hook config:** Actual Claude Code hook fires and reaches the server (not just manual POST)
- [ ] **Arming:** OFF by default verified — server restart doesn't enable notifications

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Command injection | HIGH | Audit tmux calls, rotate any exposed credentials, rebuild |
| SMS cost overrun | LOW | Add rate limiting, shorten messages, check Twilio usage dashboard |
| Tunnel URL stale | LOW | Restart tunnel, update Twilio webhook URL |
| State lost on restart | LOW | Projects auto-re-register on next hook fire, text "ON" to re-arm |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Command injection | Phase 1 | Code review: all tmux calls use execFile + -l |
| Missing Twilio validation | Phase 1 | Test: POST to /sms without signature → 403 |
| SMS segmentation costs | Phase 1 | Test: send notification, verify SMS ≤ 3 segments |
| Tunnel instability | Phase 1 | Document persistent tunnel options in setup |
| Sensitive data in SMS | Phase 2 | Test: terminal with `export KEY=secret`, verify redacted |
| Blocking hook response | Phase 1 | Test: /api/notify responds in < 100ms |

## Sources

- Twilio webhook security documentation
- tmux man page (send-keys -l literal mode)
- SMS encoding standards (GSM-7 vs UCS-2)
- Node.js child_process security best practices

---
*Pitfalls research for: SMS-based terminal relay*
*Researched: 2026-02-15*
