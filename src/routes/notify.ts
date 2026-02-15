/**
 * Claude Code notification hook route handler
 *
 * Receives notifications from Claude Code when user input is needed.
 * Captures terminal context and sends SMS notification via Twilio.
 *
 * CRITICAL REQUIREMENTS (OPS-04):
 * - MUST return 200 immediately (< 100ms target)
 * - Process notification asynchronously to avoid blocking Claude Code
 * - Never throw errors that could crash the server
 *
 * FLOW:
 * 1. Receive hook payload (session_id, message, etc.)
 * 2. Return 200 immediately
 * 3. Async: Capture terminal context from tmux session
 * 4. Async: Format context for SMS (strip ANSI, limit length)
 * 5. Async: Send SMS to user via Twilio
 */

import { Router } from 'express';
import { bearerAuth } from '../middleware/auth.js';
import { tmuxService } from '../services/tmux.js';
import { twilioService } from '../services/twilio.js';
import { formatForSMS } from '../lib/sanitize.js';
import type { NotificationPayload } from '../types.js';

const router = Router();

/**
 * POST /api/notify - Claude Code notification hook endpoint
 *
 * Protected by bearer token authentication.
 * Returns 200 immediately, processes notification asynchronously.
 */
router.post('/api/notify', bearerAuth, async (req, res) => {
  // CRITICAL: Return 200 immediately per OPS-04 requirement
  // Claude Code hooks have timeout limits - we must not block
  res.sendStatus(200);

  // Process notification asynchronously in IIFE
  (async () => {
    try {
      const payload = req.body as NotificationPayload;
      const { session_id } = payload;

      console.log(`[notify] Processing notification for session: ${session_id}`);

      // Capture terminal context from tmux session (last 8 lines)
      let context: string;
      try {
        context = await tmuxService.captureContext(session_id, 8);
      } catch (error) {
        console.error(`[notify] Failed to capture context for session ${session_id}:`, error);
        // Continue with generic message if capture fails
        context = `Claude Code needs input in session "${session_id}"`;
      }

      // Format context for SMS (strip ANSI, remove non-ASCII, limit to 450 chars)
      const formattedContext = formatForSMS(context, 450);

      // Build SMS message
      const message = `Claude Code needs input:\n\n${formattedContext}\n\nReply Y/N or text response`;

      // Get recipient phone number from environment
      const recipientPhone = process.env.USER_PHONE_NUMBER;
      if (!recipientPhone) {
        console.error('[notify] USER_PHONE_NUMBER not configured - cannot send SMS');
        return;
      }

      // Send SMS via Twilio (graceful failure - won't throw)
      await twilioService.sendSMS(recipientPhone, message);

      console.log(`[notify] Notification sent successfully for session: ${session_id}`);
    } catch (error) {
      // Catch-all error handler - NEVER let notification processing crash server
      console.error('[notify] Notification processing error:', error);
    }
  })();
});

export default router;
