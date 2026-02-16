# Phase 3: Hardening + Setup - Research

**Researched:** 2026-02-15
**Domain:** Sensitive data filtering, setup automation, Claude Code hooks
**Confidence:** HIGH

## Summary

Phase 3 focuses on three distinct areas: (1) filtering sensitive data from terminal output before SMS transmission, (2) automating initial setup with a script that generates auth tokens and creates .env files, and (3) providing a ready-to-use Claude Code hook configuration template.

The research reveals that sensitive data detection is a well-established problem with multiple approaches ranging from simple regex patterns to sophisticated ML-based solutions. For this project's scope (filtering terminal output in a personal SMS relay), pattern-based detection with well-tested regex from the open-source Secrets Patterns DB is the appropriate balance of effectiveness and simplicity. Setup automation follows standard Node.js conventions using shell scripts with the built-in crypto module for token generation. Claude Code hooks are officially documented with a clear JSON schema for Notification events.

**Primary recommendation:** Use pattern-based filtering with curated regex patterns from Secrets Patterns DB (1600+ patterns, actively maintained), implement setup as a single Node.js script (portable, no bash/OS dependencies), and provide hooks configuration as a template with clear installation instructions.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js crypto | Built-in | Generate cryptographically secure tokens | Node.js native, no dependencies, OpenSSL-based |
| dotenv | ^16.4.0 | Load environment variables | Already in project, de facto standard for .env handling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @logtape/redaction | ^1.3.6 | Pattern and field-based redaction | If needing structured logging redaction beyond terminal output |
| @hackylabs/deep-redact | Latest | Zero-dependency string/object redaction | If wanting to avoid external dependencies |
| redact-pii | Latest | Google DLP integration for PII | Only for high-value/sensitive data applications (overkill for this) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled regex | Secrets Patterns DB | Custom patterns miss edge cases, DB has 1600+ tested patterns |
| Bash setup script | Node.js setup script | Bash more common but Node.js already required, more portable |
| ML-based detection | Pattern-based | ML overkill for terminal output, adds complexity and dependencies |

**Installation:**
```bash
# No additional dependencies required for Phase 3
# Existing dependencies already sufficient:
# - dotenv (already in package.json)
# - Node.js crypto (built-in)
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── sanitize.ts          # Existing: ANSI stripping, SMS formatting
│   └── redact.ts             # NEW: Sensitive data detection and redaction
├── services/                 # Existing services
├── middleware/               # Existing middleware
└── routes/                   # Existing routes

scripts/
└── setup.js                  # NEW: One-command setup automation

.claude/
└── hooks-template.json       # NEW: Ready-to-copy Claude Code hook config
```

### Pattern 1: Centralized Redaction Pipeline
**What:** Terminal output flows through sanitization layers before SMS
**When to use:** All outbound SMS containing terminal output
**Implementation order:**
1. Strip ANSI codes (existing in `sanitize.ts`)
2. **Redact sensitive data (NEW in `redact.ts`)**
3. Format for SMS encoding (existing in `sanitize.ts`)

**Example:**
```typescript
// src/lib/redact.ts
interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]'
  },
  {
    name: 'Generic API Key',
    pattern: /[a|A][p|P][i|I][_]?[k|K][e|E][y|Y].*['|"][0-9a-zA-Z]{32,45}['|"]/g,
    replacement: '[REDACTED_API_KEY]'
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g,
    replacement: '[REDACTED_JWT]'
  },
  {
    name: 'Generic Secret',
    pattern: /[s|S][e|E][c|C][r|R][e|E][t|T].*['|"][0-9a-zA-Z]{32,45}['|"]/g,
    replacement: '[REDACTED_SECRET]'
  }
];

/**
 * Redacts sensitive data from text using pattern matching.
 * Should be called AFTER stripAnsiCodes but BEFORE formatForSMS.
 */
export function redactSensitiveData(text: string): string {
  let redacted = text;

  for (const pattern of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern.pattern, pattern.replacement);
  }

  return redacted;
}

// Update sanitize.ts formatForSMS to include redaction:
export function formatForSMS(text: string, maxChars: number = 450): string {
  // Step 1: Strip ANSI codes
  let cleaned = stripAnsiCodes(text);

  // Step 2: Redact sensitive data (NEW)
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
```

### Pattern 2: Setup Script with Token Generation
**What:** Single executable script that performs all setup tasks
**When to use:** New user onboarding, fresh installations
**Example:**
```javascript
// scripts/setup.js
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Generate cryptographically secure auth token
function generateAuthToken() {
  return randomBytes(32).toString('hex');
}

// Create .env from .env.example template
function createEnvFile() {
  const envExample = join(PROJECT_ROOT, '.env.example');
  const envFile = join(PROJECT_ROOT, '.env');

  if (existsSync(envFile)) {
    console.log('⚠️  .env already exists, skipping...');
    return null;
  }

  const template = readFileSync(envExample, 'utf-8');
  const authToken = generateAuthToken();

  // Replace placeholder with generated token
  const envContent = template.replace(
    'AUTH_TOKEN=generate_with_openssl_rand_hex_32',
    `AUTH_TOKEN=${authToken}`
  );

  writeFileSync(envFile, envContent);
  return authToken;
}

async function main() {
  console.log('🚀 Claude SMS Connect - Setup\n');

  // Step 1: Generate .env
  console.log('Step 1: Creating .env file...');
  const authToken = createEnvFile();
  if (authToken) {
    console.log('✅ Generated AUTH_TOKEN');
  }

  // Step 2: Print next steps
  console.log('\n📋 Next Steps:');
  console.log('1. Edit .env and add your Twilio credentials');
  console.log('2. Add your phone number to USER_PHONE_NUMBER');
  console.log('3. Run: npm install');
  console.log('4. Run: npm run dev');
  console.log('5. Set up ngrok tunnel: ngrok http 3000');
  console.log('6. Configure Claude Code hooks (see .claude/hooks-template.json)');
}

main().catch(console.error);
```

### Pattern 3: Claude Code Hook Configuration Template
**What:** Ready-to-copy JSON configuration for Notification hooks
**When to use:** After setup script completes, user copies into settings.json
**Example:**
```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST http://localhost:3000/api/notify -H 'Authorization: Bearer YOUR_AUTH_TOKEN_HERE' -H 'Content-Type: application/json' -d '{\"project_id\":\"${CLAUDE_PROJECT_DIR##*/}\",\"prompt\":\"$message\",\"context\":\"Notification: $notification_type\"}'",
            "timeout": 5,
            "statusMessage": "Sending SMS notification..."
          }
        ]
      }
    ]
  }
}
```

### Anti-Patterns to Avoid
- **Using shell commands in setup script:** Reduces portability, Node.js crypto is cross-platform
- **Hardcoding sensitive patterns only:** Use established pattern databases to avoid missing edge cases
- **Synchronous redaction in async flow:** Keep redaction fast (regex is synchronous, this is acceptable)
- **Over-engineering with ML/DLP:** Google DLP is overkill for terminal output filtering in personal tool

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret detection patterns | Custom regex from scratch | Secrets Patterns DB (1600+ patterns) | Misses edge cases, cloud provider variations, token formats |
| Cryptographically secure random | `Math.random()` or timestamp-based | `crypto.randomBytes()` | Predictable tokens are security vulnerabilities |
| .env file parsing | String manipulation | dotenv library (already in project) | Handles edge cases (quotes, multiline, comments) |
| Hook JSON schema | Guess from examples | Official docs at code.claude.com/docs/en/hooks | Schema is complex, documented, version-specific |

**Key insight:** Sensitive data detection is a solved problem with open-source databases of patterns. Reinventing risks missing common token formats and cloud provider variations. The Secrets Patterns DB has 1600+ patterns from real-world secret scanning.

## Common Pitfalls

### Pitfall 1: Redacting After Truncation
**What goes wrong:** If text is truncated before redaction, partial secrets leak (e.g., "my secret is abc123..." shows first 6 chars of token)
**Why it happens:** Natural to truncate early for performance
**How to avoid:** Redaction pipeline order is critical: Strip ANSI → Redact → Format/Truncate
**Warning signs:** Partial tokens visible in SMS messages

### Pitfall 2: False Sense of Security
**What goes wrong:** Pattern-based redaction is not perfect; zero-day token formats or custom secrets may leak
**Why it happens:** Regex patterns are backward-looking (based on known formats)
**How to avoid:** Document limitations, consider this defense-in-depth not foolproof, log redaction events for audit
**Warning signs:** Believing the filter catches "everything"

### Pitfall 3: Breaking Legitimate Output
**What goes wrong:** Overly aggressive patterns redact non-sensitive data (e.g., base64-encoded images, git commit SHAs)
**Why it happens:** High-entropy strings are suspicious but not always secrets
**How to avoid:** Test patterns against real terminal output, use specific patterns (e.g., "AKIA" prefix for AWS) over generic high-entropy detection
**Warning signs:** User complaints about useful data being hidden

### Pitfall 4: Setup Script Overwrites User Data
**What goes wrong:** Running setup twice overwrites customized .env file
**Why it happens:** Not checking for existing files before writing
**How to avoid:** Always check `existsSync()` before writing, prompt user, or skip with warning
**Warning signs:** User loses Twilio credentials after re-running setup

### Pitfall 5: Hook Configuration Copy-Paste Errors
**What goes wrong:** User copies template but forgets to replace `YOUR_AUTH_TOKEN_HERE`, hook silently fails with 401
**Why it happens:** Template placeholders not obvious
**How to avoid:** Use SCREAMING_SNAKE_CASE for placeholders, include validation section in setup instructions
**Warning signs:** Hooks appear configured but don't fire

### Pitfall 6: Regex ReDoS Attacks
**What goes wrong:** Maliciously crafted input causes regex catastrophic backtracking, hanging the server
**Why it happens:** Complex regex with nested quantifiers (`(a+)+`) are vulnerable
**How to avoid:** Use Secrets Patterns DB (pre-validated against ReDoS), set regex timeout if Node.js version supports it
**Warning signs:** Server hangs on specific terminal output

## Code Examples

Verified patterns from official sources and established libraries:

### Cryptographically Secure Token Generation
```javascript
// Source: Node.js crypto documentation
// https://nodejs.org/api/crypto.html#cryptorandombytessize-callback
import { randomBytes } from 'crypto';

// Generate 32-byte (256-bit) token as hex string (64 characters)
const authToken = randomBytes(32).toString('hex');
console.log(authToken); // e.g., "a7f3e9d2c8b4f1a6e5d9c7b8f4a3e2d1c9b7a6e4f2d8c5b3a1f9e7d6c4b2a0f8"
```

### .env File Generation from Template
```javascript
// Source: Common Node.js pattern
// https://www.npmjs.com/package/dotenv
import { readFileSync, writeFileSync, existsSync } from 'fs';

function createEnvFromTemplate(templatePath, outputPath, replacements) {
  if (existsSync(outputPath)) {
    throw new Error(`${outputPath} already exists`);
  }

  let content = readFileSync(templatePath, 'utf-8');

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(key, value);
  }

  writeFileSync(outputPath, content);
}

// Usage:
createEnvFromTemplate('.env.example', '.env', {
  'generate_with_openssl_rand_hex_32': randomBytes(32).toString('hex')
});
```

### Claude Code Notification Hook
```json
// Source: https://code.claude.com/docs/en/hooks
// Notification hook configuration schema
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/notification-handler.sh",
            "timeout": 5,
            "statusMessage": "Sending notification..."
          }
        ]
      }
    ]
  }
}
```

### Sensitive Data Redaction Pattern
```typescript
// Pattern source: Secrets Patterns DB
// https://github.com/mazen160/secrets-patterns-db
// Implementation pattern: @logtape/redaction approach

export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

// Well-tested patterns from Secrets Patterns DB (subset)
export const COMMON_SECRET_PATTERNS: RedactionPattern[] = [
  // AWS Access Keys
  {
    name: 'AWS Access Key ID',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]'
  },
  // Generic API Keys (common pattern)
  {
    name: 'Generic API Key',
    pattern: /[a|A][p|P][i|I][_]?[k|K][e|E][y|Y].*['|"][0-9a-zA-Z]{32,45}['|"]/g,
    replacement: '[REDACTED_API_KEY]'
  },
  // JWT Tokens
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g,
    replacement: '[REDACTED_JWT]'
  },
  // Generic Secrets
  {
    name: 'Generic Secret',
    pattern: /[s|S][e|E][c|C][r|R][e|E][t|T].*['|"][0-9a-zA-Z]{32,45}['|"]/g,
    replacement: '[REDACTED_SECRET]'
  },
  // Generic Passwords
  {
    name: 'Generic Password',
    pattern: /[p|P][a|A][s|S][s|S][w|W][o|O][r|R][d|D].*['|"][^\s'"]{8,}['|"]/g,
    replacement: '[REDACTED_PASSWORD]'
  }
];

export function redactSensitiveData(text: string): string {
  let redacted = text;

  for (const { pattern, replacement } of COMMON_SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}
```

### Setup Script Pattern
```javascript
// Source: Standard Node.js project initialization pattern
#!/usr/bin/env node

import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

async function setup() {
  console.log('🚀 Claude SMS Connect - Setup\n');

  // Step 1: Check prerequisites
  const envExample = join(PROJECT_ROOT, '.env.example');
  const envFile = join(PROJECT_ROOT, '.env');

  if (!existsSync(envExample)) {
    console.error('❌ .env.example not found');
    process.exit(1);
  }

  // Step 2: Create .env if it doesn't exist
  if (existsSync(envFile)) {
    console.log('⚠️  .env already exists, skipping generation...');
  } else {
    const template = readFileSync(envExample, 'utf-8');
    const authToken = randomBytes(32).toString('hex');

    const envContent = template.replace(
      'AUTH_TOKEN=generate_with_openssl_rand_hex_32',
      `AUTH_TOKEN=${authToken}`
    );

    writeFileSync(envFile, envContent);
    console.log('✅ Created .env with generated AUTH_TOKEN');
  }

  // Step 3: Print instructions
  console.log('\n📋 Setup Complete! Next Steps:\n');
  console.log('1. Edit .env and add your Twilio credentials:');
  console.log('   - TWILIO_ACCOUNT_SID');
  console.log('   - TWILIO_AUTH_TOKEN');
  console.log('   - TWILIO_PHONE_NUMBER');
  console.log('   - USER_PHONE_NUMBER');
  console.log('\n2. Install dependencies:');
  console.log('   npm install');
  console.log('\n3. Start the server:');
  console.log('   npm run dev');
  console.log('\n4. Set up ngrok tunnel (in another terminal):');
  console.log('   ngrok http 3000');
  console.log('\n5. Configure Claude Code hooks:');
  console.log('   See .claude/hooks-template.json for configuration');
}

setup().catch(console.error);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual .env creation | Automated token generation | 2020s best practice | Reduces setup friction, ensures cryptographically secure tokens |
| Hand-rolled regex | Curated pattern databases (Secrets Patterns DB) | 2023-2024 | 1600+ patterns cover real-world formats, reduces false negatives |
| Pre-commit git hooks for secrets | Runtime redaction + git hooks | 2024-2025 | Defense in depth: catch at commit AND runtime |
| ML-based secret detection | Pattern-based for most use cases | Ongoing | ML valuable for novel secrets, overkill for known formats |
| Bash setup scripts | Node.js setup scripts in Node.js projects | 2020s | Consistency: same runtime as app, better portability |

**Deprecated/outdated:**
- `openssl rand -hex 32` in setup scripts: Still works but Node.js crypto is more portable and doesn't require external tools
- Global regex patterns without anchors: Modern patterns use specific prefixes (AKIA, ghp_, sk-) to reduce false positives
- Single-stage redaction: Current best practice is multi-layer (pattern + field + context-aware)

## Open Questions

1. **Redaction logging/monitoring**
   - What we know: Redaction events should be logged for security audit
   - What's unclear: How verbose? Log every redaction or just counts? To file or console?
   - Recommendation: Start simple (console.warn with count), add file logging if needed in future phase

2. **Expandability of pattern database**
   - What we know: Secrets Patterns DB has 1600+ patterns but can't cover everything
   - What's unclear: Should users be able to add custom patterns via config?
   - Recommendation: Start with curated subset (~10-15 common patterns), document how to add more in code

3. **Setup script interactivity**
   - What we know: Interactive prompts improve UX but complicate automation
   - What's unclear: Should setup prompt for Twilio credentials or just generate .env template?
   - Recommendation: Non-interactive (just generate .env), user edits manually. Keeps script simple and automation-friendly

4. **Hook configuration installation**
   - What we know: Users must copy JSON into ~/.claude/settings.json or .claude/settings.json
   - What's unclear: Should setup script attempt to modify settings.json programmatically?
   - Recommendation: Provide template file only, user copies manually. Modifying settings.json risks breaking existing hooks

## Sources

### Primary (HIGH confidence)
- Node.js Crypto Documentation - https://nodejs.org/api/crypto.html
- Claude Code Hooks Reference - https://code.claude.com/docs/en/hooks (official documentation)
- Secrets Patterns DB - https://github.com/mazen160/secrets-patterns-db (1600+ patterns, actively maintained)
- dotenv npm package - https://github.com/motdotla/dotenv (de facto standard for .env handling)

### Secondary (MEDIUM confidence)
- [Node.js Security Best Practices for 2026](https://medium.com/@sparklewebhelp/node-js-security-best-practices-for-2026-3b27fb1e8160)
- [How to Create a JWT Secret in Node.js](https://www.how2shout.com/how-to/how-to-create-jwt-secret-in-nodejs.html)
- [Secrets Patterns DB Blog Post](https://mazinahmed.net/blog/secrets-patterns-db/)
- [@logtape/redaction npm](https://www.npmjs.com/package/@logtape/redaction)
- [How to redact sensitive data in logs](https://openobserve.ai/blog/redact-sensitive-data-in-logs/)
- [100 Regex Patterns To Hunt Secrets](https://blogs.jsmon.sh/100-regex-patterns/)
- [Maximizing Bash Scripting in Node.js Projects](https://medium.com/@ralphbetta/maximizing-bash-scripting-in-setting-up-node-js-projects-eb0baf8e2fe7)
- [Claude Code Hooks Guide Examples](https://github.com/disler/claude-code-hooks-mastery)
- [Claude Code Notifications Blog](https://alexop.dev/posts/claude-code-notification-hooks/)

### Tertiary (LOW confidence)
- Various blog posts on secret detection (verified core concepts with official docs)
- npm search results for redaction libraries (cross-referenced features with official package docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Node.js crypto is built-in, dotenv already in project, well-documented
- Architecture: HIGH - Patterns verified from official Claude Code docs and established Node.js practices
- Pitfalls: MEDIUM-HIGH - Based on common security mistakes and pattern-matching edge cases from industry sources
- Secret patterns: HIGH - Secrets Patterns DB is open-source with 1600+ validated patterns, referenced by security tools

**Research date:** 2026-02-15
**Valid until:** 60 days (stable domain - secret formats and Node.js APIs evolve slowly)
**Key validation performed:**
- Verified Claude Code hooks schema against official documentation (code.claude.com/docs/en/hooks)
- Confirmed crypto.randomBytes() is current best practice for token generation
- Validated Secrets Patterns DB is actively maintained (last commit: recent)
- Cross-referenced redaction approaches across multiple npm libraries for consistency
