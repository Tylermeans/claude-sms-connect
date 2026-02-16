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
 * PHASE 2 ENHANCEMENTS:
 * - ON/OFF arming commands with confirmation SMS (RELAY-09)
 * - Numbered response parsing and routing (RELAY-08)
 * - Graceful handling of missing tmux sessions (OPS-05)
 * - Multi-project support with backward compatibility
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
import { twilioService } from '../services/twilio.js';
import { projectRegistry } from '../services/project-registry.js';

const router = Router();

/**
 * Parsed numbered response structure
 */
interface ParsedResponse {
  projectIndex: number | null;
  response: string;
}

/**
 * Parse numbered SMS response format: "1 Y" -> {projectIndex: 0, response: "Y"}
 *
 * Uses dotall flag (/s) to match multiline responses.
 * Converts 1-indexed user input to 0-indexed array position.
 *
 * @param smsBody - Raw SMS message body
 * @returns Parsed project index (0-indexed) and response text
 */
function parseNumberedResponse(smsBody: string): ParsedResponse {
  const match = smsBody.trim().match(/^(\d+)\s+(.+)$/s);
  if (match) {
    const projectIndex = parseInt(match[1], 10) - 1; // 1-indexed user input to 0-indexed
    return { projectIndex, response: match[2].trim() };
  }
  return { projectIndex: null, response: smsBody.trim() };
}

/**
 * POST /sms/inbound - Twilio SMS webhook endpoint
 *
 * Protected by Twilio signature validation (twilioAuth middleware).
 * Routes user SMS responses to tmux sessions with multi-project support.
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

    // Parse user input
    const userInput = messageBody?.trim() || '';

    if (!userInput) {
      console.warn('[sms] Received empty SMS message');
      // Return TwiML with help text
      res.type('text/xml').send(
        '<Response><Message>Please send a text response (e.g., Y, N, or custom text)</Message></Response>'
      );
      return;
    }

    // Handle ON/OFF control commands (RELAY-09)
    const upperInput = userInput.toUpperCase();

    if (upperInput === 'ON') {
      projectRegistry.setArmed(true);
      await twilioService.sendSMS(
        authorizedPhone,
        'SMS notifications ARMED. You will receive alerts when Claude Code needs input.'
      );
      console.log('[sms] System armed via ON command');
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    if (upperInput === 'OFF') {
      projectRegistry.setArmed(false);
      await twilioService.sendSMS(
        authorizedPhone,
        'SMS notifications DISARMED. No alerts will be sent until you text ON.'
      );
      console.log('[sms] System disarmed via OFF command');
      res.type('text/xml').send('<Response></Response>');
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
        console.warn(`[sms] Invalid project number: ${projectIndex + 1}`);
        res.type('text/xml').send(
          `<Response><Message>Invalid project number ${projectIndex + 1}. Text a valid number + response.</Message></Response>`
        );
        return;
      }

      sessionId = project.sessionId;
      projectName = project.projectName;

      console.log(`[sms] Routing numbered response to project: ${projectName} (index ${projectIndex})`);
    } else {
      // User sent plain response like "Y"
      const activeProjects = projectRegistry.getActiveProjects();

      if (activeProjects.length === 0) {
        // No active projects - try Phase 1 backward compatibility
        const fallbackSession = process.env.TMUX_SESSION;
        if (!fallbackSession) {
          console.warn('[sms] No active projects and no TMUX_SESSION fallback');
          res.type('text/xml').send(
            '<Response><Message>No active projects. Send a notification first.</Message></Response>'
          );
          return;
        }

        sessionId = fallbackSession;
        projectName = fallbackSession;
        console.log('[sms] Using Phase 1 fallback TMUX_SESSION');
      } else if (activeProjects.length === 1) {
        // Exactly one project - route to it (backward compatible)
        sessionId = activeProjects[0].sessionId;
        projectName = activeProjects[0].projectName;
        console.log(`[sms] Single project active - routing to: ${projectName}`);
      } else {
        // Multiple projects - require numbered response
        console.warn('[sms] Multiple projects active - numbered response required');
        res.type('text/xml').send(
          `<Response><Message>Multiple projects active. Reply with number + response (e.g., '1 Y').</Message></Response>`
        );
        return;
      }
    }

    // Check tmux session exists before sending keys (OPS-05)
    const sessionExists = await tmuxService.hasSession(sessionId);

    if (!sessionExists) {
      console.error(`[sms] Session "${sessionId}" no longer exists`);

      // Send error SMS to user
      await twilioService.sendSMS(
        authorizedPhone,
        `Error: tmux session "${sessionId}" not found for project "${projectName}". The session may have been closed.`
      );

      // Remove project from registry (OPS-05 cleanup)
      const staleProjectId = projectRegistry.findProjectIdBySession(sessionId);
      if (staleProjectId) {
        projectRegistry.remove(staleProjectId);
        console.log(`[sms] Removed stale project: ${staleProjectId}`);
      }

      res.type('text/xml').send('<Response></Response>');
      return;
    }

    // Send input to tmux session
    // SECURITY CRITICAL: tmuxService.sendKeys uses -l flag (SEC-05)
    // This prevents command injection via SMS (e.g., "$(rm -rf /)" sent literally)
    console.log(`[sms] Routing input to tmux session "${sessionId}": ${response}`);
    await tmuxService.sendKeys(sessionId, response);

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
