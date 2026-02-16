#!/usr/bin/env bash
# Claude Code Notification Hook - SMS Relay
#
# This script is called by Claude Code when it needs user input.
# It sends a notification to your SMS relay server.
#
# SETUP:
# 1. Copy this file to a permanent location (e.g., ~/.claude/hooks/)
# 2. Make executable: chmod +x claude-code-hook.sh
# 3. Edit AUTH_TOKEN below to match your .env file
# 4. Add to Claude Code settings (~/.claude/settings.json):
#
#    {
#      "hooks": {
#        "Notification": [
#          {
#            "matcher": "",
#            "hooks": [
#              {
#                "type": "command",
#                "command": "/path/to/claude-code-hook.sh",
#                "timeout": 5
#              }
#            ]
#          }
#        ]
#      }
#    }
#
# ENVIRONMENT VARIABLES (set by Claude Code):
#   CLAUDE_SESSION_ID - Unique session identifier
#   CLAUDE_PROJECT_DIR - Project directory path

AUTH_TOKEN="YOUR_AUTH_TOKEN_HERE"
SERVER_URL="http://localhost:3000"

# Derive project info from environment
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROJECT_NAME="${PROJECT_DIR##*/}"
SESSION_ID="${CLAUDE_SESSION_ID:-default}"

# Send notification to relay server
curl -s -X POST "${SERVER_URL}/api/notify" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"${SESSION_ID}\",
    \"project_id\": \"${PROJECT_NAME}\",
    \"project_name\": \"${PROJECT_NAME}\",
    \"tmux_session\": \"${SESSION_ID}\"
  }" \
  --max-time 5 \
  > /dev/null 2>&1 || true
