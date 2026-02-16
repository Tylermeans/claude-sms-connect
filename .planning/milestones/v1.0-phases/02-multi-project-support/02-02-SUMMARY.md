---
phase: 02-multi-project-support
plan: 02
subsystem: api
tags: [multi-project, sms-routing, arming-controls, numbered-prompts, ops-05]

# Dependency graph
requires:
  - phase: 02-multi-project-support
    plan: 01
    provides: ProjectRegistry singleton, rate limiter middleware
  - phase: 01-core-server-twilio-integration
    provides: Route handlers, tmux/twilio services
provides:
  - Multi-project notification routing with numbered prompts
  - ON/OFF arming controls via SMS
  - Welcome messages for new project registration
  - Graceful missing session handling with cleanup
affects: [phase-3-end-to-end-testing, production-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [Numbered SMS prompts, arming state control, session validation before routing]

key-files:
  created: []
  modified:
    - src/routes/notify.ts
    - src/routes/sms.ts
    - src/types.ts
    - src/services/project-registry.ts

key-decisions:
  - "Numbered prompts use 1-indexed display for users, converted to 0-indexed internally"
  - "System checks armed state before sending notifications (suppresses when OFF)"
  - "Welcome SMS only sent when system is armed (avoids notification noise per RELAY-09)"
  - "Added findProjectIdBySession to ProjectRegistry for OPS-05 cleanup support"
  - "Single-project mode uses Phase 1 format (no numbered list) for simplicity"
  - "Multi-project messages use shorter context (200 chars vs 450) to fit project list in SMS"

patterns-established:
  - "Arming check happens after registration but before rate limiting"
  - "Welcome SMS sent immediately for new projects when armed"
  - "Missing sessions trigger error SMS + registry cleanup"
  - "Plain responses (no number) route to sole active project for backward compatibility"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 02 Plan 02: Multi-Project Route Integration Summary

**Wire ProjectRegistry and rate limiter into notify/SMS routes enabling numbered prompts, ON/OFF controls, welcome messages, and graceful session handling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T00:15:16Z
- **Completed:** 2026-02-16T00:18:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- notify.ts registers projects on every notification and respects arming state
- Welcome SMS sent to new projects when system is armed (RELAY-10)
- Numbered prompts displayed when multiple projects active (RELAY-07)
- ON/OFF commands control arming state with confirmation SMS (RELAY-09)
- Numbered responses parsed and routed to correct project ("1 Y" -> project index 0) (RELAY-08)
- Missing tmux sessions handled gracefully with error SMS and registry cleanup (OPS-05)
- Rate limiter middleware applied to /api/notify route (OPS-01)
- All Phase 2 requirements satisfied: RELAY-07, RELAY-08, RELAY-09, RELAY-10, OPS-01, OPS-05

## Task Commits

Each task was committed atomically:

1. **Task 1: Update notify.ts for multi-project registration** - `1d37fc0` (feat)
2. **Task 2: Update sms.ts for ON/OFF commands and numbered routing** - `ac99400` (feat)

## Files Created/Modified
- `src/routes/notify.ts` - Multi-project notification handler with registration, arming checks, welcome SMS, numbered prompts
- `src/routes/sms.ts` - Multi-project SMS routing with ON/OFF commands, numbered response parsing, graceful session handling
- `src/types.ts` - Added optional project_id, project_name, tmux_session fields to NotificationPayload
- `src/services/project-registry.ts` - Added findProjectIdBySession helper for OPS-05 cleanup

## Decisions Made

1. **Numbered prompts use 1-indexed display** - Users see "[1] project-a", which converts to 0-indexed array access internally. Matches user mental model (people count from 1, not 0).

2. **System checks armed state before processing notifications** - Even if a project is registered, notifications are suppressed when armed=false. This prevents notification noise per RELAY-09 requirement.

3. **Welcome SMS only sent when armed** - New projects are always registered (so they appear in project list), but welcome SMS is only sent if system is armed. Avoids notification noise.

4. **Added findProjectIdBySession to ProjectRegistry** - Enables cleanup of stale projects when tmux sessions disappear (OPS-05). ProjectRegistry uses Map with projectId keys, but cleanup path only knows sessionId.

5. **Single-project mode uses simple format** - When only one project is active, skip numbered list and use Phase 1 format ("Claude Code needs input"). Reduces SMS length and improves UX for single-project users.

6. **Multi-project messages use shorter context** - 200 chars vs 450 chars for single-project. Project list consumes SMS space, so context must be abbreviated to fit in 160-char SMS segments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing critical functionality] Added findProjectIdBySession to ProjectRegistry**
- **Found during:** Task 2
- **Issue:** OPS-05 requires removing stale projects when tmux session missing. Cleanup path only knows sessionId, but ProjectRegistry.remove() requires projectId. Map keys are projectIds, not sessionIds.
- **Fix:** Added findProjectIdBySession() method to ProjectRegistry that iterates over Map entries to find projectId by sessionId.
- **Files modified:** src/services/project-registry.ts
- **Commit:** ac99400 (Task 2)

## Issues Encountered

None - plan executed successfully with one inline fix (documented above).

## User Setup Required

None - no external configuration changes required. All changes are internal route logic using existing environment variables and services.

## Next Phase Readiness

Phase 2 complete. All requirements satisfied:
- ✅ RELAY-07: Numbered prompts for multi-project scenarios
- ✅ RELAY-08: Numbered response parsing and routing
- ✅ RELAY-09: ON/OFF arming commands with confirmation
- ✅ RELAY-10: Welcome SMS for new projects
- ✅ OPS-01: Rate limiting applied (via Plan 01 middleware)
- ✅ OPS-05: Graceful missing session handling with cleanup

Ready for Phase 3 (End-to-End Testing).

## Self-Check: PASSED

All files verified:
- FOUND: src/routes/notify.ts
- FOUND: src/routes/sms.ts
- FOUND: src/types.ts
- FOUND: src/services/project-registry.ts

All commits verified:
- FOUND: 1d37fc0 (Task 1)
- FOUND: ac99400 (Task 2)

---
*Phase: 02-multi-project-support*
*Completed: 2026-02-15*
