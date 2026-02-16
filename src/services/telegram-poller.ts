/**
 * Telegram long-polling message handler
 *
 * Replaces the Express /sms/inbound webhook route. Runs a background
 * long-polling loop against the Telegram Bot API to receive user messages.
 *
 * CRITICAL SECURITY (SEC-02, SEC-05):
 * - Chat ID validation: rejects messages from non-authorized users
 * - User input sent via tmuxService.sendKeys (uses -l literal flag)
 *
 * PHASE 2 FEATURES:
 * - ON/OFF arming commands with confirmation (RELAY-09)
 * - Numbered response parsing and routing (RELAY-08)
 * - Graceful handling of missing tmux sessions (OPS-05)
 * - Multi-project support with backward compatibility
 *
 * LIFECYCLE:
 * - startPolling() / stopPolling() for clean startup/shutdown
 * - Exponential backoff on network errors (1s → 30s max)
 * - Flushes stale updates on startup (timeout=0 getUpdates)
 */

import { telegramService } from './telegram.js';
import { tmuxService } from './tmux.js';
import { projectRegistry } from './project-registry.js';

let polling = false;
let lastUpdateId: number | undefined;

/**
 * Parsed numbered response structure
 */
interface ParsedResponse {
  projectIndex: number | null;
  response: string;
}

/**
 * Parse numbered response format: "1 Y" -> {projectIndex: 0, response: "Y"}
 *
 * Uses dotall flag (/s) to match multiline responses.
 * Converts 1-indexed user input to 0-indexed array position.
 */
function parseNumberedResponse(text: string): ParsedResponse {
  const match = text.trim().match(/^(\d+)\s+(.+)$/s);
  if (match) {
    const projectIndex = parseInt(match[1], 10) - 1;
    return { projectIndex, response: match[2].trim() };
  }
  return { projectIndex: null, response: text.trim() };
}

/**
 * Handle a single inbound message from Telegram.
 * Ports all logic from the old POST /sms/inbound route.
 */
async function handleMessage(text: string): Promise<void> {
  const userInput = text.trim();
  if (!userInput) return;

  console.log(`[telegram] Received message: ${userInput}`);

  // Handle ON/OFF control commands (RELAY-09)
  const upperInput = userInput.toUpperCase();

  if (upperInput === 'ON') {
    projectRegistry.setArmed(true);
    await telegramService.sendMessage(
      'Notifications ARMED. You will receive alerts when Claude Code needs input.'
    );
    console.log('[telegram] System armed via ON command');
    return;
  }

  if (upperInput === 'OFF') {
    projectRegistry.setArmed(false);
    await telegramService.sendMessage(
      'Notifications DISARMED. No alerts will be sent until you text ON.'
    );
    console.log('[telegram] System disarmed via OFF command');
    return;
  }

  // Parse numbered response (RELAY-08)
  const { projectIndex, response } = parseNumberedResponse(userInput);

  // Route to project
  let sessionId: string;
  let projectName: string;

  if (projectIndex !== null) {
    // User sent numbered response like "1 Y"
    const project = projectRegistry.getByIndex(projectIndex);

    if (!project) {
      console.warn(`[telegram] Invalid project number: ${projectIndex + 1}`);
      await telegramService.sendMessage(
        `Invalid project number ${projectIndex + 1}. Text a valid number + response.`
      );
      return;
    }

    sessionId = project.sessionId;
    projectName = project.projectName;

    console.log(`[telegram] Routing numbered response to project: ${projectName} (index ${projectIndex})`);
  } else {
    // User sent plain response like "Y"
    const activeProjects = projectRegistry.getActiveProjects();

    if (activeProjects.length === 0) {
      // No active projects — try Phase 1 backward compatibility
      const fallbackSession = process.env.TMUX_SESSION;
      if (!fallbackSession) {
        console.warn('[telegram] No active projects and no TMUX_SESSION fallback');
        await telegramService.sendMessage(
          'No active projects. Send a notification first.'
        );
        return;
      }

      sessionId = fallbackSession;
      projectName = fallbackSession;
      console.log('[telegram] Using Phase 1 fallback TMUX_SESSION');
    } else if (activeProjects.length === 1) {
      // Exactly one project — route to it (backward compatible)
      sessionId = activeProjects[0].sessionId;
      projectName = activeProjects[0].projectName;
      console.log(`[telegram] Single project active — routing to: ${projectName}`);
    } else {
      // Multiple projects — require numbered response
      console.warn('[telegram] Multiple projects active — numbered response required');
      await telegramService.sendMessage(
        "Multiple projects active. Reply with number + response (e.g., '1 Y')."
      );
      return;
    }
  }

  // Check tmux session exists before sending keys (OPS-05)
  const sessionExists = await tmuxService.hasSession(sessionId);

  if (!sessionExists) {
    console.error(`[telegram] Session "${sessionId}" no longer exists`);

    await telegramService.sendMessage(
      `Error: tmux session "${sessionId}" not found for project "${projectName}". The session may have been closed.`
    );

    // Remove project from registry (OPS-05 cleanup)
    const staleProjectId = projectRegistry.findProjectIdBySession(sessionId);
    if (staleProjectId) {
      projectRegistry.remove(staleProjectId);
      console.log(`[telegram] Removed stale project: ${staleProjectId}`);
    }

    return;
  }

  // Send input to tmux session
  // SECURITY CRITICAL: tmuxService.sendKeys uses -l flag (SEC-05)
  console.log(`[telegram] Routing input to tmux session "${sessionId}": ${response}`);
  await tmuxService.sendKeys(sessionId, response);

  console.log(`[telegram] Successfully sent input to session: ${sessionId}`);
}

/**
 * Main polling loop. Runs until stopPolling() is called.
 * Implements exponential backoff on errors (1s → 30s max).
 */
async function pollLoop(): Promise<void> {
  let backoff = 1000;
  const MAX_BACKOFF = 30000;

  // Flush stale updates on startup (timeout=0 for immediate return)
  console.log('[telegram] Flushing stale updates...');
  const stale = await telegramService.getUpdates(lastUpdateId, 0);
  if (stale.length > 0) {
    lastUpdateId = stale[stale.length - 1].update_id + 1;
    console.log(`[telegram] Flushed ${stale.length} stale update(s)`);
  }

  const authorizedChatId = telegramService.getChatId();
  if (!authorizedChatId) {
    console.error('[telegram] TELEGRAM_CHAT_ID not configured — polling disabled');
    polling = false;
    return;
  }

  console.log('[telegram] Polling started');

  while (polling) {
    try {
      const updates = await telegramService.getUpdates(lastUpdateId, 30);

      if (!polling) break; // Check after await in case stopPolling was called

      for (const update of updates) {
        lastUpdateId = update.update_id + 1;

        // Validate chat ID — reject messages from non-authorized users
        if (String(update.message?.chat.id) !== String(authorizedChatId)) {
          console.warn(`[telegram] Ignoring message from unauthorized chat: ${update.message?.chat.id}`);
          continue;
        }

        const text = update.message?.text;
        if (text) {
          try {
            await handleMessage(text);
          } catch (error) {
            console.error('[telegram] Error handling message:', error);
          }
        }
      }

      // Reset backoff on success
      backoff = 1000;
    } catch (error) {
      console.error(`[telegram] Poll error (retry in ${backoff / 1000}s):`, error);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }

  console.log('[telegram] Polling stopped');
}

/**
 * Start the Telegram long-polling loop.
 * Safe to call multiple times — only one loop runs at a time.
 */
export function startPolling(): void {
  if (polling) {
    console.warn('[telegram] Polling already running');
    return;
  }
  polling = true;
  pollLoop().catch((err) => {
    console.error('[telegram] Fatal polling error:', err);
    polling = false;
  });
}

/**
 * Stop the Telegram long-polling loop.
 * The current poll will finish its timeout then exit cleanly.
 */
export function stopPolling(): void {
  console.log('[telegram] Stopping polling...');
  polling = false;
}
