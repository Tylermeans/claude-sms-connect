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

# Extract message and title from notification JSON
MESSAGE=$(echo "$NOTIFICATION" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null || echo "")
TITLE=$(echo "$NOTIFICATION" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('title',''))" 2>/dev/null || echo "")

# Escape JSON special characters in message and title
MESSAGE=$(echo "$MESSAGE" | /usr/bin/python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo '""')
TITLE=$(echo "$TITLE" | /usr/bin/python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo '""')

# Send notification to relay server
curl -s -X POST "${SERVER_URL}/api/notify" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"${SESSION_ID}\",
    \"project_id\": \"${PROJECT_NAME}\",
    \"project_name\": \"${PROJECT_NAME}\",
    \"tmux_session\": \"${SESSION_ID}\",
    \"message\": ${MESSAGE},
    \"title\": ${TITLE}
  }" \
  --max-time 5 \
  > /dev/null 2>&1 || true
