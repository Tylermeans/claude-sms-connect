/**
 * Claude SMS Connect - Express Server
 *
 * Receives Claude Code notification hooks and relays them via SMS through Twilio.
 */

import 'dotenv/config';
import express from 'express';
import notifyRouter from './routes/notify.js';
import smsRouter from './routes/sms.js';

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

// Mount route handlers
app.use(notifyRouter);
app.use(smsRouter);

// Error handling middleware (catch-all)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Claude SMS Connect server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Notification endpoint: http://localhost:${PORT}/api/notify`);
  console.log(`SMS webhook endpoint: http://localhost:${PORT}/sms/inbound`);
  console.log('');
  console.log('SETUP REQUIRED:');
  console.log('1. Set up ngrok tunnel: ngrok http 3000');
  console.log('2. Configure Twilio webhook URL in Twilio Console');
  console.log('   - Go to: Phone Numbers -> Active Numbers -> Configure');
  console.log('   - Set Messaging webhook to: https://your-ngrok-url/sms/inbound');
});
