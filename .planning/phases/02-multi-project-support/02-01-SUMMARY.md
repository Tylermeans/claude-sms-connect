---
phase: 02-multi-project-support
plan: 01
subsystem: api
tags: [express-rate-limit, singleton, rate-limiting, state-management]

# Dependency graph
requires:
  - phase: 01-core-server-twilio-integration
    provides: Singleton service pattern (tmux.ts, twilio.ts), middleware pattern (auth.ts)
provides:
  - ProjectRegistry singleton for multi-project state tracking
  - Per-project rate limiter middleware using express-rate-limit
  - Arming control system (OFF by default per RELAY-09)
  - First-registration detection for welcome SMS (RELAY-10)
affects: [02-02, 02-multi-project-support, multi-project-routing]

# Tech tracking
tech-stack:
  added: [express-rate-limit@8.2.1]
  patterns: [Map-based state tracking, per-project rate limiting by request body key]

key-files:
  created:
    - src/services/project-registry.ts
    - src/middleware/rate-limit.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Use project_id from request body (not IP) for rate limiting - all projects run on same machine"
  - "Start ProjectRegistry disarmed (armed=false) per RELAY-09 to avoid notification noise"
  - "register() returns boolean to trigger welcome SMS only on first registration (RELAY-10)"
  - "Preserve lastNotified and registeredAt when updating existing projects"
  - "Use Map for projects storage - ES2015 guarantees insertion order for numbered SMS display"

patterns-established:
  - "Per-project rate limiting uses request body keys instead of IP addresses"
  - "canNotify() enforces both global arming state AND per-project rate limits"
  - "Rate limiter returns 429 with project context (project_id in response)"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 02 Plan 01: Multi-Project Foundation Summary

**ProjectRegistry singleton with Map-based state tracking and per-project rate limiter using express-rate-limit with request body keying**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16T00:11:18Z
- **Completed:** 2026-02-16T00:13:12Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ProjectRegistry service tracks multiple projects with unique IDs using Map (insertion order preserved)
- Arming system defaults to OFF (armed=false) per RELAY-09 requirement
- register() returns boolean for first-registration detection (welcome SMS trigger per RELAY-10)
- Per-project rate limiter enforces 1 notification per 5 seconds per project_id (OPS-01)
- Rate limiting uses project_id from request body (not IP) to support multiple projects on same machine

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ProjectRegistry service** - `4249494` (feat)
2. **Task 2: Install express-rate-limit and create rate limiter** - `72b0477` (feat)

## Files Created/Modified
- `src/services/project-registry.ts` - Multi-project state management singleton with arming controls
- `src/middleware/rate-limit.ts` - Per-project rate limiter with project_id keying
- `package.json` - Added express-rate-limit@8.2.1 dependency
- `package-lock.json` - Dependency lockfile updated

## Decisions Made

1. **Use project_id from request body for rate limiting** - All Claude Code projects run on same machine with same IP address. IP-based rate limiting would incorrectly block all projects when one hits the limit. Using project_id from request body enables independent rate limits per project.

2. **Start ProjectRegistry disarmed (armed=false)** - Per RELAY-09 requirement (OFF by default) to avoid notification noise until user explicitly arms the system.

3. **register() returns boolean** - Returns true only on first registration to trigger welcome SMS (RELAY-10). Subsequent updates return false to avoid duplicate welcome messages.

4. **Preserve lastNotified/registeredAt on updates** - When re-registering existing projects, preserve rate limiting state to maintain accurate 5-second windows and registration timestamps.

5. **Use Map for projects storage** - ES2015 Map spec guarantees insertion order preservation, enabling consistent numbered display for SMS routing ("1 Y" maps to first project).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for these foundation modules.

## Next Phase Readiness

Ready for Plan 02 (route integration):
- ProjectRegistry ready to wire into /api/notify and /api/sms endpoints
- Rate limiter middleware ready to apply to /api/notify route
- Arming controls ready for /api/arm endpoint implementation

No blockers. These are pure additions (no existing files modified except package.json).

## Self-Check: PASSED

All files verified:
- FOUND: src/services/project-registry.ts
- FOUND: src/middleware/rate-limit.ts

All commits verified:
- FOUND: 4249494 (Task 1)
- FOUND: 72b0477 (Task 2)

---
*Phase: 02-multi-project-support*
*Completed: 2026-02-15*
