---
phase: 01-core-server-twilio-integration
plan: 02
subsystem: tmux-integration
tags: [tmux, security, sanitization, command-injection-prevention]
dependency_graph:
  requires: []
  provides:
    - tmux-service
    - sanitize-library
    - sms-text-formatting
  affects: []
tech_stack:
  added:
    - strip-ansi@^7.1.2
  patterns:
    - execFile-with-args-array
    - literal-flag-for-user-input
    - session-name-validation
    - ansi-code-stripping
    - gsm7-encoding-optimization
key_files:
  created:
    - src/lib/sanitize.ts
    - src/services/tmux.ts (created in 01-01)
  modified: []
decisions:
  - id: execfile-only
    summary: Use execFile with args arrays, never exec()
    rationale: Prevents shell injection attacks - user input never passes through shell parsing
    alternatives: [exec with escaping, shell with validation]
    outcome: All tmux commands use execFileAsync with array args
  - id: literal-flag
    summary: Use -l (literal) flag for tmux send-keys with user input
    rationale: Prevents tmux key binding interpretation (e.g., "C-c" sent as text, not Ctrl+C)
    alternatives: [escape special sequences, allowlist]
    outcome: sendKeys always uses -l flag for user input, Enter sent separately
  - id: session-validation
    summary: Validate session names with strict regex before tmux commands
    rationale: Prevents command injection via session name parameter
    alternatives: [escape session names, tmux validation]
    outcome: validateSessionName enforces /^[a-zA-Z0-9_-]+$/
  - id: gsm7-optimization
    summary: Strip non-ASCII characters to force GSM-7 encoding
    rationale: GSM-7 = 160 chars/segment vs UCS-2 = 70 chars/segment, significant cost savings
    alternatives: [allow unicode, per-message encoding detection]
    outcome: formatForSMS removes non-ASCII, limits to 450 chars (3 segments)
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_created: 1
  files_modified: 0
  commits: 2
  completed_date: 2026-02-15
---

# Phase 01 Plan 02: Tmux Integration Service Summary

**One-liner:** Secure tmux service using execFile + args arrays with literal flag for user input, plus SMS-optimized text sanitization forcing GSM-7 encoding for cost control.

## What Was Built

Implemented safe tmux integration for bidirectional communication with Claude Code sessions. The tmux service captures terminal context (last N lines of output) and sends user SMS responses back to sessions without command injection vulnerabilities. Text sanitization library strips ANSI codes and optimizes for SMS cost by forcing GSM-7 encoding (160 chars/segment) and limiting to 450 characters (3 segments maximum).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Node.js/TypeScript project not initialized**
- **Found during:** Task 1 setup
- **Issue:** No package.json or tsconfig.json - couldn't install dependencies
- **Fix:** Ran `npm init -y`, installed TypeScript/tsx/@types/node, created tsconfig with strict mode and ES module support
- **Files modified:** package.json, package-lock.json, tsconfig.json (created)
- **Commit:** 325ce82

**2. [Rule 3 - Blocking] tmux.ts already exists from plan 01-01**
- **Found during:** Task 2 execution
- **Issue:** src/services/tmux.ts was already created in plan 01-01 (commit c41acf2)
- **Resolution:** Verified existing implementation matches all security requirements - no changes needed
- **Verification:** Ran structure validation confirming all security patterns present (execFile, args arrays, -l flag, session validation, separate Enter)
- **Outcome:** Task 2 considered complete - existing code meets all requirements

## Key Implementation Details

### Sanitize Library (src/lib/sanitize.ts)

Two-stage text preparation for SMS:

1. **stripAnsiCodes()**: Uses strip-ansi package to remove all ANSI escape sequences from terminal output
2. **formatForSMS()**:
   - Strips ANSI codes
   - Removes non-ASCII chars (forces GSM-7: 160 chars/segment vs UCS-2: 70 chars/segment)
   - Trims whitespace
   - Truncates to 450 chars max (3 SMS segments) with "..." suffix

**Cost optimization:** GSM-7 encoding provides 2.3x more characters per segment. At scale with many notifications, this significantly reduces Twilio costs.

### Tmux Service (src/services/tmux.ts)

Three-layer security design:

**Layer 1 - Shell Injection Prevention:**
- Uses `execFile()` instead of `exec()` - arguments never pass through shell
- Example: `execFileAsync('tmux', ['send-keys', '-t', session, '-l', input])`
- User input "$(whoami)" sent as literal string, not executed

**Layer 2 - Tmux Binding Prevention:**
- Uses `-l` (literal) flag for all user input in send-keys
- Without -l: "C-c" → sends Ctrl+C signal
- With -l: "C-c" → sends literal text "C-c"

**Layer 3 - Session Name Validation:**
- Validates session names with `/^[a-zA-Z0-9_-]+$/` before execution
- Rejects shell metacharacters, path traversal, spaces
- Prevents injection via session name parameter

**Methods:**
- `validateSessionName(session)`: Throws on invalid characters
- `hasSession(session)`: Returns boolean, gracefully handles non-existent sessions
- `captureContext(session, lines=8)`: Returns raw terminal output (caller sanitizes)
- `sendKeys(session, input)`: Sends input literally + Enter as separate command

## Verification Results

### Sanitize Library Tests (All Passed)
- [x] stripAnsiCodes removes ANSI escape sequences (`\x1b[31mRed\x1b[0m` → `"Red"`)
- [x] formatForSMS removes Unicode emoji (`"Hello 👋"` → `"Hello "`)
- [x] formatForSMS truncates to 450 chars + "..." (500 chars → 453 output)
- [x] Combined ANSI + Unicode + length handled correctly

### Tmux Service Tests (Structure Verification - Runtime Requires tmux)
- [x] TmuxService class and singleton exported
- [x] All required methods present (validateSessionName, hasSession, captureContext, sendKeys)
- [x] Session validation rejects: semicolons, spaces, dollar signs, path traversal
- [x] Session validation accepts: alphanumeric, hyphens, underscores
- [x] execFile used (not exec) - verified in source
- [x] Args arrays used for all execFile calls - verified in source
- [x] -l flag present for send-keys - verified in source
- [x] Enter sent separately - verified in source
- [x] No dangerous patterns found (template literals only in error messages, not commands)

**Note:** Full runtime security testing (command injection, shell metacharacter, pipe attacks) requires tmux to be installed. Code structure and security patterns verified to be correct.

## Commits

| Commit | Description | Files |
|--------|-------------|-------|
| 325ce82 | chore(01-02): initialize Node.js/TypeScript project | package.json, package-lock.json, tsconfig.json |
| 0edd832 | feat(01-02): create sanitize library for SMS text formatting | src/lib/sanitize.ts |

**Note:** src/services/tmux.ts was created in plan 01-01 (commit c41acf2). This plan verified the implementation meets all security requirements.

## Next Steps

Phase 01 Plan 03 will integrate Twilio SDK for SMS sending and receiving. The sanitize library and tmux service are now ready to be used by the Twilio notification flow:
1. Capture terminal context with tmuxService.captureContext()
2. Clean output with formatForSMS()
3. Send via Twilio
4. Receive user SMS response
5. Send back to session with tmuxService.sendKeys()

## Self-Check: PASSED

All claimed artifacts verified:

```
FOUND: /Users/tylermeans/github/claude-sms-connect/src/lib/sanitize.ts
FOUND: /Users/tylermeans/github/claude-sms-connect/src/services/tmux.ts
FOUND: /Users/tylermeans/github/claude-sms-connect/package.json
FOUND: /Users/tylermeans/github/claude-sms-connect/tsconfig.json
FOUND: 325ce82
FOUND: 0edd832
```

All files exist and commits are in git history.
