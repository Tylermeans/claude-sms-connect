/**
 * Twilio SMS webhook route handler
 *
 * Receives inbound SMS messages from Twilio and routes them to tmux sessions.
 * User replies to Claude Code notifications are sent back to the appropriate session.
 *
 * CRITICAL SECURITY (SEC-02, SEC-05):
 * - ALL routes MUST use twilioAuth middleware (validates signature)
 * - User input MUST be sent via tmuxService.sendKeys (uses -l literal flag)
 * - Without these protections: command injection vulnerabilities
 *
 * PHASE 1 LIMITATION:
 * Single-project support only. Session mapping uses TMUX_SESSION env var.
 * Multi-project support (numbered prompts) deferred to Phase 2.
 *
 * TWILIO WEBHOOK PAYLOAD:
 * - Body: SMS message text
 * - From: Sender phone number (E.164 format)
 * - To: Twilio phone number that received SMS
 * - MessageSid: Unique message identifier
 *
 * TWIML RESPONSE:
 * Twilio expects XML response (TwiML). Empty <Response/> = no reply sent.
 */

import { Router } from 'express';
import { twilioAuth } from '../middleware/twilio-auth.js';
import { tmuxService } from '../services/tmux.js';

const router = Router();

/**
 * POST /sms/inbound - Twilio SMS webhook endpoint
 *
 * Protected by Twilio signature validation (twilioAuth middleware).
 * Routes user SMS responses to tmux sessions.
 */
router.post('/sms/inbound', twilioAuth, async (req, res) => {
  try {
    // Extract Twilio webhook parameters
    const { Body: messageBody, From: senderPhone } = req.body;

    console.log(`[sms] Received SMS from ${senderPhone}: ${messageBody}`);

    // Validate sender is authorized user (ignore SMS from unknown numbers)
    const authorizedPhone = process.env.USER_PHONE_NUMBER;
    if (!authorizedPhone) {
      console.error('[sms] USER_PHONE_NUMBER not configured - cannot validate sender');
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    if (senderPhone !== authorizedPhone) {
      console.warn(`[sms] Ignoring SMS from unauthorized number: ${senderPhone}`);
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    // Parse user response
    const userInput = messageBody?.trim() || '';

    if (!userInput) {
      console.warn('[sms] Received empty SMS message');
      // Return TwiML with help text
      res.type('text/xml').send(
        '<Response><Message>Please send a text response (e.g., Y, N, or custom text)</Message></Response>'
      );
      return;
    }

    // Get session ID (Phase 1: from environment variable)
    // TODO: Phase 2 - Implement session mapping for multi-project support
    const sessionId = process.env.TMUX_SESSION;
    if (!sessionId) {
      console.error('[sms] TMUX_SESSION not configured - cannot route response');
      console.warn('[sms] Phase 1 limitation: Single-project support requires TMUX_SESSION env var');
      res.type('text/xml').send(
        '<Response><Message>Server configuration error - contact administrator</Message></Response>'
      );
      return;
    }

    // Send user input to tmux session
    // SECURITY CRITICAL: tmuxService.sendKeys uses -l flag (SEC-05)
    // This prevents command injection via SMS (e.g., "$(rm -rf /)" sent literally)
    console.log(`[sms] Routing input to tmux session "${sessionId}": ${userInput}`);
    await tmuxService.sendKeys(sessionId, userInput);

    console.log(`[sms] Successfully sent input to session: ${sessionId}`);

    // Return empty TwiML response (no reply SMS sent)
    res.type('text/xml').send('<Response></Response>');
  } catch (error) {
    // Error handling - return TwiML error response
    console.error('[sms] Error processing inbound SMS:', error);
    res.status(500).type('text/xml').send(
      '<Response><Message>Error processing your message - please try again</Message></Response>'
    );
  }
});

export default router;
