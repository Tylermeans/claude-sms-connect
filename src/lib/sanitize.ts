import stripAnsi from 'strip-ansi';
import { redactSensitiveData } from './redact.js';

/**
 * Removes ANSI escape codes from terminal output.
 *
 * This is the first step in preparing terminal output for messaging.
 * Does NOT perform sensitive data filtering (that's Phase 3).
 *
 * @param text - Raw terminal text potentially containing ANSI codes
 * @returns Clean text with all ANSI escape sequences removed
 */
export function stripAnsiCodes(text: string): string {
  return stripAnsi(text);
}

/**
 * Formats terminal output for Telegram transmission.
 *
 * SECURITY: Redacts sensitive data (API keys, tokens, passwords) to prevent leaks.
 * Telegram supports Unicode natively — no GSM-7 stripping needed.
 * Telegram message limit is 4096 chars; default cap is 4000 to leave room for framing.
 *
 * Pipeline order is critical:
 * 1. Strip ANSI → clean text for pattern matching
 * 2. Redact secrets → prevent leaks BEFORE truncation
 * 3. Trim whitespace → clean formatting
 * 4. Truncate → size control (no partial secrets after redaction)
 *
 * @param text - Text to format for messaging
 * @param maxChars - Maximum characters before truncation (default: 4000)
 * @returns Message-ready text: no ANSI, no secrets, truncated with "..." if needed
 */
export function formatForMessage(text: string, maxChars: number = 4000): string {
  // Step 1: Strip ANSI codes
  let cleaned = stripAnsiCodes(text);

  // Step 2: Redact sensitive data (CRITICAL: must happen before truncation)
  cleaned = redactSensitiveData(cleaned);

  // Step 3: Trim whitespace
  cleaned = cleaned.trim();

  // Step 4: Truncate if needed
  if (cleaned.length > maxChars) {
    cleaned = cleaned.substring(0, maxChars) + '...';
  }

  return cleaned;
}

/** @deprecated Use formatForMessage instead */
export const formatForSMS = formatForMessage;
