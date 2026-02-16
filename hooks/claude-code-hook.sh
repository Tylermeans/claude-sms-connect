#!/usr/bin/env bash
# Claude Code Notification Hook - Telegram Relay
#
# Called by Claude Code when it needs user input.
# Reads the notification JSON from stdin and forwards it to the relay server.
#
# SETUP:
# 1. Copy this file to ~/.claude/hooks/
# 2. Make executable: chmod +x ~/.claude/hooks/claude-code-hook.sh
# 3. Edit AUTH_TOKEN below to match your .env file
# 4. Add to Claude Code settings (~/.claude/settings.json)

AUTH_TOKEN="YOUR_AUTH_TOKEN_HERE"
SERVER_URL="http://localhost:3000"

# Read notification JSON from stdin (provided by Claude Code)
NOTIFICATION=$(cat)

# Derive project info from environment
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROJECT_NAME="${PROJECT_DIR##*/}"
SESSION_ID="${CLAUDE_SESSION_ID:-default}"

# Detect tmux session name with multiple fallback strategies:
# 1. If running inside tmux, get session name directly
# 2. If only one tmux session exists, use that
# 3. Fall back to Claude session ID
TMUX_SESSION=""
if [ -n "$TMUX" ]; then
  TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
fi
if [ -z "$TMUX_SESSION" ]; then
  SESSIONS=$(tmux list-sessions -F '#{session_name}' 2>/dev/null)
  SESSION_COUNT=$(echo "$SESSIONS" | grep -c .)
  if [ "$SESSION_COUNT" -eq 1 ]; then
    TMUX_SESSION="$SESSIONS"
  fi
fi

# Use the full notification JSON and augment it with project/session info
/usr/bin/python3 -c "
import sys, json

try:
    notification = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
except (json.JSONDecodeError, IndexError):
    notification = {}

tmux = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else sys.argv[3]

payload = {
    'session_id': sys.argv[3],
    'project_id': sys.argv[4],
    'project_name': sys.argv[4],
    'tmux_session': tmux,
    'message': notification.get('message', ''),
    'title': notification.get('title', ''),
}

sys.stdout.write(json.dumps(payload))
" "$NOTIFICATION" "$TMUX_SESSION" "$SESSION_ID" "$PROJECT_NAME" 2>/dev/null \
| curl -s -X POST "${SERVER_URL}/api/notify" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @- \
  --max-time 5 \
  > /dev/null 2>&1 || true
