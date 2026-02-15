/**
 * Twilio webhook signature validation middleware
 *
 * CRITICAL SECURITY (SEC-02):
 * Validates X-Twilio-Signature header on ALL /sms routes to prevent command injection.
 * Without this validation, anyone with the webhook URL could forge SMS commands and
 * execute arbitrary input in tmux sessions.
 *
 * HOW IT WORKS:
 * 1. Twilio signs each webhook request with HMAC-SHA1 using your auth token
 * 2. Signature is computed from: URL + sorted POST parameters
 * 3. We reconstruct the URL (protocol + host + path) and validate signature
 * 4. If signature doesn't match, request is rejected with 403
 *
 * URL RECONSTRUCTION REQUIREMENTS:
 * - Must use exact URL Twilio used when computing signature
 * - Protocol must match (http vs https)
 * - Host must match exactly (including port if non-standard)
 * - Path must use req.originalUrl (includes query params)
 *
 * REFERENCES:
 * - Twilio Security Best Practices: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 * - Research: 01-RESEARCH.md (SEC-02: Validate all Twilio webhooks)
 */

import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';

/**
 * Validates Twilio webhook signature to ensure request authenticity.
 *
 * Rejects requests with:
 * - Missing X-Twilio-Signature header
 * - Invalid signature (doesn't match computed HMAC)
 * - Missing auth token configuration
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next middleware function
 */
export function twilioAuth(req: Request, res: Response, next: NextFunction): void {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  // Check that Twilio auth token is configured
  if (!authToken) {
    console.error('[twilioAuth] TWILIO_AUTH_TOKEN environment variable not set');
    res.status(500).json({ error: 'Server Twilio authentication not configured' });
    return;
  }

  // Extract signature from header
  const signature = req.headers['x-twilio-signature'];
  if (!signature || typeof signature !== 'string') {
    console.warn('[twilioAuth] Missing X-Twilio-Signature header');
    res.status(403).json({ error: 'Forbidden - Invalid signature' });
    return;
  }

  // Reconstruct the full URL that Twilio used for signature computation
  // CRITICAL: This must match EXACTLY or validation will fail
  const protocol = req.protocol; // 'http' or 'https'
  const host = req.get('host');  // includes port if non-standard
  const url = `${protocol}://${host}${req.originalUrl}`;

  // Validate signature using Twilio's validator
  // This computes HMAC-SHA1 of URL + sorted POST params and compares to signature
  const isValid = twilio.validateRequest(
    authToken,
    signature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn('[twilioAuth] Invalid Twilio signature');
    console.warn(`[twilioAuth] URL used for validation: ${url}`);
    res.status(403).json({ error: 'Forbidden - Invalid signature' });
    return;
  }

  // Signature is valid, proceed to route handler
  next();
}
