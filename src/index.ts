/**
 * Claude SMS Connect - Express Server
 *
 * Receives Claude Code notification hooks and relays them via SMS through Twilio.
 */

import 'dotenv/config';
import express from 'express';
import { bearerAuth } from './middleware/auth.js';
import type { NotificationPayload } from './types.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Health check endpoint
 * No authentication required
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Claude Code notification hook endpoint
 * Requires bearer token authentication
 * Returns 200 immediately per OPS-04 requirement
 */
app.post('/api/notify', bearerAuth, async (req, res) => {
  // Return 200 immediately to avoid blocking Claude Code
  res.sendStatus(200);

  // Process notification asynchronously
  (async () => {
    try {
      const payload = req.body as NotificationPayload;
      console.log('Received notification:', {
        session_id: payload.session_id,
        type: payload.notification_type,
        message: payload.message,
      });

      // TODO: Phase 1 Plan 3 - Add tmux capture and Twilio SMS sending
      // For now, just log the notification
    } catch (error) {
      console.error('Notification processing failed:', error);
      // Never throw - notification failures should not crash server
    }
  })();
});

// Start server
app.listen(PORT, () => {
  console.log(`Claude SMS Connect server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Notification endpoint: http://localhost:${PORT}/api/notify`);
});
