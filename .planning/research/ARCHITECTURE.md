# Architecture Research

**Domain:** SMS-based terminal relay system
**Researched:** 2026-02-15
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────┐   HTTP POST     ┌──────────────────────────────────────┐
│   Claude Code    │ ──────────────► │          Relay Server                │
│  (runs in tmux)  │                 │                                      │
│                  │                 │  ┌──────────┐  ┌────────────────┐   │
│  Hook fires on   │                 │  │  Routes   │  │  State Manager │   │
│  Notification/   │                 │  │ /notify   │  │  (projects,    │   │
│  Stop events     │                 │  │ /sms      │  │   armed flag)  │   │
│                  │  tmux send-keys │  └─────┬────┘  └───────┬────────┘   │
│                  │ ◄────────────── │        │               │            │
└──────────────────┘                 │  ┌─────┴────┐  ┌──────┴─────────┐  │
                                     │  │  Tmux    │  │  Twilio        │  │
                                     │  │  Service │  │  Service       │  │
                                     │  └──────────┘  └──────┬─────────┘  │
                                     └────────────────────────┼────────────┘
                                                              │
                                          Twilio API ─────────┤
                                                              │
                                     ┌────────────────────────┼────────────┐
                                     │       Twilio Cloud     │            │
                                     │                        ▼            │
                                     │  Outbound SMS ──► Your Phone       │
                                     │  Inbound SMS ◄── Your Phone        │
                                     │       │                             │
                                     └───────┼─────────────────────────────┘
                                             │
                                     Webhook POST to /sms/inbound
                                     (via ngrok/Tailscale Funnel)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Hook Receiver (`/api/notify`) | Accept Claude Code hook payloads, trigger notification flow | Express POST route with bearer auth |
| SMS Inbound (`/sms/inbound`) | Receive Twilio webhook for user replies, parse and route | Express POST route with Twilio signature validation |
| Tmux Service | All terminal interaction — capture context, send keystrokes | Class wrapping child_process.execFile for tmux commands |
| Twilio Service | Send outbound SMS, format messages within SMS limits | Class wrapping Twilio SDK client.messages.create() |
| State Manager | Track registered projects, tmux session mappings, armed state | In-memory Map objects (no database needed for single-user) |
| Auth Middleware | Validate bearer token on hook routes, Twilio signature on SMS routes | Express middleware functions |

## Recommended Project Structure

```
claude-sms-connect/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts              # Express server entrypoint
│   ├── routes/
│   │   ├── notify.ts         # POST /api/notify — Claude Code hook handler
│   │   ├── sms.ts            # POST /sms/inbound — Twilio webhook handler
│   │   └── health.ts         # GET /api/health — health check
│   ├── services/
│   │   ├── tmux.ts           # tmux capture-pane, send-keys, list-sessions
│   │   ├── twilio.ts         # SMS sending, message formatting
│   │   └── state.ts          # Project registry, armed state, prompt queue
│   ├── middleware/
│   │   ├── auth.ts           # Bearer token validation
│   │   └── twilio-auth.ts    # Twilio request signature validation
│   ├── lib/
│   │   ├── sanitize.ts       # Sensitive data filtering, ANSI stripping
│   │   └── sms-parser.ts     # Parse inbound SMS ("1 Y", "ON", "OFF", freeform)
│   └── types.ts              # TypeScript interfaces
├── hooks/
│   └── claude-relay-hook.json  # Ready-to-use Claude Code hook config
└── scripts/
    └── setup.sh              # One-command setup
```

### Structure Rationale

- **routes/:** One file per HTTP endpoint — keeps routing logic isolated
- **services/:** Business logic separated from HTTP concerns — tmux, twilio, and state are independently testable
- **middleware/:** Auth is cross-cutting — separate from route logic
- **lib/:** Pure utility functions — no side effects, easy to unit test
- **Single package (no monorepo):** No client app means no need for workspaces

## Architectural Patterns

### Pattern 1: Service Layer Abstraction

**What:** All tmux and Twilio operations go through service classes, never called directly from routes.
**When to use:** Always — this is the core pattern.
**Trade-offs:** Slight indirection, but makes testing and error handling clean.

**Example:**
```typescript
// routes/notify.ts — thin route, delegates to services
router.post('/api/notify', auth, async (req, res) => {
  const context = await tmuxService.captureContext(session);
  const filtered = sanitize(context);
  await twilioService.sendNotification(phone, projectId, filtered);
  res.sendStatus(200);
});
```

### Pattern 2: In-Memory State (No Database)

**What:** All project state lives in memory — project registry, armed flag, prompt queue.
**When to use:** Single-user, single-machine systems with no persistence requirement.
**Trade-offs:** State lost on restart; acceptable because projects re-register on next hook fire.

**Example:**
```typescript
// services/state.ts
class StateManager {
  private projects = new Map<number, ProjectInfo>();
  private armed = false;
  private nextId = 1;

  registerProject(name: string, session: string): number { ... }
  getProject(id: number): ProjectInfo | undefined { ... }
  setArmed(value: boolean): void { ... }
  isArmed(): boolean { ... }
}
```

### Pattern 3: Message Parsing with Command Pattern

**What:** Inbound SMS parsed into structured commands (arm, disarm, reply, refresh).
**When to use:** When inbound messages have multiple formats to handle.
**Trade-offs:** Slightly over-engineered for current scope, but extensible.

**Example:**
```typescript
// lib/sms-parser.ts
type SmsCommand =
  | { type: 'arm' }
  | { type: 'disarm' }
  | { type: 'reply'; projectId: number; text: string }
  | { type: 'unknown'; raw: string };

function parseSms(body: string): SmsCommand { ... }
```

## Data Flow

### Outbound Flow (Claude Code → Phone)

```
Claude Code Hook fires
    ↓
POST /api/notify (bearer auth)
    ↓
StateManager.isArmed() → if false, return 200 (silently ignore)
    ↓
StateManager.registerOrGet(project)
    ↓
TmuxService.captureContext(session, 30 lines)
    ↓
sanitize(context) — strip ANSI, filter secrets
    ↓
TwilioService.sendSms(phone, formatMessage(project, context))
    ↓
Return 200 to hook (never block Claude Code)
```

### Inbound Flow (Phone → Claude Code)

```
User texts reply (e.g., "1 Y")
    ↓
Twilio delivers POST /sms/inbound (signature validated)
    ↓
smsParser.parse(body) → { type: 'reply', projectId: 1, text: 'Y' }
    ↓
StateManager.getProject(1) → { session: 'claude-project-a' }
    ↓
TmuxService.sendKeys(session, 'Y')
    ↓
TwilioService.sendConfirmation(phone, "Sent 'Y' to project-a")
    ↓
Return TwiML empty response
```

### Key Data Flows

1. **Hook → SMS:** Claude Code hook triggers notification, server captures tmux context, sends SMS
2. **SMS → tmux:** User reply is parsed, routed to correct project's tmux session, keystrokes sent
3. **Arming:** "ON"/"OFF" texts toggle the armed flag — when disarmed, hooks are silently acknowledged

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-3 projects | In-memory state is fine, single Express server |
| 3-10 projects | May need smarter SMS formatting (abbreviate context more) |
| 10+ projects | Consider project grouping or priority-based notifications |

This is fundamentally a single-user tool. Scaling means more simultaneous projects, not more users.

### Scaling Priorities

1. **First bottleneck:** SMS message length with many active projects — solved by smarter formatting
2. **Second bottleneck:** Notification noise with many projects — solved by per-project arming

## Anti-Patterns

### Anti-Pattern 1: String Interpolation for tmux Commands

**What people do:** `exec(\`tmux send-keys -t ${session} "${input}"\`)`
**Why it's wrong:** Command injection — user input (from SMS) goes directly to shell
**Do this instead:** `execFile('tmux', ['send-keys', '-t', session, '-l', input])`

### Anti-Pattern 2: Blocking on tmux Operations

**What people do:** Use synchronous exec calls in request handlers
**Why it's wrong:** Blocks the event loop, delays HTTP responses, could make Claude Code hang
**Do this instead:** Use async exec (promisified) with timeouts

### Anti-Pattern 3: Database for Single-User State

**What people do:** Set up SQLite/Redis for project state
**Why it's wrong:** Overkill — adds dependency, migration overhead for data that reconstructs on hook fire
**Do this instead:** In-memory Maps, accept state loss on restart

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Twilio | REST API via SDK (outbound), Webhook (inbound) | Need ngrok/tunnel for inbound webhook delivery to localhost |
| tmux | child_process.execFile for all commands | Must handle missing session gracefully |
| Claude Code | Hook system (outbound HTTP POST) | Hook config in ~/.claude/settings.json |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Routes ↔ Services | Direct function calls | Routes are thin, services do the work |
| TmuxService ↔ Shell | execFile with args array | Never string interpolation |
| TwilioService ↔ Twilio API | SDK method calls | SDK handles auth, retries |
| StateManager ↔ Everything | In-memory, synchronous reads | No async overhead for state lookups |

## Sources

- Twilio SMS webhook documentation
- tmux man page (send-keys, capture-pane, has-session)
- Express.js best practices for webhook servers
- Node.js child_process security documentation

---
*Architecture research for: SMS-based terminal relay*
*Researched: 2026-02-15*
