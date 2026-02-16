/**
 * Redaction patterns for sensitive data
 */

export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export const REDACTION_PATTERNS: RedactionPattern[] = [
  // AWS Keys
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },

  // GitHub Tokens
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    name: 'GitHub OAuth Token',
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    name: 'GitHub Fine-Grained Token',
    pattern: /github_pat_[a-zA-Z0-9_]{82}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },

  // OpenAI Keys
  {
    name: 'OpenAI API Key',
    pattern: /sk-(?:proj-)?[a-zA-Z0-9]{20,}T3BlbkFJ[a-zA-Z0-9]{20,}/g,
    replacement: '[REDACTED_OPENAI_KEY]',
  },
  {
    name: 'OpenAI Project Key',
    pattern: /sk-proj-[a-zA-Z0-9]{48,}/g,
    replacement: '[REDACTED_OPENAI_KEY]',
  },

  // Generic API Keys
  {
    name: 'Generic sk- prefixed key',
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    name: 'API Key assignment',
    pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*["']([a-zA-Z0-9]{20,})["']/gi,
    replacement: '[REDACTED_API_KEY]',
  },

  // JWT Tokens
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: '[REDACTED_JWT]',
  },

  // Secrets
  {
    name: 'Secret assignment',
    pattern: /(?:secret(?:[_-]key)?)\s*[=:]\s*["']([a-zA-Z0-9@$!%*?&]{8,})["']/gi,
    replacement: '[REDACTED_SECRET]',
  },

  // Passwords
  {
    name: 'Password assignment',
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']([^"']+)["']/gi,
    replacement: '[REDACTED_PASSWORD]',
  },

  // Tokens
  {
    name: 'Token assignment',
    pattern: /(?:(?:auth_|access_)?token)\s*[=:]\s*["']([a-zA-Z0-9]{20,})["']/gi,
    replacement: '[REDACTED_TOKEN]',
  },

  // Private Keys
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
];

/**
 * Redact sensitive data from a string
 * @param input String that may contain sensitive data
 * @returns String with sensitive data redacted
 */
export function redactSensitiveData(input: string): string {
  let output = input;

  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    output = output.replace(pattern, replacement);
  }

  return output;
}
