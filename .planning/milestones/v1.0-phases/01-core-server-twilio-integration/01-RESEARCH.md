# Phase 1: Core Server + Twilio Integration - Research

**Researched:** 2026-02-15
**Domain:** Node.js webhook server with Twilio SMS and tmux integration
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational relay system: an Express server that receives Claude Code notification hooks, captures tmux terminal context, sends SMS via Twilio, and routes text replies back into the correct tmux session. This phase delivers the complete end-to-end flow for single-project scenarios, with all security measures (bearer auth, Twilio signature validation, safe tmux command execution) built in from day one.

The architecture is intentionally minimal: Express for HTTP, Twilio SDK for SMS, child_process.execFile for tmux operations. No database, no frontend, no WebSockets. The biggest risks are command injection via tmux send-keys (mitigated by using execFile with args arrays and the `-l` literal flag) and missing webhook signature validation (mitigated by Twilio's validateExpressRequest helper).

**Primary recommendation:** Build auth and safe tmux operations into the first task — these are not "hardening" features but core security requirements that must be correct from the start. Return HTTP 200 immediately on hook receipt and process notifications asynchronously to avoid blocking Claude Code.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22 LTS | Server runtime | Latest LTS with native ES modules, excellent child_process support for tmux operations |
| Express | 4.x | HTTP server | Battle-tested, minimal, perfect for a handful of webhook routes |
| TypeScript | 5.x | Type safety | Twilio SDK is TypeScript-native, types help with webhook payload handling |
| Twilio SDK | 5.x | SMS send/receive | Official SDK, TypeScript-native since v4, includes signature validation helpers |
| tmux | system | Terminal session management | Industry standard for persistent sessions with send-keys and capture-pane APIs |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 16.x | Environment config | Load .env file for AUTH_TOKEN, Twilio credentials, phone number |
| strip-ansi | 7.x | ANSI escape removal | Clean terminal output before including in SMS (always) |
| express-rate-limit | 7.x | Rate limiting | Prevent notification flooding from rapid hook fires (Phase 2, deferred) |
| ngrok | 5.x (npm) | Tunnel for webhooks | Expose local server for Twilio inbound SMS webhooks during development |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | Run TypeScript directly | Faster than ts-node, no tsconfig fuss for dev |
| nodemon | Auto-restart on changes | Pair with tsx for `nodemon --exec tsx src/index.ts` |

**Installation:**

```bash
# Core dependencies
npm install express twilio dotenv strip-ansi

# Dev dependencies
npm install -D typescript @types/express @types/node tsx nodemon
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Express | Fastify | If you need built-in schema validation; overkill for this use case |
| ngrok | Cloudflare Tunnel | Free, stable; good if you have a Cloudflare account |
| ngrok | Tailscale Funnel | If already on Tailscale; persistent URL without tunnel restarts |
| dotenv | Node --env-file | Node 22+ has native .env support; dotenv more flexible for multiple env files |

## Architecture Patterns

### Recommended Project Structure

```
claude-sms-connect/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts              # Express server entrypoint
│   ├── routes/
│   │   ├── notify.ts         # POST /api/notify — Claude Code hook handler
│   │   └── sms.ts            # POST /sms/inbound — Twilio webhook handler
│   ├── services/
│   │   ├── tmux.ts           # tmux capture-pane, send-keys, has-session
│   │   └── twilio.ts         # SMS sending, message formatting
│   ├── middleware/
│   │   ├── auth.ts           # Bearer token validation
│   │   └── twilio-auth.ts    # Twilio request signature validation
│   ├── lib/
│   │   └── sanitize.ts       # ANSI stripping, basic text cleanup
│   └── types.ts              # TypeScript interfaces
└── hooks/
    └── claude-relay-hook.json  # Ready-to-use Claude Code hook config
```

**Structure rationale:**

- **routes/:** One file per HTTP endpoint — keeps routing logic isolated
- **services/:** Business logic separated from HTTP concerns — tmux and twilio are independently testable
- **middleware/:** Auth is cross-cutting — separate from route logic
- **lib/:** Pure utility functions — no side effects, easy to unit test
- **Single package:** No client app means no need for monorepo workspaces

### Pattern 1: Service Layer Abstraction

**What:** All tmux and Twilio operations go through service classes, never called directly from routes.

**When to use:** Always — this is the core architectural pattern.

**Example:**

```typescript
// routes/notify.ts — thin route, delegates to services
router.post('/api/notify', bearerAuth, async (req, res) => {
  // Return 200 immediately (OPS-04 requirement)
  res.sendStatus(200);

  // Process notification asynchronously
  (async () => {
    try {
      const { session_id } = req.body;
      const context = await tmuxService.captureContext(session_id, 8);
      const cleaned = sanitize(context);
      await twilioService.sendNotification(phoneNumber, cleaned);
    } catch (error) {
      console.error('Notification processing failed:', error);
      // Never throw — notification failures should not crash server
    }
  })();
});
```

### Pattern 2: Safe tmux Command Execution

**What:** All tmux operations use child_process.execFile with args array and `-l` literal flag for send-keys.

**When to use:** Always — this prevents command injection vulnerabilities.

**Security requirements:**

- NEVER use `child_process.exec()` with string interpolation
- ALWAYS use `child_process.execFile()` with args array
- ALWAYS use `-l` flag for tmux send-keys with user input
- ALWAYS validate session names against expected format

**Example:**

```typescript
// services/tmux.ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

class TmuxService {
  async sendKeys(session: string, input: string): Promise<void> {
    // Validate session name format
    if (!/^[a-zA-Z0-9_-]+$/.test(session)) {
      throw new Error('Invalid session name');
    }

    // Use execFile with args array, -l flag for literal input
    // NEVER: exec(`tmux send-keys -t ${session} "${input}"`)
    await execFileAsync('tmux', [
      'send-keys',
      '-t', session,
      '-l',  // CRITICAL: literal flag prevents tmux key interpretation
      input
    ]);

    // Send Enter separately (not literal)
    await execFileAsync('tmux', ['send-keys', '-t', session, 'Enter']);
  }

  async captureContext(session: string, lines: number = 8): Promise<string> {
    if (!/^[a-zA-Z0-9_-]+$/.test(session)) {
      throw new Error('Invalid session name');
    }

    const { stdout } = await execFileAsync('tmux', [
      'capture-pane',
      '-t', session,
      '-p',  // print to stdout
      '-S', `-${lines}`  // start N lines back
    ]);

    return stdout;
  }

  async hasSession(session: string): Promise<boolean> {
    try {
      await execFileAsync('tmux', ['has-session', '-t', session]);
      return true;
    } catch {
      return false;
    }
  }
}
```

### Pattern 3: Twilio Webhook Signature Validation

**What:** All /sms routes validate X-Twilio-Signature header before processing.

**When to use:** Always — without this, anyone with the webhook URL can send fake SMS commands.

**Example:**

```typescript
// middleware/twilio-auth.ts
import twilio from 'twilio';

const twilioAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'] as string;

  if (!authToken) {
    return res.status(500).json({ error: 'Twilio auth token not configured' });
  }

  // Construct the URL Twilio used (must match exactly for validation)
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  // Validate signature using Twilio SDK
  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn('Invalid Twilio signature:', { url, signature: twilioSignature });
    return res.status(403).json({ error: 'Invalid signature' });
  }

  next();
};
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature validation | Custom HMAC verification | `twilio.validateRequest()` from SDK | Handles URL reconstruction, encoding edge cases, timing-safe comparison |
| ANSI code stripping | Regex-based parsers | `strip-ansi` package | Handles all ANSI escape sequences including SGR, cursor control, etc. |
| SMS message segmentation | Character counting | Twilio API (handles automatically) | Twilio splits long messages and handles encoding (GSM-7 vs UCS-2) |
| tmux session management | Custom shell scripts | `execFile` with tmux commands | Direct tmux API, no shell parsing vulnerabilities |

**Key insight:** Webhook security and terminal output parsing have subtle edge cases that are easy to get wrong. Use battle-tested libraries instead of reimplementing.

## Common Pitfalls

### Pitfall 1: Command Injection via tmux send-keys

**What goes wrong:** User input from SMS is passed to `tmux send-keys` via shell string interpolation. An attacker (or accidental input) containing shell metacharacters (`;`, `|`, `$()`, backticks) executes arbitrary commands on the host machine.

**Why it happens:** Using `child_process.exec()` with string templates is intuitive. The `-l` (literal) flag for send-keys is easy to miss in documentation.

**How to avoid:**

- ALWAYS use `child_process.execFile` with an args array — never `exec` with string interpolation
- ALWAYS use tmux's `-l` flag for literal mode (prevents tmux key binding interpretation)
- Validate session names match expected format (`/^[a-zA-Z0-9_-]+$/`)
- Never pass user input through a shell

**Warning signs:**

- Any use of `exec()` or backtick template strings for tmux commands
- Missing `-l` flag on send-keys calls
- String concatenation building tmux commands

**Phase to address:** Phase 1 (Core server) — must be correct from the start

**Verification:**

```bash
# Test that literal flag works correctly
echo '$(whoami)' | should be sent literally, not executed
echo 'rm -rf /' | should be sent literally, not executed
```

---

### Pitfall 2: Missing Twilio Webhook Signature Validation

**What goes wrong:** Inbound SMS endpoint accepts any POST request. Anyone who discovers the ngrok URL can send fake "SMS replies" that execute commands in your terminal.

**Why it happens:** Developers skip validation during development ("I'll add it later") and forget. ngrok URLs look obscure enough to feel safe, but they're discoverable via scanning.

**How to avoid:**

- Use `twilio.validateRequest()` from the Twilio SDK
- Validate on EVERY inbound SMS request, no exceptions
- In development, still validate — ngrok URLs are discoverable

**Warning signs:**

- `/sms/inbound` route with no middleware checking `X-Twilio-Signature` header
- "TODO: add validation" comments in code

**Phase to address:** Phase 1 (Core server) — auth must be built in from day one

**Verification:**

```bash
# Test that signature validation works
curl -X POST http://localhost:3000/sms/inbound \
  -d "Body=test" \
  # Should return 403 without valid signature
```

**Sources:**

- [Twilio webhook security documentation](https://www.twilio.com/docs/usage/security/validating-requests)
- [Twilio Express validation tutorial](https://www.twilio.com/docs/usage/tutorials/how-to-secure-your-express-app-by-validating-incoming-twilio-requests)

---

### Pitfall 3: Blocking Claude Code with Slow Hook Response

**What goes wrong:** The hook HTTP POST to `/api/notify` takes too long (waiting for Twilio API, tmux operations). Claude Code's hook has a timeout — if it doesn't get a response quickly, it may hang or error.

**Why it happens:** Developers chain async operations (capture pane → filter → send SMS) in the request handler before responding.

**How to avoid:**

- Return 200 IMMEDIATELY after receiving the hook payload (OPS-04 requirement)
- Process the notification asynchronously (fire-and-forget)
- Wrap all processing in try/catch — never let errors propagate to the HTTP response
- Set appropriate timeouts on Twilio API calls

**Warning signs:**

- Claude Code showing hook timeout errors
- `/api/notify` response times > 100ms

**Phase to address:** Phase 1 (Hook handler) — async processing pattern from the start

**Example:**

```typescript
router.post('/api/notify', bearerAuth, async (req, res) => {
  // Return 200 immediately
  res.sendStatus(200);

  // Process asynchronously
  (async () => {
    try {
      // Long-running work here
    } catch (error) {
      console.error('Notification failed:', error);
    }
  })();
});
```

---

### Pitfall 4: SMS Message Segmentation and Cost

**What goes wrong:** SMS messages over 160 characters (GSM-7 encoding) or 70 characters (UCS-2/Unicode) get split into segments. Each segment costs separately. Terminal output often contains Unicode characters (box-drawing, emoji from Claude), forcing UCS-2 encoding and 70-char segments.

**Why it happens:** Developers test with short messages, then real terminal output is 500+ chars. A single notification becomes 8+ segments at $0.01 each.

**How to avoid:**

- Strip all non-ASCII characters from terminal context before including in SMS
- Hard limit SMS body to ~450 chars (3 GSM-7 segments max)
- Use abbreviations: "Y/N" not "yes/no", project numbers not full names
- Monitor Twilio billing dashboard during testing

**Warning signs:**

- SMS messages showing up split/out-of-order on phone
- Twilio bill higher than expected
- Unicode characters in outbound messages

**Phase to address:** Phase 1 (Twilio integration) — build SMS formatting with limits from the start

**Example:**

```typescript
function formatForSMS(context: string, maxChars: number = 450): string {
  // Strip ANSI codes
  let cleaned = stripAnsi(context);

  // Remove non-ASCII characters (forces GSM-7 encoding)
  cleaned = cleaned.replace(/[^\x00-\x7F]/g, '');

  // Truncate to max length
  if (cleaned.length > maxChars) {
    cleaned = cleaned.slice(0, maxChars - 3) + '...';
  }

  return cleaned;
}
```

---

### Pitfall 5: ngrok Tunnel Instability

**What goes wrong:** Free ngrok tunnels get new URLs on restart. Twilio webhook URL becomes stale. Inbound SMS silently fails — you reply but nothing happens.

**Why it happens:** ngrok free tier doesn't support persistent URLs. Computer sleeps, ngrok dies, URL changes.

**How to avoid:**

- Use ngrok paid tier ($8/mo) for persistent URLs
- OR use Tailscale Funnel (free, persistent if you use Tailscale)
- OR use Cloudflare Tunnel (free, persistent)
- Setup script should print the current webhook URL and instructions

**Warning signs:**

- Replies not reaching the server
- Twilio showing webhook delivery failures in console
- Server logs showing no inbound traffic

**Phase to address:** Phase 1 (Setup/tunneling) — document the tunnel options clearly

**Recommendation:** For Phase 1, use ngrok free tier with manual URL updates. Document persistent tunnel options in README for production use.

---

## Code Examples

Verified patterns from official sources:

### Claude Code Hook Configuration

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST http://localhost:3000/api/notify -H 'Authorization: Bearer YOUR_TOKEN' -H 'Content-Type: application/json' -d @-",
            "async": true
          }
        ]
      }
    ]
  }
}
```

**Source:** [Claude Code Hooks documentation](https://code.claude.com/docs/en/hooks)

### Notification Hook Payload (Claude Code)

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "Notification",
  "message": "Claude needs your permission to use Bash",
  "title": "Permission needed",
  "notification_type": "permission_prompt"
}
```

**Source:** [Claude Code Hooks reference](https://code.claude.com/docs/en/hooks#notification)

### Twilio Webhook Validation (Express)

```typescript
import twilio from 'twilio';

app.post('/sms/inbound', (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature as string,
    url,
    req.body
  );

  if (!isValid) {
    return res.status(403).send('Forbidden');
  }

  // Process SMS
  const { Body, From } = req.body;
  res.type('text/xml').send('<Response></Response>');
});
```

**Source:** [Twilio Express validation tutorial](https://www.twilio.com/docs/usage/tutorials/how-to-secure-your-express-app-by-validating-incoming-twilio-requests)

### tmux send-keys with Literal Flag

```bash
# Safe: uses -l flag for literal input
tmux send-keys -t session-name -l "user input here"
tmux send-keys -t session-name Enter

# UNSAFE: shell interpolation
tmux send-keys -t session-name "user input here"  # Interprets tmux key names
```

**Source:** [tmux manual page](https://man7.org/linux/man-pages/man1/tmux.1.html)

### Node.js execFile vs exec Security

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// SAFE: args array, no shell
await execFileAsync('tmux', ['send-keys', '-t', session, '-l', userInput]);

// UNSAFE: string interpolation with shell
exec(`tmux send-keys -t ${session} "${userInput}"`);  // Command injection risk
```

**Source:** [Node.js child_process security](https://nodejs.org/api/child_process.html)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twilio SDK v3 | Twilio SDK v5 | 2023 | TypeScript-native, better tree-shaking, improved webhook validation helpers |
| Express body-parser | Express built-in | Express 4.16+ | body-parser now included, no need for separate package |
| ts-node | tsx | 2023 | Faster TypeScript execution, no tsconfig required for simple cases |
| dotenv@8 | dotenv@16 | 2022 | Multi-line value support, better type safety |

**Deprecated/outdated:**

- `body-parser` package: Now built into Express 4.16+, use `express.json()` instead
- Twilio webhook validation via manual HMAC: Use `twilio.validateRequest()` helper instead
- `child_process.exec()` for tmux: Security risk, use `execFile()` instead

## Open Questions

1. **Claude Code hook timeout behavior**
   - What we know: Hooks can time out if slow to respond
   - What's unclear: Exact timeout value, whether retries occur
   - Recommendation: Return 200 immediately (< 100ms), process async. Test with deliberate delays to observe behavior.

2. **Twilio webhook URL reconstruction with ngrok**
   - What we know: Signature validation requires exact URL match
   - What's unclear: Whether ngrok-forwarded URLs need special handling
   - Recommendation: Test signature validation with ngrok in development. Twilio SDK handles most cases correctly.

3. **tmux session naming from Claude Code**
   - What we know: Claude Code runs in tmux sessions
   - What's unclear: Session naming convention, how to reliably map hook payload to session
   - Recommendation: For Phase 1, accept session name as part of hook payload or environment variable. Map session_id → tmux session in state.

## Sources

### Primary (HIGH confidence)

- [Claude Code Hooks documentation](https://code.claude.com/docs/en/hooks) — Official reference, payload schemas verified
- [Twilio webhook security](https://www.twilio.com/docs/usage/security/validating-requests) — Official signature validation docs
- [Twilio Express tutorial](https://www.twilio.com/docs/usage/tutorials/how-to-secure-your-express-app-by-validating-incoming-twilio-requests) — Verified Express integration pattern
- [Twilio npm package](https://www.npmjs.com/package/twilio) — SDK v5.11.2 verified
- [Node.js child_process](https://nodejs.org/api/child_process.html) — execFile security documentation
- [tmux manual page](https://man7.org/linux/man-pages/man1/tmux.1.html) — send-keys -l flag reference

### Secondary (MEDIUM confidence)

- [Node.js security best practices](https://www.nodejs-security.com/blog/secure-javascript-coding-practices-against-command-injection-vulnerabilities) — Command injection prevention patterns
- [ngrok Twilio integration](https://ngrok.com/docs/integrations/webhooks/twilio-webhooks) — Webhook setup with tunnels

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — All packages verified on npm, current versions confirmed
- Architecture: HIGH — Service layer pattern is standard Express practice, verified with official docs
- Pitfalls: HIGH — Command injection and webhook security are well-documented vulnerabilities with clear mitigations
- Code examples: HIGH — All examples verified against official documentation

**Research date:** 2026-02-15
**Valid until:** ~60 days (stack is stable, Node.js/Express/Twilio evolve slowly)
