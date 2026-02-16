import stripAnsi from 'strip-ansi';
import { redactSensitiveData } from './redact.js';

/**
 * Removes ANSI escape codes from terminal output.
 *
 * This is the first step in preparing terminal output for SMS transmission.
 * Does NOT perform sensitive data filtering (that's Phase 3).
 *
 * @param text - Raw terminal text potentially containing ANSI codes
 * @returns Clean text with all ANSI escape sequences removed
 */
export function stripAnsiCodes(text: string): string {
  return stripAnsi(text);
}

/**
 * Formats terminal output for SMS transmission with encoding and cost optimization.
 *
 * SECURITY: Redacts sensitive data (API keys, tokens, passwords) to prevent leaks.
 * ENCODING: Removes non-ASCII characters to force GSM-7 encoding (160 chars/segment)
 * instead of UCS-2 encoding (70 chars/segment). This significantly reduces SMS costs.
 * COST CONTROL: Limits to 450 chars maximum (3 SMS segments @ 160 chars each for GSM-7).
 *
 * Pipeline order is critical:
 * 1. Strip ANSI → clean text for pattern matching
 * 2. Redact secrets → prevent leaks BEFORE truncation
 * 3. Remove non-ASCII → force GSM-7 encoding
 * 4. Trim whitespace → clean formatting
 * 5. Truncate → cost control (no partial secrets after redaction)
 *
 * @param text - Text to format for SMS
 * @param maxChars - Maximum characters before truncation (default: 450)
 * @returns SMS-ready text: no ANSI, no secrets, no non-ASCII, truncated with "..." if needed
 */
export function formatForSMS(text: string, maxChars: number = 450): string {
  // Step 1: Strip ANSI codes
  let cleaned = stripAnsiCodes(text);

  // Step 2: Redact sensitive data (CRITICAL: must happen before truncation)
  cleaned = redactSensitiveData(cleaned);

  // Step 3: Remove non-ASCII characters (forces GSM-7 encoding)
  cleaned = cleaned.replace(/[^\x00-\x7F]/g, '');

  // Step 4: Trim whitespace
  cleaned = cleaned.trim();

  // Step 5: Truncate if needed
  if (cleaned.length > maxChars) {
    cleaned = cleaned.substring(0, maxChars) + '...';
  }

  return cleaned;
}
