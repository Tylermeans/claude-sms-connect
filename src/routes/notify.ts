/**
 * Claude Code notification hook route handler
 *
 * Receives notifications from Claude Code when user input is needed.
 * Captures terminal context and sends notification via Telegram.
 *
 * CRITICAL REQUIREMENTS (OPS-04):
 * - MUST return 200 immediately (< 100ms target)
 * - Process notification asynchronously to avoid blocking Claude Code
 * - Never throw errors that could crash the server
 *
 * PHASE 2 ENHANCEMENTS:
 * - Multi-project registration and tracking
 * - Arming state control (OFF by default per RELAY-09)
 * - Welcome message for new projects (RELAY-10)
 * - Numbered prompts for multiple active projects (RELAY-07)
 * - Per-project rate limiting (OPS-01)
 *
 * FLOW:
 * 1. Receive hook payload (session_id, project_id, etc.)
 * 2. Return 200 immediately
 * 3. Async: Register project in ProjectRegistry
 * 4. Async: Check armed state - suppress if disarmed
 * 5. Async: Send welcome message for new projects (when armed)
 * 6. Async: Check rate limiting (per-project)
 * 7. Async: Capture terminal context from tmux session
 * 8. Async: Format numbered prompts for multi-project scenarios
 * 9. Async: Send message to user via Telegram
 */

import { Router } from 'express';
import { bearerAuth } from '../middleware/auth.js';
import { projectRateLimiter } from '../middleware/rate-limit.js';
import { tmuxService } from '../services/tmux.js';
import { telegramService } from '../services/telegram.js';
import { projectRegistry } from '../services/project-registry.js';
import { formatForMessage } from '../lib/sanitize.js';
import type { NotificationPayload } from '../types.js';

const router = Router();

/**
 * POST /api/notify - Claude Code notification hook endpoint
 *
 * Protected by bearer token authentication and per-project rate limiting.
 * Returns 200 immediately, processes notification asynchronously.
 */
router.post('/api/notify', bearerAuth, projectRateLimiter, async (req, res) => {
  // CRITICAL: Return 200 immediately per OPS-04 requirement
  // Claude Code hooks have timeout limits - we must not block
  res.sendStatus(200);

  // Process notification asynchronously in IIFE
  (async () => {
    try {
      const payload = req.body as NotificationPayload;

      // Extract project info from payload with backward compatibility
      const projectId = payload.project_id || payload.session_id;
      const sessionId = payload.tmux_session || payload.session_id || process.env.TMUX_SESSION;
      const projectName = payload.project_name || projectId;

      // Validate sessionId exists
      if (!sessionId) {
        console.error('[notify] No tmux session identifier found in payload or environment');
        return;
      }

      console.log(`[notify] Processing notification for project: ${projectName} (${projectId})`);

      // Register project (or update existing registration)
      const isNew = projectRegistry.register(projectId, sessionId, projectName);

      // Check armed state - suppress notifications if disarmed (RELAY-09)
      if (!projectRegistry.isArmed()) {
        console.log(`[notify] System disarmed - suppressing notification for ${projectName}`);
        return;
      }

      // Send welcome message for new projects (RELAY-10)
      if (isNew) {
        const welcomeMessage = `Welcome! "${projectName}" registered with Claude SMS Connect.

Reply with "N Y" where N is the project number.
Text ON to arm alerts, OFF to disarm.`;

        await telegramService.sendMessage(welcomeMessage);
        console.log(`[notify] Welcome message sent for new project: ${projectName}`);
      }

      // Check rate limiting (application-level secondary check)
      // Note: express-rate-limit handles HTTP-level 429 responses
      // This is for the async processing path (since we already returned 200)
      if (!projectRegistry.canNotify(projectId)) {
        console.log(`[notify] Rate limit exceeded for project: ${projectName}`);
        return;
      }

      // Record notification timestamp for rate limiting
      projectRegistry.recordNotification(projectId);

      // Capture terminal context from tmux session (last 8 lines)
      let context: string;
      try {
        context = await tmuxService.captureContext(sessionId, 8);
      } catch (error) {
        console.error(`[notify] Failed to capture context for session ${sessionId}:`, error);
        // Continue with generic message if capture fails
        context = `Claude Code needs input in session "${sessionId}"`;
      }

      // Get all active projects for multi-project formatting
      const activeProjects = projectRegistry.getActiveProjects();

      // Format message based on number of active projects
      let message: string;

      if (activeProjects.length === 1) {
        // Single project - use Phase 1 format for simplicity
        const formattedContext = formatForMessage(context, 3500);
        message = `Claude Code needs input:\n\n${formattedContext}\n\nReply Y/N or text response`;
      } else {
        // Multiple projects - use numbered format (RELAY-07)
        const formattedContext = formatForMessage(context, 1500);

        // Build numbered project list (1-indexed for user display)
        const projectList = activeProjects
          .map((p, i) => `[${i + 1}] ${p.projectName}`)
          .join('\n');

        message = `${projectList}

Latest (${projectName}):
${formattedContext}

Reply: N RESPONSE (e.g., "1 Y")`;
      }

      // Send message via Telegram (graceful failure — won't throw)
      await telegramService.sendMessage(message);

      console.log(`[notify] Notification sent successfully for project: ${projectName}`);
    } catch (error) {
      // Catch-all error handler - NEVER let notification processing crash server
      console.error('[notify] Notification processing error:', error);
    }
  })();
});

export default router;
