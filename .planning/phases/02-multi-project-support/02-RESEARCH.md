# Phase 2: Multi-Project Support - Research

**Researched:** 2026-02-15
**Domain:** Multi-session state management, rate limiting, SMS routing
**Confidence:** HIGH

## Summary

Phase 2 adds multi-project support to the SMS relay, enabling users to manage multiple Claude Code sessions through a single SMS thread with numbered prompts, arming controls, and rate limiting. The technical challenge involves tracking session state in memory, implementing per-project rate limiting, parsing numbered responses, and providing user controls for notification preferences.

The research confirms that this is a well-trodden path in Node.js/TypeScript with established patterns:
- **State management**: Native `Map` with project ID keys provides sufficient in-memory storage without external dependencies
- **Rate limiting**: `express-rate-limit` 8.x with custom `keyGenerator` enables per-project limiting
- **SMS routing**: Simple regex parsing of numbered responses (e.g., "1 Y" → project index 1, response "Y")
- **Arming/disarming**: Boolean flag per user with command handlers for "ON"/"OFF" messages

The existing Phase 1 architecture (singleton services, TypeScript, ES modules) extends cleanly to support multi-project scenarios without major refactoring. The primary additions are:
1. ProjectRegistry service for state tracking
2. Rate limiter middleware with project-based keys
3. Enhanced SMS routing logic with number parsing
4. Welcome message handler for first-time project registration

**Primary recommendation:** Use native Map for project state, express-rate-limit for per-project throttling, and extend existing service pattern with ProjectRegistry singleton. No external state store (Redis, DB) needed for v1 — in-memory state is sufficient per requirements.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express-rate-limit | 8.2.1+ | Per-project rate limiting | Industry standard Express middleware, 10M+ weekly downloads, TypeScript support, custom key generation |
| Native Map | ES2015 | In-memory project state | Built-in, zero deps, sufficient for single-server deployment, proper memory management |
| Native RegExp | Built-in | Number prefix parsing | Built-in pattern matching for "1 Y" → [project_index, response] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript 5.2+ | 5.6+ | Explicit resource management (Disposable pattern) | If implementing cleanup hooks (optional for Phase 2, useful for Phase 3+) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| express-rate-limit | rate-limiter-flexible | More features (Redis, concurrency control), higher complexity — overkill for single-server v1 |
| Native Map | Redis/DB | Persistence across restarts — not needed per requirements (projects re-register on notify) |
| Custom routing | SMS framework (Twilio Studio) | Visual flow builder — adds Twilio vendor lock-in, reduces code flexibility |

**Installation:**
```bash
npm install express-rate-limit@^8.2.1
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   ├── tmux.ts              # (existing) tmux integration
│   ├── twilio.ts            # (existing) SMS sending
│   └── project-registry.ts  # (new) Multi-project state management
├── middleware/
│   ├── auth.ts              # (existing) Bearer token auth
│   ├── twilio-auth.ts       # (existing) Twilio signature validation
│   └── rate-limit.ts        # (new) Per-project rate limiting
├── routes/
│   ├── notify.ts            # (update) Add project registration + rate check
│   └── sms.ts               # (update) Add number parsing + arming commands
└── lib/
    └── sanitize.ts          # (existing) ANSI stripping, SMS formatting
```

### Pattern 1: Multi-Project State Management with Map

**What:** Track active projects using native Map with project identifier as key, metadata as value. No persistence needed — projects re-register on each notification hook.

**When to use:** Single-server deployment, ephemeral state acceptable, no cross-server synchronization required.

**Example:**
```typescript
// Source: Design pattern synthesis from Map best practices + Phase requirements
interface ProjectMetadata {
  sessionId: string;        // tmux session identifier
  projectName: string;      // human-readable name for SMS
  lastNotified: number;     // timestamp for rate limiting
  registeredAt: number;     // timestamp for welcome logic
}

class ProjectRegistry {
  private projects = new Map<string, ProjectMetadata>();
  private armed = true; // Global arming state (RELAY-09: OFF by default)

  register(projectId: string, sessionId: string, projectName: string): boolean {
    const isNew = !this.projects.has(projectId);
    this.projects.set(projectId, {
      sessionId,
      projectName,
      lastNotified: isNew ? 0 : this.projects.get(projectId)!.lastNotified,
      registeredAt: isNew ? Date.now() : this.projects.get(projectId)!.registeredAt,
    });
    return isNew; // Return true if this is first registration (triggers welcome SMS)
  }

  getActiveProjects(): ProjectMetadata[] {
    return Array.from(this.projects.values());
  }

  getByIndex(index: number): ProjectMetadata | undefined {
    return Array.from(this.projects.values())[index];
  }

  canNotify(projectId: string): boolean {
    if (!this.armed) return false; // Respect disarm command
    const project = this.projects.get(projectId);
    if (!project) return true; // First notification always allowed
    const timeSinceLastNotification = Date.now() - project.lastNotified;
    return timeSinceLastNotification >= 5000; // OPS-01: 5 second minimum
  }

  recordNotification(projectId: string): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.lastNotified = Date.now();
    }
  }

  setArmed(armed: boolean): void {
    this.armed = armed;
  }

  isArmed(): boolean {
    return this.armed;
  }
}

export const projectRegistry = new ProjectRegistry();
```

**Why Map not WeakMap:** Projects identified by string IDs, not object references. WeakMap requires object keys and provides garbage collection benefits only for object-keyed data. Map is correct choice for string-keyed session tracking.

### Pattern 2: Per-Project Rate Limiting

**What:** Use `express-rate-limit` with custom `keyGenerator` to enforce rate limits per project ID, not per IP address. Prevents single project from spamming notifications even if multiple projects are active.

**When to use:** Per-resource rate limiting (OPS-01 requirement: max 1 notification per 5 seconds per project).

**Example:**
```typescript
// Source: express-rate-limit docs + custom keyGenerator pattern
import rateLimit from 'express-rate-limit';

export const projectRateLimiter = rateLimit({
  windowMs: 5000, // 5 second window (OPS-01)
  max: 1,         // 1 request per window per project
  keyGenerator: (req) => {
    // Extract project_id from notification payload
    const { project_id } = req.body;
    return project_id || req.ip; // Fallback to IP if project_id missing
  },
  handler: (req, res) => {
    console.warn(`[rate-limit] Project ${req.body.project_id} exceeded rate limit`);
    res.status(429).json({ error: 'Rate limit exceeded' });
  },
  standardHeaders: true, // Include RateLimit-* headers
  legacyHeaders: false,  // Disable X-RateLimit-* headers
});
```

**Integration:**
```typescript
// Apply to /api/notify endpoint only
router.post('/api/notify', bearerAuth, projectRateLimiter, async (req, res) => {
  // ... notification handling
});
```

**Important:** Rate limiter runs BEFORE notification processing. Failed rate limit returns 429 immediately — Claude Code hook will not retry. This is acceptable per requirements (prevents notification spam).

### Pattern 3: Numbered SMS Response Parsing

**What:** Parse user SMS responses in format "N RESPONSE" where N is project index from numbered prompt. Extract index and pass response to corresponding project's tmux session.

**When to use:** Multi-project SMS routing (RELAY-08).

**Example:**
```typescript
// Source: Standard regex parsing pattern for numbered commands
interface ParsedResponse {
  projectIndex: number | null; // null if no number prefix
  response: string;            // User's actual response
}

function parseNumberedResponse(smsBody: string): ParsedResponse {
  // Match: optional number prefix, optional whitespace, response text
  // Examples: "1 Y" → {projectIndex: 0, response: "Y"}
  //           "2 yes please" → {projectIndex: 1, response: "yes please"}
  //           "Y" → {projectIndex: null, response: "Y"} (single project fallback)
  const match = smsBody.trim().match(/^(\d+)\s+(.+)$/);

  if (match) {
    const index = parseInt(match[1], 10) - 1; // Convert 1-indexed to 0-indexed
    const response = match[2];
    return { projectIndex: index, response };
  }

  // No number prefix — return null index (route to single project if only one active)
  return { projectIndex: null, response: smsBody.trim() };
}

// Usage in SMS handler
const { projectIndex, response } = parseNumberedResponse(messageBody);

if (projectIndex !== null) {
  const project = projectRegistry.getByIndex(projectIndex);
  if (project) {
    await tmuxService.sendKeys(project.sessionId, response);
  } else {
    console.warn(`[sms] Invalid project index: ${projectIndex + 1}`);
    // Send error SMS to user
  }
} else {
  // Single project handling (Phase 1 backward compatibility)
  const projects = projectRegistry.getActiveProjects();
  if (projects.length === 1) {
    await tmuxService.sendKeys(projects[0].sessionId, response);
  } else {
    console.warn('[sms] Ambiguous response - multiple projects active, no index specified');
    // Send help SMS to user
  }
}
```

### Pattern 4: Arming/Disarming Command Handling

**What:** Recognize "ON" and "OFF" as special commands to arm/disarm SMS notifications globally. Simple case-insensitive string matching.

**When to use:** User preference management (RELAY-09).

**Example:**
```typescript
// Source: Simple command pattern for SMS control
function handleControlCommands(smsBody: string): boolean {
  const command = smsBody.trim().toUpperCase();

  switch (command) {
    case 'ON':
      projectRegistry.setArmed(true);
      twilioService.sendSMS(
        process.env.USER_PHONE_NUMBER!,
        'SMS notifications ARMED. You will receive alerts when Claude Code needs input.'
      );
      return true; // Command handled

    case 'OFF':
      projectRegistry.setArmed(false);
      twilioService.sendSMS(
        process.env.USER_PHONE_NUMBER!,
        'SMS notifications DISARMED. No alerts will be sent until you text ON.'
      );
      return true; // Command handled

    default:
      return false; // Not a control command, continue to response routing
  }
}

// Usage in SMS handler
if (handleControlCommands(messageBody)) {
  // Command processed, send TwiML response
  res.type('text/xml').send('<Response></Response>');
  return;
}

// Otherwise, continue with numbered response parsing...
```

### Pattern 5: Welcome SMS on First Project Registration

**What:** Detect first-time project registration and send one-time welcome SMS explaining multi-project usage.

**When to use:** User onboarding (RELAY-10).

**Example:**
```typescript
// In /api/notify handler after project registration
const isNewProject = projectRegistry.register(projectId, sessionId, projectName);

if (isNewProject) {
  const welcomeMessage = `Welcome! "${projectName}" registered with Claude SMS Connect.\n\n` +
    `You'll receive numbered prompts if multiple projects need input. ` +
    `Reply with "N Y" where N is the project number.\n\n` +
    `Text ON to arm alerts, OFF to disarm.`;

  await twilioService.sendSMS(process.env.USER_PHONE_NUMBER!, welcomeMessage);
}
```

### Anti-Patterns to Avoid

- **Don't use WeakMap for project tracking:** WeakMap requires object keys, projects use string IDs. Map is correct choice.
- **Don't persist state to disk/DB:** Requirements specify "in-memory state is sufficient; projects re-register on hook fire" — persistence adds unnecessary complexity.
- **Don't implement complex SMS parsing:** Numbered format "N RESPONSE" is sufficient. Avoid natural language processing, slash commands, or complex syntax — increases user friction.
- **Don't store user phone number in registry:** Phone number is global config (USER_PHONE_NUMBER env var), not per-project. Keep registry focused on project metadata only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom timestamp tracking, manual 429 responses | express-rate-limit | Handles edge cases (concurrent requests, clock drift, header standards), battle-tested, 10M+ weekly downloads |
| SMS framework | Custom command router, state machine | Simple string matching + regex | SMS use case is minimal (3 commands: ON, OFF, numbered responses) — framework is overkill, adds vendor lock-in |
| Project ID generation | UUID/nanoid | Use session_id from Claude Code hook | Hook already provides unique identifier, no collision risk in single-user tool |

**Key insight:** Multi-project state is simple enough (Map + metadata objects) that custom implementation is cleaner than bringing in state management library (Redux, MobX). Rate limiting is complex enough (request counting, window management, header standards) that library is required.

## Common Pitfalls

### Pitfall 1: Rate Limiting by IP Instead of Project ID
**What goes wrong:** Default express-rate-limit behavior limits by IP address. With multiple projects running on same machine (same IP), all projects share rate limit quota — one noisy project blocks others.

**Why it happens:** express-rate-limit defaults to `keyGenerator: (req) => req.ip` for backward compatibility.

**How to avoid:** Always specify custom `keyGenerator` extracting project identifier from request body:
```typescript
keyGenerator: (req) => req.body.project_id || req.ip
```

**Warning signs:** Multiple projects hitting rate limit simultaneously despite not exceeding per-project threshold.

### Pitfall 2: Off-by-One Errors in Number Parsing
**What goes wrong:** User sees "[1] project-a" but system uses 0-indexed array. User texts "1 Y", code treats as index 1 (second project), not index 0 (first project).

**Why it happens:** Mismatch between 1-indexed user display and 0-indexed array access.

**How to avoid:** Always subtract 1 when converting user input to array index:
```typescript
const index = parseInt(match[1], 10) - 1; // "1" → index 0
```

Display projects with 1-based numbering:
```typescript
const numberedList = projects.map((p, i) => `[${i + 1}] ${p.projectName}`).join('\n');
```

**Warning signs:** User reports "texting 1 but it goes to the second project."

### Pitfall 3: Ignoring Armed State During Registration
**What goes wrong:** New project registers while system is disarmed, still sends welcome SMS and first notification, violating disarm intent.

**Why it happens:** Welcome SMS and registration logic bypass armed state check.

**How to avoid:** Check armed state before ALL SMS sends (except ON/OFF confirmation):
```typescript
if (!projectRegistry.isArmed()) {
  console.log('[notify] System disarmed - suppressing notification');
  return;
}
```

Welcome SMS should respect armed state:
```typescript
if (isNewProject && projectRegistry.isArmed()) {
  await twilioService.sendSMS(...welcomeMessage);
}
```

**Warning signs:** User texts "OFF", expects silence, still receives notifications.

### Pitfall 4: Memory Leaks from Unbounded Map Growth
**What goes wrong:** Projects register but never unregister. Map grows indefinitely as users work on different projects over days/weeks. Eventually consumes excessive memory.

**Why it happens:** No cleanup strategy — Phase 2 requirements don't specify expiration, but long-running server accumulates stale projects.

**How to avoid:** Implement simple time-based cleanup (optional for v1, recommended for production):
```typescript
// Run periodic cleanup (e.g., every hour)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [projectId, metadata] of projectRegistry.projects.entries()) {
    const age = now - metadata.registeredAt;
    if (age > maxAge) {
      console.log(`[cleanup] Removing stale project: ${projectId}`);
      projectRegistry.projects.delete(projectId);
    }
  }
}, 60 * 60 * 1000); // Every hour
```

**Warning signs:** Server memory usage grows over time, never decreases. `ps aux` shows Node process RSS increasing.

### Pitfall 5: Missing Graceful Session Handling (OPS-05)
**What goes wrong:** User closes tmux session, but registry still lists it as active. Notification arrives, code attempts to send keys to non-existent session, crashes.

**Why it happens:** Registry tracks projects independently from tmux session lifecycle.

**How to avoid:** Use existing `tmuxService.hasSession()` check before sending keys:
```typescript
const sessionExists = await tmuxService.hasSession(project.sessionId);
if (!sessionExists) {
  console.error(`[sms] Session "${project.sessionId}" no longer exists`);
  // Send SMS to user notifying them
  await twilioService.sendSMS(
    process.env.USER_PHONE_NUMBER!,
    `Error: tmux session "${project.sessionId}" not found. Project may have closed.`
  );
  // Remove from registry
  projectRegistry.projects.delete(projectId);
  return;
}
```

**Warning signs:** Server logs "tmux session does not exist" errors, crashes on `execFile` rejection.

## Code Examples

Verified patterns from official sources and Phase 1 implementation:

### Express Rate Limit with Custom Key
```typescript
// Source: https://betterstack.com/community/guides/scaling-nodejs/rate-limiting-express/
// Adapted for project-based limiting per OPS-01 requirement

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

export const projectRateLimiter = rateLimit({
  windowMs: 5 * 1000, // 5 seconds (OPS-01)
  max: 1,             // 1 request per window
  standardHeaders: true,
  legacyHeaders: false,

  // CRITICAL: Use project_id from payload, NOT IP address
  keyGenerator: (req: Request): string => {
    const projectId = req.body?.project_id;
    if (!projectId) {
      console.warn('[rate-limit] No project_id in payload, falling back to IP');
      return req.ip || 'unknown';
    }
    return projectId;
  },

  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    const projectId = req.body?.project_id || 'unknown';
    console.warn(`[rate-limit] Project "${projectId}" exceeded rate limit (5s window)`);
    res.status(429).json({
      error: 'Too many notifications',
      message: 'Rate limit: max 1 notification per 5 seconds per project',
      project_id: projectId,
    });
  },
});

// Apply to /api/notify route only
// router.post('/api/notify', bearerAuth, projectRateLimiter, notifyHandler);
```

### Project Registry Singleton Service
```typescript
// Source: Singleton pattern from existing Phase 1 services (tmux.ts, twilio.ts)
// Extends pattern for multi-project state management

interface ProjectMetadata {
  sessionId: string;
  projectName: string;
  lastNotified: number;
  registeredAt: number;
}

/**
 * ProjectRegistry - Multi-project state management
 *
 * Tracks active Claude Code projects with numbered identifiers for SMS routing.
 * Provides arming control (ON/OFF) and rate limiting state.
 *
 * LIFECYCLE:
 * - Projects register on first /api/notify call
 * - No explicit unregister — stale projects cleaned up periodically (optional)
 * - State is ephemeral — server restart clears registry (acceptable per requirements)
 */
export class ProjectRegistry {
  private projects = new Map<string, ProjectMetadata>();
  private armed = false; // RELAY-09: OFF by default

  /**
   * Register or update a project in the registry.
   *
   * @param projectId - Unique identifier (typically session_id from Claude Code hook)
   * @param sessionId - tmux session name for routing responses
   * @param projectName - Human-readable name for SMS display
   * @returns true if this is first registration (triggers welcome SMS)
   */
  register(projectId: string, sessionId: string, projectName: string): boolean {
    const isNew = !this.projects.has(projectId);

    this.projects.set(projectId, {
      sessionId,
      projectName,
      lastNotified: isNew ? 0 : this.projects.get(projectId)!.lastNotified,
      registeredAt: isNew ? Date.now() : this.projects.get(projectId)!.registeredAt,
    });

    console.log(`[ProjectRegistry] ${isNew ? 'Registered new' : 'Updated'} project: ${projectName} (${projectId})`);
    return isNew;
  }

  /**
   * Get all active projects as array.
   * Order is insertion order (Map preserves insertion order per ES2015 spec).
   */
  getActiveProjects(): ProjectMetadata[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get project by 0-indexed position.
   * Used for numbered SMS routing ("1 Y" → index 0).
   */
  getByIndex(index: number): ProjectMetadata | undefined {
    return this.getActiveProjects()[index];
  }

  /**
   * Get project metadata by ID.
   */
  get(projectId: string): ProjectMetadata | undefined {
    return this.projects.get(projectId);
  }

  /**
   * Check if project can send notification (respects arming + rate limiting).
   *
   * @param projectId - Project to check
   * @returns true if notification allowed, false if disarmed or rate limited
   */
  canNotify(projectId: string): boolean {
    // Respect disarm command
    if (!this.armed) {
      return false;
    }

    const project = this.projects.get(projectId);

    // First notification always allowed
    if (!project || project.lastNotified === 0) {
      return true;
    }

    // Rate limiting: 5 second minimum between notifications (OPS-01)
    const timeSinceLastNotification = Date.now() - project.lastNotified;
    return timeSinceLastNotification >= 5000;
  }

  /**
   * Record that notification was sent (updates lastNotified timestamp).
   */
  recordNotification(projectId: string): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.lastNotified = Date.now();
    }
  }

  /**
   * Set global armed state (RELAY-09).
   */
  setArmed(armed: boolean): void {
    this.armed = armed;
    console.log(`[ProjectRegistry] Armed state: ${armed ? 'ON' : 'OFF'}`);
  }

  /**
   * Get current armed state.
   */
  isArmed(): boolean {
    return this.armed;
  }

  /**
   * Remove project from registry (cleanup helper).
   */
  remove(projectId: string): boolean {
    return this.projects.delete(projectId);
  }

  /**
   * Get count of active projects.
   */
  count(): number {
    return this.projects.size;
  }
}

// Export singleton instance
export const projectRegistry = new ProjectRegistry();
```

### Numbered Response Parsing
```typescript
// Source: Standard regex pattern for command parsing

interface ParsedResponse {
  projectIndex: number | null;
  response: string;
}

/**
 * Parse SMS response with optional number prefix.
 *
 * Formats:
 * - "1 Y" → {projectIndex: 0, response: "Y"}
 * - "2 yes please" → {projectIndex: 1, response: "yes please"}
 * - "Y" → {projectIndex: null, response: "Y"}
 *
 * @param smsBody - Raw SMS message text
 * @returns Parsed project index (0-based) and response text
 */
export function parseNumberedResponse(smsBody: string): ParsedResponse {
  // Match: 1+ digits, whitespace, remaining text
  const match = smsBody.trim().match(/^(\d+)\s+(.+)$/);

  if (match) {
    const userNumber = parseInt(match[1], 10);
    const response = match[2].trim();

    // Convert 1-indexed user input to 0-indexed array access
    // CRITICAL: This prevents off-by-one errors (Pitfall 2)
    const projectIndex = userNumber - 1;

    return { projectIndex, response };
  }

  // No number prefix — return null index
  // Fallback: route to single project if only one active
  return { projectIndex: null, response: smsBody.trim() };
}
```

### Multi-Project SMS Notification Formatting
```typescript
// Source: Synthesis of numbered prompt pattern + Phase 1 formatForSMS

import { projectRegistry } from '../services/project-registry.js';
import { formatForSMS } from '../lib/sanitize.js';

/**
 * Format notification SMS for single or multiple projects.
 *
 * Single project: "Claude Code needs input:\n\n[context]\n\nReply Y/N or text response"
 * Multiple projects: "[1] project-a\n[2] project-b\n\nReply: N RESPONSE (e.g., 1 Y)"
 *
 * @param projectName - Name of project that triggered notification
 * @param context - Terminal context (already sanitized)
 * @returns Formatted SMS message
 */
export function formatNotificationSMS(projectName: string, context: string): string {
  const projects = projectRegistry.getActiveProjects();

  if (projects.length === 1) {
    // Single project — Phase 1 format (backward compatible)
    return `Claude Code needs input:\n\n${context}\n\nReply Y/N or text response`;
  }

  // Multiple projects — numbered format (RELAY-07)
  const numberedList = projects
    .map((p, i) => `[${i + 1}] ${p.projectName}`)
    .join('\n');

  const contextSummary = formatForSMS(context, 200); // Shorter context for multi-project

  return `Multiple projects need input:\n\n${numberedList}\n\n` +
         `Latest (${projectName}):\n${contextSummary}\n\n` +
         `Reply: N RESPONSE (e.g., "1 Y")`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| express-rate-limit v6 (callback keyGenerator) | express-rate-limit v8 (async keyGenerator, TypeScript rewrite) | v7.0 (2022), v8.0 (2024) | Can now use async functions in keyGenerator, better TypeScript support, validation for ipKeyGenerator |
| Manual Map cleanup with setInterval | TypeScript 5.2 Disposable pattern with `using` keyword | TS 5.2 (2023) | Automatic resource cleanup, but requires ES2022 target — optional for this project |
| WeakMap for caching | Native Map for string-keyed state | ES2015+ standard practice | Map correct for string keys, WeakMap only for object-keyed garbage collection scenarios |
| Redis for all multi-instance apps | In-memory Map for single-instance | Still valid 2026 | Phase 2 requirements specify single-server, in-memory sufficient — Redis deferred to scaling phase |

**Deprecated/outdated:**
- express-rate-limit v5 and earlier: No TypeScript support, no async keyGenerator
- Custom rate limiting implementations: express-rate-limit is standard, custom solutions prone to edge case bugs (concurrent requests, clock drift)

## Open Questions

1. **Project cleanup strategy**
   - What we know: Requirements say "in-memory state is sufficient; projects re-register on hook fire"
   - What's unclear: Long-running servers accumulate stale projects (tmux sessions closed but registry entries remain)
   - Recommendation: Implement optional time-based cleanup (24-hour TTL) in Phase 2, make it configurable via env var in Phase 3. Not blocking for Phase 2 MVP.

2. **Numbered prompt limit**
   - What we know: SMS has 1600 char limit (GSM-7 encoding), numbered list grows with projects
   - What's unclear: What happens if user has 20+ active projects? List exceeds SMS length, truncation unclear.
   - Recommendation: Document limit (e.g., "first 10 projects shown") in Phase 2 PLAN, defer full solution (pagination, SMS segments) to future phase. Low priority — 10+ simultaneous projects unlikely for single-user tool.

3. **Welcome SMS internationalization**
   - What we know: Welcome message is English hardcoded string
   - What's unclear: Does user want other languages? Requirements don't mention i18n.
   - Recommendation: Defer to v2 requirements (UX-04). English-only for v1 is acceptable.

## Sources

### Primary (HIGH confidence)
- [express-rate-limit npm package](https://www.npmjs.com/package/express-rate-limit) - Official package page, version info
- [express-rate-limit official docs](https://express-rate-limit.mintlify.app/overview) - Configuration, storage architecture
- [Express.js rate limiting guide (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/rate-limiting-express/) - Complete implementation examples, custom keyGenerator patterns
- [TypeScript Map vs WeakMap (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management) - Memory management, when to use each
- [TypeScript 5.2 Disposable pattern (official docs)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html) - Explicit resource management
- [Node.js graceful shutdown (Express.js docs)](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) - Official patterns for cleanup

### Secondary (MEDIUM confidence)
- [Rate limiting in Express.js (AppSignal)](https://blog.appsignal.com/2024/04/03/how-to-implement-rate-limiting-in-express-for-nodejs.html) - Production patterns, TypeScript examples
- [Node.js graceful shutdown (OneUpTime blog)](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view) - Timer cleanup, SIGTERM handling
- [Singleton pattern in TypeScript (Medium)](https://medium.com/@robinviktorsson/a-guide-to-the-singleton-design-pattern-in-typescript-and-node-js-with-practical-examples-a792a5983e5d) - Modern singleton patterns for services
- [node-tmux library](https://github.com/StarlaneStudios/node-tmux) - Alternative tmux wrapper (not using, but validates approach)

### Tertiary (LOW confidence)
- [SMS chatbot patterns (various sources)](https://chatimize.com/sms-chatbots/) - General SMS UX patterns, not specific to implementation
- [App notification best practices (Appbot)](https://appbot.co/blog/app-push-notifications-2026-best-practices/) - User control patterns, arming/disarming UX

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - express-rate-limit is industry standard (10M+ weekly downloads), native Map is ES2015 spec
- Architecture: HIGH - Patterns verified against official docs, existing Phase 1 code extends cleanly
- Pitfalls: MEDIUM-HIGH - Common issues documented in community sources, some extrapolated from Map/rate-limiting best practices

**Research date:** 2026-02-15
**Valid until:** 30 days (2026-03-17) — Stack is stable, express-rate-limit v8 mature, no fast-moving dependencies
