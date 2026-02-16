# Architecture Research: CLI Integration for npm Package

**Domain:** TypeScript CLI + npm packaging integration with existing Express server
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

This research addresses integrating CLI functionality and npm packaging into an existing TypeScript ES module project (Node.js 22, Express server). The project currently has a clear separation between server entry point (`src/index.ts`), setup automation (`scripts/setup.js`), and a Claude Code hook integration.

The CLI integration requires:
1. **New bin entry point** separate from server entry point
2. **Dual-purpose package.json** supporting both CLI tool and importable server
3. **Safe settings.json manipulation** using atomic write patterns
4. **Shared code architecture** between CLI and server

**Key recommendation:** Use separate entry points (`src/cli.ts` for CLI, `src/index.ts` for server) with shared business logic in core modules. Use `write-file-atomic` for settings.json safety. Configure package.json with both `bin` and `main` fields for dual-purpose package.

## Standard Architecture for TypeScript CLI + Server Packages

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Entry Layer                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ cli.ts  │  │cmd:setup│  │cmd:start│  │cmd:config│       │
│  │(bin)    │→ │         │  │         │  │          │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
├───────┴────────────┴────────────┴────────────┴──────────────┤
│                   Core Business Logic                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Setup Core  │  │Server Core  │  │Config Core  │         │
│  │ (reusable)  │  │ (reusable)  │  │ (reusable)  │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         ├────────────────┴────────────────┤                 │
│         ↓                ↓                ↓                 │
├─────────────────────────────────────────────────────────────┤
│                   Server Entry Layer                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐       │
│  │              index.ts (server)                    │       │
│  │         (Express app + HTTP listener)             │       │
│  └──────────────────────────────────────────────────┘       │
├─────────────────────────────────────────────────────────────┤
│                    External I/O Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │Filesystem│  │HTTP/Twilio│ │ Settings │                   │
│  │  (.env)  │  │  (API)    │  │  (.json) │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **cli.ts** | Parse arguments, route to commands, handle CLI-specific concerns (exit codes, stdout formatting) | Commander.js program with subcommands |
| **Command handlers** | Validate command-specific args, call core business logic, format output for CLI | Thin wrappers calling core modules |
| **Core business logic** | Pure functions/classes with no CLI/server assumptions, reusable across entry points | ES module exports with TypeScript types |
| **index.ts (server)** | Express app initialization, middleware mounting, HTTP listener | Existing server code, unchanged |
| **Settings I/O** | Safe read/write/merge of JSON configuration files with atomic operations | write-file-atomic + lodash.merge |

## Recommended Project Structure

```
claude-sms-connect/
├── src/
│   ├── cli.ts              # NEW: CLI entry point (bin target)
│   ├── index.ts            # EXISTING: Server entry point (main target)
│   ├── commands/           # NEW: CLI command handlers
│   │   ├── setup.ts        # Wraps setup core logic for CLI
│   │   ├── start.ts        # Wraps server start for CLI
│   │   └── configure.ts    # Settings.json auto-configuration
│   ├── core/               # NEW: Shared business logic (CLI + server)
│   │   ├── setup.ts        # Setup logic (extracted from scripts/setup.js)
│   │   ├── config.ts       # Settings.json read/merge/write
│   │   └── server.ts       # Server factory (creates Express app)
│   ├── routes/             # EXISTING: Express routes
│   ├── services/           # EXISTING: Twilio, tmux services
│   ├── middleware/         # EXISTING: Auth, rate limiting
│   ├── lib/                # EXISTING: Utilities
│   └── types.ts            # EXISTING: TypeScript types
├── scripts/
│   └── setup.js            # EXISTING → DEPRECATED (replaced by CLI)
├── hooks/
│   └── claude-code-hook.sh # EXISTING (may reference new CLI)
├── dist/                   # Compiled output
│   ├── cli.js              # NEW: Compiled CLI (chmod +x via postbuild)
│   ├── index.js            # EXISTING: Compiled server
│   ├── commands/           # NEW: Compiled command handlers
│   └── core/               # NEW: Compiled core logic
├── package.json            # MODIFIED: Add bin, exports fields
└── tsconfig.json           # EXISTING (may need outDir verification)
```

### Structure Rationale

- **src/cli.ts vs src/index.ts:** Separate entry points prevent CLI concerns (process.exit, argument parsing) from polluting server code. Both can import from shared `core/` modules.
- **commands/ folder:** Thin command handlers that validate CLI-specific arguments, call core business logic, and format output. Keeps Commander.js coupling isolated.
- **core/ folder:** Pure business logic with no assumptions about CLI vs server context. Improves testability and reusability.
- **dist/cli.js shebang:** TypeScript preserves `#!/usr/bin/env node` from source file, making compiled output directly executable.

## Architectural Patterns

### Pattern 1: Dual Entry Points with Shared Core

**What:** Separate entry points (`cli.ts`, `index.ts`) that share business logic through core modules.

**When to use:** When package serves both as installable CLI tool and importable library/server.

**Trade-offs:**
- **Pros:** Clear separation of concerns, prevents CLI code in server, easier testing
- **Cons:** More files, requires disciplined refactoring to keep logic in core/

**Example:**
```typescript
// src/core/setup.ts (shared)
export function generateAuthToken(): string {
  return randomBytes(32).toString('hex');
}

export function createEnvFile(projectRoot: string): string | null {
  // Logic without console.log or process.exit
  const envPath = join(projectRoot, '.env');
  if (existsSync(envPath)) return null;

  const authToken = generateAuthToken();
  const template = readFileSync(join(projectRoot, '.env.example'), 'utf-8');
  const envContent = template.replace('generate_with_openssl_rand_hex_32', authToken);
  writeFileSync(envPath, envContent, 'utf-8');

  return authToken;
}

// src/commands/setup.ts (CLI wrapper)
import { createEnvFile } from '../core/setup.js';

export async function setupCommand() {
  const authToken = createEnvFile(process.cwd());

  if (authToken) {
    console.log('[OK] Created .env file with generated AUTH_TOKEN');
  } else {
    console.log('[WARNING] .env file already exists');
  }
}

// src/cli.ts (entry point)
#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';

const program = new Command();
program
  .name('claude-sms-connect')
  .command('setup')
  .action(setupCommand);

program.parse();
```

### Pattern 2: Atomic Settings File Write

**What:** Write to temp file, then atomic rename to prevent corruption from crashes or concurrent access.

**When to use:** Any JSON configuration file that must not be corrupted (settings.json, config files).

**Trade-offs:**
- **Pros:** Readers never see partial writes, safe against crashes, production-grade reliability
- **Cons:** Slightly more complex than direct writeFileSync, requires write-file-atomic dependency

**Example:**
```typescript
// src/core/config.ts
import { writeFile } from 'write-file-atomic';
import { readFileSync, existsSync } from 'fs';
import merge from 'lodash.merge';

export interface ClaudeSettings {
  hooks?: {
    Notification?: Array<{
      matcher: string;
      hooks: Array<{
        type: string;
        command: string;
        timeout: number;
      }>;
    }>;
  };
}

export async function readSettings(settingsPath: string): Promise<ClaudeSettings> {
  if (!existsSync(settingsPath)) return {};

  try {
    const raw = readFileSync(settingsPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse settings.json: ${err.message}`);
  }
}

export async function mergeSettings(
  settingsPath: string,
  updates: Partial<ClaudeSettings>
): Promise<void> {
  const existing = await readSettings(settingsPath);
  const merged = merge({}, existing, updates);

  // Atomic write: temp file → rename (readers see old or new, never partial)
  await writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
```

### Pattern 3: Server Factory for Reusability

**What:** Extract Express app creation into a factory function separate from `.listen()` call.

**When to use:** When server needs to start from multiple contexts (CLI command, existing index.ts, tests).

**Trade-offs:**
- **Pros:** Testable without starting HTTP listener, reusable from CLI and server entry
- **Cons:** Requires refactoring existing index.ts

**Example:**
```typescript
// src/core/server.ts (NEW)
import 'dotenv/config';
import express from 'express';
import notifyRouter from '../routes/notify.js';
import smsRouter from '../routes/sms.js';

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(notifyRouter);
  app.use(smsRouter);

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// src/index.ts (MODIFIED)
import { createApp } from './core/server.js';

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Claude SMS Connect server listening on port ${PORT}`);
  // ... existing logging
});

// src/commands/start.ts (NEW)
import { createApp } from '../core/server.js';

export async function startCommand(options: { port?: number }) {
  const app = createApp();
  const PORT = options.port || process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`[OK] Server started on port ${PORT}`);
  });
}
```

### Pattern 4: Commander.js Subcommand Structure

**What:** Use Commander.js for argument parsing with separate command handlers.

**When to use:** TypeScript CLI with multiple subcommands (setup, start, configure, etc.).

**Trade-offs:**
- **Pros:** Battle-tested, TypeScript definitions included, good developer experience
- **Cons:** Type safety bolted on (not TypeScript-first like cmd-ts), but adequate for most use cases

**Example:**
```typescript
// src/cli.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { startCommand } from './commands/start.js';
import { configureCommand } from './commands/configure.js';

const program = new Command();

program
  .name('claude-sms-connect')
  .description('SMS bridge for Claude Code')
  .version('1.0.0');

program
  .command('setup')
  .description('Initialize .env file and install dependencies')
  .action(setupCommand);

program
  .command('start')
  .description('Start the SMS relay server')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(startCommand);

program
  .command('configure')
  .description('Auto-configure Claude Code settings.json')
  .option('--settings <path>', 'Path to settings.json', '~/.claude/settings.json')
  .action(configureCommand);

program.parse();
```

## Data Flow

### CLI Command Flow

```
User runs: claude-sms-connect setup
    ↓
src/cli.ts (parses with Commander.js)
    ↓
commands/setup.ts (validates CLI context)
    ↓
core/setup.ts (business logic - reusable)
    ↓ (reads)         ↓ (writes)
.env.example       →   .env
```

### Settings Configuration Flow

```
User runs: claude-sms-connect configure
    ↓
commands/configure.ts
    ↓
core/config.ts::readSettings()
    ↓ (read JSON)
~/.claude/settings.json (existing)
    ↓
core/config.ts::mergeSettings()
    ↓ (lodash.merge with hook config)
Merged settings object
    ↓
write-file-atomic (temp file → atomic rename)
    ↓
~/.claude/settings.json (updated)
```

### Server Start Flow (Unchanged)

```
npm run dev  OR  node dist/index.js  OR  claude-sms-connect start
    ↓                     ↓                      ↓
tsx src/index.ts    dist/index.js        commands/start.ts
    ↓                     ↓                      ↓
    └─────────────────────┴──────────────────────┘
                          ↓
              core/server.ts::createApp()
                          ↓
                   Express app.listen()
```

### Key Data Flows

1. **Setup flow:** CLI → core/setup.ts → filesystem (.env creation)
2. **Configuration flow:** CLI → core/config.ts → atomic write to ~/.claude/settings.json
3. **Server flow:** Entry point → core/server.ts factory → Express listener
4. **Package consumption:** `import { createApp } from 'claude-sms-connect'` (library mode)

## Package.json Configuration

### Dual-Purpose Package Structure

```json
{
  "name": "claude-sms-connect",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "claude-sms-connect": "dist/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./server": {
      "import": "./dist/core/server.js",
      "types": "./dist/core/server.d.ts"
    }
  },
  "files": [
    "dist",
    "hooks",
    ".env.example",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "postbuild": "chmod +x dist/cli.js",
    "dev": "nodemon --exec tsx src/index.ts",
    "start": "node dist/index.js",
    "cli": "tsx src/cli.ts",
    "test": "vitest"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "write-file-atomic": "^6.0.0",
    "lodash.merge": "^4.6.2",
    "dotenv": "^16.4.0",
    "express": "^4.19.0",
    "express-rate-limit": "^8.2.1",
    "strip-ansi": "^7.1.0",
    "twilio": "^5.11.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/lodash.merge": "^4.6.9",
    "@types/node": "^22.0.0",
    "nodemon": "^3.1.0",
    "tsx": "^4.7.0",
    "typescript": "^5.6.0",
    "vitest": "^4.0.18"
  }
}
```

### Field Explanations

| Field | Purpose | Notes |
|-------|---------|-------|
| `"type": "module"` | Treat .js files as ES modules | Already present, maintain |
| `"main"` | Entry point for `require()` or `import` | Points to server for library use |
| `"bin"` | CLI executable mapping | Creates symlink: `claude-sms-connect` → `dist/cli.js` |
| `"exports"` | Modern entry point control | Supports named imports: `import { createApp } from 'claude-sms-connect/server'` |
| `"files"` | Published package contents | Include dist, hooks, .env.example |
| `"postbuild"` | Make CLI executable after compile | `chmod +x dist/cli.js` ensures shebang works |

### Global Install Behavior

When installed globally via `npm install -g claude-sms-connect`:

1. npm creates symlink: `/usr/local/bin/claude-sms-connect` → `<package>/dist/cli.js`
2. Shebang `#!/usr/bin/env node` in `dist/cli.js` makes it directly executable
3. User runs: `claude-sms-connect setup` (no need for `node` prefix)
4. TypeScript preserves shebang during compilation (comments at file start are preserved)

## TypeScript Configuration

### tsconfig.json Considerations

Current config already supports ES modules correctly:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**No changes needed.** TypeScript automatically preserves shebangs (`#!/usr/bin/env node`) when they appear at the start of source files.

### Shebang Handling

TypeScript compiler behavior:
- Shebangs at line 1 of source files are preserved in compiled output
- No special compiler flag needed (unlike some tools that strip comments)
- After `tsc`, run `chmod +x dist/cli.js` to make executable (via postbuild script)

## Settings.json Safety Patterns

### Challenge: Concurrent Access

**Problem:** Multiple CLI invocations or editor saves could corrupt `~/.claude/settings.json` if writes happen simultaneously.

**Solution:** Atomic writes via `write-file-atomic` + cautious merge logic.

### Atomic Write Implementation

```typescript
// src/core/config.ts
import { writeFile } from 'write-file-atomic';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import merge from 'lodash.merge';

export async function mergeSettings(
  settingsPath: string,
  updates: Partial<ClaudeSettings>
): Promise<void> {
  // Ensure directory exists
  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Read existing (or start with empty)
  const existing = await readSettings(settingsPath);

  // Deep merge (lodash.merge handles nested objects)
  const merged = merge({}, existing, updates);

  // Atomic write (write-file-atomic):
  // 1. Writes to .settings.json.tmp-PID-RANDOM
  // 2. Calls fs.rename() to atomically replace settings.json
  // 3. On Unix, rename() is atomic within same filesystem
  await writeFile(
    settingsPath,
    JSON.stringify(merged, null, 2) + '\n',
    { encoding: 'utf-8' }
  );
}
```

### Multi-Process Safety Caveat

**Important:** Local file-based atomic writes do NOT solve multi-process concurrency completely. If two processes read-modify-write simultaneously, last write wins (lost update).

**For this project:** Low risk because CLI configure command is typically run once during setup, not repeatedly. If needed later, add file locking with `proper-lockfile` npm package.

### Deep Merge Rationale

Use `lodash.merge()` instead of `Object.assign()` or spread (`...`):

```typescript
// BAD: Shallow merge overwrites entire hooks object
const merged = { ...existing, ...updates };

// GOOD: Deep merge preserves existing hooks while adding new ones
const merged = merge({}, existing, updates);
```

**Example:**
```typescript
// Existing settings.json
{
  "hooks": {
    "Notification": [/* existing hook */]
  },
  "otherSetting": "value"
}

// Updates from CLI
{
  "hooks": {
    "Notification": [/* our hook */]
  }
}

// lodash.merge result (preserves both hooks)
{
  "hooks": {
    "Notification": [/* existing hook */, /* our hook */]
  },
  "otherSetting": "value"
}
```

## Integration Points

### Existing Code → New CLI Architecture

| Existing Component | New Integration | How They Connect |
|-------------------|----------------|------------------|
| `scripts/setup.js` | `core/setup.ts` + `commands/setup.ts` | Extract logic to core/, deprecate script, call via CLI |
| `src/index.ts` | `core/server.ts` factory | Refactor: extract `createApp()`, call from index.ts and commands/start.ts |
| `hooks/claude-code-hook.sh` | `commands/configure.ts` | Configure command writes hook config to settings.json, deprecates manual .sh editing |
| `package.json` scripts | Add `bin` field | Enables `claude-sms-connect` global command |

### New Components Needed

| Component | Purpose | Depends On |
|-----------|---------|------------|
| `src/cli.ts` | CLI entry point with Commander.js | commands/* |
| `src/commands/setup.ts` | Setup command handler | core/setup.ts |
| `src/commands/start.ts` | Server start command handler | core/server.ts |
| `src/commands/configure.ts` | Auto-configure settings.json | core/config.ts |
| `src/core/setup.ts` | Setup business logic (extracted from scripts/setup.js) | Node.js fs, crypto |
| `src/core/server.ts` | Express app factory (extracted from src/index.ts) | Express, routes |
| `src/core/config.ts` | Settings.json read/merge/write | write-file-atomic, lodash.merge |

### External Dependencies (New)

| Package | Purpose | Version | Confidence |
|---------|---------|---------|------------|
| `commander` | CLI argument parsing, subcommands | ^12.0.0 | HIGH (official npm package) |
| `write-file-atomic` | Atomic file writes for settings.json | ^6.0.0 | HIGH (npm official package) |
| `lodash.merge` | Deep merge for settings objects | ^4.6.2 | HIGH (stable, widely used) |
| `@types/lodash.merge` | TypeScript types for lodash.merge | ^4.6.9 | HIGH |

## Migration Path (Build Order)

### Phase 1: Extract Core Logic (No Breaking Changes)

1. **Create `src/core/setup.ts`**
   - Extract logic from `scripts/setup.js`
   - Make pure functions (no console.log, no process.exit)
   - Keep `scripts/setup.js` working by calling core functions

2. **Create `src/core/server.ts`**
   - Extract `createApp()` factory from `src/index.ts`
   - Modify `src/index.ts` to call factory
   - Server still works via `npm run dev` and `npm start`

### Phase 2: Add CLI Infrastructure

3. **Create `src/core/config.ts`**
   - Implement settings.json read/merge/write
   - Add `write-file-atomic` and `lodash.merge` dependencies

4. **Create `src/commands/*.ts`**
   - setup.ts (calls core/setup.ts)
   - start.ts (calls core/server.ts)
   - configure.ts (calls core/config.ts)

5. **Create `src/cli.ts`**
   - Add Commander.js dependency
   - Wire up subcommands
   - Add shebang: `#!/usr/bin/env node`

### Phase 3: Package Configuration

6. **Update `package.json`**
   - Add `bin` field
   - Add `exports` field
   - Add `files` field
   - Add `postbuild` script for chmod
   - Add new dependencies

7. **Test local CLI**
   ```bash
   npm run build
   npm link  # Creates global symlink for testing
   claude-sms-connect setup
   claude-sms-connect start
   ```

### Phase 4: Deprecation (Optional)

8. **Update README.md**
   - Document new CLI commands
   - Note `scripts/setup.js` is deprecated

9. **Future:** Remove `scripts/setup.js` in next major version

## Anti-Patterns

### Anti-Pattern 1: CLI Logic in Server Entry Point

**What people do:** Add argument parsing to `src/index.ts` to support both server and CLI modes.

**Why it's wrong:**
- Mixes concerns (HTTP server + CLI argument parsing)
- Makes server harder to test (must mock process.argv)
- Breaks when imported as library (`import { app } from 'claude-sms-connect'` runs CLI code)

**Do this instead:** Separate entry points (`cli.ts` for CLI, `index.ts` for server), shared core logic.

### Anti-Pattern 2: Direct writeFileSync for Settings

**What people do:** Read settings, modify, write directly with `fs.writeFileSync()`.

**Why it's wrong:**
- If process crashes during write, settings.json is corrupted (partial JSON)
- Readers may see incomplete writes on slow filesystems
- No protection against concurrent writes

**Do this instead:** Use `write-file-atomic` for atomic temp-file-then-rename pattern.

### Anti-Pattern 3: Shallow Merge of Nested Settings

**What people do:**
```typescript
const merged = { ...existing, ...updates };
```

**Why it's wrong:** Overwrites entire nested objects. If existing has hooks array, spread operator replaces it entirely instead of merging.

**Do this instead:** Use `lodash.merge()` for deep merge:
```typescript
const merged = merge({}, existing, updates);
```

### Anti-Pattern 4: TypeScript without Shebang

**What people do:** Omit shebang in `src/cli.ts`, add manually to `dist/cli.js` in postbuild script.

**Why it's wrong:**
- Fragile (build script must remember to add it)
- TypeScript source doesn't indicate it's an executable
- Breaks if someone runs `tsc` directly without npm scripts

**Do this instead:** Add `#!/usr/bin/env node` as line 1 of `src/cli.ts`. TypeScript preserves it automatically.

### Anti-Pattern 5: Forgetting chmod +x

**What people do:** Configure `bin` in package.json, forget to make compiled file executable.

**Why it's wrong:** Works on some systems (npm fixes permissions on install), fails on others (direct node execution).

**Do this instead:** Add `postbuild` script: `"postbuild": "chmod +x dist/cli.js"`.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users | Current monolith architecture is perfect. Single server, local settings files. |
| 100-1k users | No changes needed. Express server handles this easily. Consider PM2 for process management. |
| 1k-10k users | Add Redis for session/state if needed. Keep monolith structure. |

### This Project: No Scaling Concerns

**Reality check:** This is a personal SMS relay tool, not a SaaS product. Architecture prioritizes:
1. **Easy setup:** CLI makes onboarding trivial
2. **Maintainability:** Clear separation of concerns
3. **Reliability:** Atomic writes prevent corruption

No premature optimization needed. Monolith architecture is correct choice.

## Testing Strategy

### Unit Tests (New)

```typescript
// src/core/setup.test.ts
import { describe, it, expect } from 'vitest';
import { generateAuthToken, createEnvFile } from './setup.js';

describe('generateAuthToken', () => {
  it('generates 64-character hex string', () => {
    const token = generateAuthToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });
});

// src/core/config.test.ts
import { describe, it, expect } from 'vitest';
import { mergeSettings, readSettings } from './config.js';

describe('mergeSettings', () => {
  it('deep merges hooks without overwriting', async () => {
    // Test with temporary settings file
  });
});
```

### Integration Tests

```typescript
// Test CLI commands via child_process.execFile
import { execFile } from 'child_process';

describe('CLI integration', () => {
  it('claude-sms-connect setup creates .env', async () => {
    // Execute CLI, verify .env creation
  });
});
```

## Sources

### High Confidence (Official Documentation)

- [Node.js Packages Documentation](https://nodejs.org/api/packages.html) - package.json exports field, bin configuration
- [TypeScript Compiler Options](https://www.typescriptlang.org/docs/handbook/compiler-options.html) - ES modules, shebang handling
- [npm package.json Documentation](https://docs.npmjs.com/cli/v8/configuring-npm/package-json/) - bin, main, exports fields

### High Confidence (Official npm Packages)

- [write-file-atomic](https://github.com/npm/write-file-atomic) - Atomic file writes (npm official package)
- [commander.js](https://github.com/tj/commander.js) - CLI argument parsing
- [lodash.merge](https://www.npmjs.com/package/lodash.merge) - Deep object merging

### Medium Confidence (Web Resources, Verified)

- [Building a TypeScript CLI with Node.js and Commander - LogRocket](https://blog.logrocket.com/building-typescript-cli-node-js-commander/) - CLI structure patterns
- [Writing Your Own TypeScript CLI](https://dawchihliou.github.io/articles/writing-your-own-typescript-cli) - Shebang and bin configuration
- [Node.js File System in Practice: A Production-Grade Guide for 2026 - TheLinuxCode](https://thelinuxcode.com/nodejs-file-system-in-practice-a-production-grade-guide-for-2026/) - Atomic write patterns
- [Combining Settings Objects with Lodash: _.assign or _.merge? - Marius Schulz](https://mariusschulz.com/blog/combining-settings-objects-with-lodash-assign-or-merge) - Deep merge for configuration

### Medium Confidence (Community Best Practices)

- [Node.js race conditions - Node.js Design Patterns](https://nodejsdesignpatterns.com/blog/node-js-race-conditions/) - File safety patterns
- [Publishing Node modules with TypeScript and ES modules - LogRocket](https://blog.logrocket.com/publishing-node-modules-typescript-es-modules/) - Dual-purpose package structure
- [Command-Line Argument Parsing: Yargs vs Commander - Medium](https://medium.com/@sohail_saifi/command-line-argument-parsing-yargs-vs-commander-and-why-you-should-care-e9c8dac1fcc5) - CLI library comparison

---

*Architecture research for: CLI + npm packaging integration with TypeScript ES module server*
*Researched: 2026-02-15*
*Confidence: HIGH - Verified with official docs, npm packages, and established patterns*
