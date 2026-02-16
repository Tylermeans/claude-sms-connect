/**
 * Claude SMS Connect - Express Server
 *
 * Receives Claude Code notification hooks and relays them via Telegram.
 * Polls Telegram Bot API for user replies and routes them to tmux sessions.
 */

import 'dotenv/config';
import express from 'express';
import notifyRouter from './routes/notify.js';
import { startPolling, stopPolling } from './services/telegram-poller.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

/**
 * Health check endpoint
 * No authentication required
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount route handlers
app.use(notifyRouter);

// Error handling middleware (catch-all)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Claude SMS Connect server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Notification endpoint: http://localhost:${PORT}/api/notify`);
  console.log('');
  console.log('Telegram polling active — send ON to your bot to arm notifications.');

  // Start Telegram long-polling for inbound messages
  startPolling();
});

// Graceful shutdown
function shutdown() {
  console.log('\n[server] Shutting down...');
  stopPolling();
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
  // Force exit after 5s if graceful shutdown stalls
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
