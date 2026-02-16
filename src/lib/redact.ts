/**
 * Sensitive data redaction for terminal output.
 *
 * Prevents API keys, tokens, passwords, and other secrets from leaking through SMS messages.
 * Patterns sourced from Secrets Patterns DB (validated against ReDoS vulnerabilities).
 *
 * IMPORTANT: This module must be called AFTER ANSI stripping but BEFORE truncation
 * to prevent partial secret leaks.
 */

export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

/**
 * Comprehensive list of redaction patterns for common secrets.
 * All patterns use the global flag to handle multiple occurrences.
 *
 * Pattern order matters: more specific patterns should come before generic ones
 * to ensure correct redaction labels.
 */
export const REDACTION_PATTERNS: RedactionPattern[] = [
  // AWS Keys
  {
    name: 'AWS Access Key ID',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]'
  },

  // GitHub Tokens (specific patterns before generic)
  {
    name: 'GitHub Fine-Grained Token',
    pattern: /github_pat_[a-zA-Z0-9]{20,}_[a-zA-Z0-9]{40,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{32,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    name: 'GitHub OAuth Token',
    pattern: /gho_[a-zA-Z0-9]{32,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },

  // OpenAI Keys (specific patterns before generic sk-)
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}/g,
    replacement: '[REDACTED_OPENAI_KEY]'
  },
  {
    name: 'OpenAI Project Key',
    pattern: /sk-proj-[a-zA-Z0-9_-]{40,}/g,
    replacement: '[REDACTED_OPENAI_KEY]'
  },

  // JWT Tokens
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    replacement: '[REDACTED_JWT]'
  },

  // Private Keys
  {
    name: 'Private Key Block',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]'
  },

  // Generic Assignment Patterns (must use case-insensitive flag)
  {
    name: 'API Key Assignment',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
    replacement: '[REDACTED_API_KEY]'
  },
  {
    name: 'Secret Assignment',
    pattern: /(?:secret|secret[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
    replacement: '[REDACTED_SECRET]'
  },
  {
    name: 'Password Assignment',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^\s'"]{8,}['"]/gi,
    replacement: '[REDACTED_PASSWORD]'
  },
  {
    name: 'Token Assignment',
    pattern: /(?:token|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
    replacement: '[REDACTED_TOKEN]'
  },

  // Generic sk- prefixed keys (catch-all for Anthropic, Stripe, etc.)
  // This comes after specific OpenAI patterns to avoid mis-labeling
  {
    name: 'Generic sk- Key',
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
    replacement: '[REDACTED_API_KEY]'
  }
];

/**
 * Redacts sensitive data from text using pattern matching.
 *
 * Applies all patterns in REDACTION_PATTERNS to detect and replace secrets.
 * Designed to prevent false positives (git SHAs, file paths, normal text).
 *
 * @param text - Text potentially containing sensitive data
 * @returns Text with all detected secrets replaced with redaction labels
 *
 * @example
 * redactSensitiveData('key is AKIA1234567890ABCDEF')
 * // => 'key is [REDACTED_AWS_KEY]'
 *
 * @example
 * redactSensitiveData('git commit abc123def4')
 * // => 'git commit abc123def4' (no false positive)
 */
export function redactSensitiveData(text: string): string {
  let result = text;

  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}
