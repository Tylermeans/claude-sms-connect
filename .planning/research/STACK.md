# Stack Research

**Domain:** npm CLI Package (Global Installation) - Milestone 2
**Researched:** 2026-02-15
**Confidence:** HIGH

**Note:** This research covers ONLY stack additions for npm packaging and CLI features. Existing v1.0 stack (Node.js 22, Express, Twilio SDK, TypeScript ES modules, vitest) remains unchanged.

## New Stack Additions

### Core Technologies (Built-in Node.js APIs)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js Built-in `util.parseArgs()` | Node.js 22+ | CLI argument parsing | Stable since Node.js 20.0.0 (no longer experimental). Zero dependencies, designed for simple CLI tools. Supports boolean/string options, short flags, positionals, and detailed token parsing. Perfect for setup/start commands with minimal flags. |
| Node.js Built-in `fs.promises` | Node.js 22+ | File I/O operations | Native async/await API for reading/writing settings.json. Use with `{ recursive: true }` for safe directory creation. No external dependencies needed. |
| Node.js Built-in `os.homedir()` | Node.js 22+ | Cross-platform home directory resolution | Returns correct home path on all platforms (Windows USERPROFILE, POSIX $HOME). Standard approach for ~/.claude/settings.json access. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `write-file-atomic` | ^7.0.0 | Atomic JSON file writes | Critical for settings.json safety. Prevents corruption on crashes/power loss by writing to temp file then atomic rename. Allows ownership configuration (uid/gid). |
| `picocolors` | ^1.1.1 | Terminal color output | Lightweight CLI feedback (success messages, errors). 14x smaller and 2x faster than chalk. Zero dependencies. Used by PostCSS, Stylelint, Browserslist. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npm link` | Local CLI testing | Creates global symlink to package during development. Test CLI commands immediately without publishing. Run in package root, then use CLI name globally. |
| `npx` | One-off CLI execution | Users can run `npx claude-sms-connect setup` without global install. Standard pattern for setup commands in 2026. |

## Installation

```bash
# New production dependencies
npm install write-file-atomic picocolors

# No dev dependencies needed (using built-in Node.js APIs)
```

## npm Package Configuration

### package.json Additions

```json
{
  "bin": {
    "claude-sms-connect": "dist/cli.js"
  },
  "files": [
    "dist/**/*",
    "hooks/**/*",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "prepare": "npm run build",
    "prepublishOnly": "npm test"
  }
}
```

### CLI Entry Point (dist/cli.js)

Must have shebang for Unix executability:

```javascript
#!/usr/bin/env node

// ES module CLI code follows
```

**Critical:** With `"type": "module"` in package.json, the .js extension works for ESM. npm automatically:
- Creates Unix symlink with shebang support
- Creates Windows .cmd wrapper
- Makes executable on install

### Build Process

The `prepare` script runs:
- **Before** `npm publish` (ensures compiled code)
- **After** `npm install` from git (for git dependencies)

This ensures `dist/` exists before package use. TypeScript compilation (tsc) outputs ESM-compatible .js files to dist/ based on existing tsconfig.json settings.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `util.parseArgs()` | `commander` | If you need subcommands, help generation, complex option validation. Overkill for simple setup/start commands. |
| `util.parseArgs()` | `minimist` | If you need Node.js <18 support. Otherwise, built-in is better. |
| `util.parseArgs()` | `arg` (Vercel) | If you prefer minimal external lib over built-in. Similar simplicity but adds dependency. |
| `write-file-atomic` | Manual fs.writeFile + rename | If you want zero dependencies and handle edge cases yourself. Not recommended - atomic writes are complex. |
| `write-file-atomic` | `steno` | If you need high-performance async writes for frequent updates. Overkill for occasional settings.json writes. |
| `picocolors` | `chalk` | If you need extensive styling API (bold, underline, backgrounds). Chalk is heavier but more features. |
| `picocolors` | ANSI codes directly | If you want zero dependencies. Hard to maintain, error-prone. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `commander`, `yargs`, `oclif` | Heavy frameworks for simple 2-command CLI. Adds complexity, dependencies, learning curve. | `util.parseArgs()` - Built-in, sufficient for setup/start |
| `jsonfile` | Redundant wrapper around fs operations. Modern fs.promises API is cleaner. | `fs.promises` with `write-file-atomic` for safety |
| `ts-node` in shebang | Requires global ts-node install. Breaks for users without it. Forces runtime TypeScript compilation. | Compile to dist/ with `tsc`, ship JavaScript |
| `.mjs` extension for bin | Unnecessary with `"type": "module"`. Breaks Windows compatibility patterns. | `.js` extension with type: module |
| Synchronous file operations | Blocks event loop. Bad practice even for CLI tools. | `fs.promises` async/await |

## Stack Patterns by Variant

**If settings.json doesn't exist:**
- Use `fs.promises.mkdir(claudeDir, { recursive: true })` to create ~/.claude/
- Safe even if directory exists (no error thrown)
- Then write initial settings with `write-file-atomic`

**If settings.json exists:**
- Read with `fs.promises.readFile()` + JSON.parse() in try/catch
- Merge with new values (preserve existing config)
- Write back with `write-file-atomic`

**For CLI argument parsing:**
- Define options with `type`, `short`, `multiple`, `default`
- Use `strict: false` to allow unknown flags (forward compatibility)
- Use `allowPositionals: true` if accepting project paths

**For error handling:**
- Catch ENOENT (file not found) separately from EACCES (permission denied)
- Use picocolors to show red error messages
- Exit with appropriate codes (0 success, 1 error)

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| util.parseArgs | Node.js 22+ | Stable API, no longer experimental. No breaking changes expected. |
| write-file-atomic@7.0.0 | Node.js 22 ES modules | ESM-compatible. Works with "type": "module". Requires fs.promises support. |
| picocolors@1.1.1 | Node.js 22 ES modules | Pure ESM package. Zero dependencies means no compatibility issues. |
| TypeScript 5.6 | moduleResolution: "bundler" | Current tsconfig uses "bundler" which works for library code. Output is ESM-compatible JavaScript. |

## Integration with Existing Stack

### TypeScript Configuration

Current tsconfig.json already outputs ESM:
- `"module": "ESNext"` - Outputs import/export
- `"target": "ES2022"` - Modern syntax, compatible with Node.js 22
- `"outDir": "dist"` - CLI entry point goes in dist/cli.js

**No changes needed** to tsconfig. Add src/cli.ts, compile outputs dist/cli.js.

### ES Module Compatibility

Package already has `"type": "module"` - all new code naturally works:
- CLI entry uses import syntax
- util.parseArgs imported via `import { parseArgs } from 'node:util'`
- Settings logic can import from src/config/ modules

### File Structure

```
src/
  cli.ts              # New: CLI entry point
  commands/
    setup.ts          # New: setup command logic
    start.ts          # New: start command logic
  utils/
    settings.ts       # New: settings.json read/write
dist/
  cli.js              # Compiled: bin entry (with shebang)
  commands/
    setup.js
    start.js
  utils/
    settings.js
```

## Sources

**Official Node.js Documentation:**
- [Util | Node.js v25.6.1 Documentation](https://nodejs.org/api/util.html) - util.parseArgs() API reference
- [Parsing command line arguments with util.parseArgs()](https://exploringjs.com/nodejs-shell-scripting/ch_node-util-parseargs.html) - Comprehensive parseArgs guide
- [Command-line argument parsing with Node.js core](https://simonplend.com/command-line-argument-parsing-with-node-js-core/) - Real-world parseArgs examples

**npm Package Configuration:**
- [package.json | npm Docs](https://docs.npmjs.com/cli/v7/configuring-npm/package-json/) - Official bin, files, scripts reference
- [npm-scripts | npm Documentation](https://docs.npmjs.com/misc/scripts) - Lifecycle scripts (prepare, prepublishOnly)
- [How to Understand Global vs Local npm Packages](https://oneuptime.com/blog/post/2026-01-22-nodejs-global-vs-local-packages/view) - 2026 best practices

**File I/O and Safety:**
- [write-file-atomic - npm](https://www.npmjs.com/package/write-file-atomic) - Package documentation (v7.0.0)
- [How to Read JSON Files in Node.js](https://oneuptime.com/blog/post/2026-01-22-nodejs-read-json-files/view) - 2026 safe JSON reading patterns
- [Reading and Writing JSON Files with Node.js](https://stackabuse.com/reading-and-writing-json-files-with-node-js/) - Error handling best practices

**Cross-Platform Path Handling:**
- [Node.js os.homedir() Method - GeeksforGeeks](https://www.geeksforgeeks.org/node-js/node-js-os-homedir-method/) - os.homedir() documentation
- [cross-platform-node-guide](https://github.com/ehmicky/cross-platform-node-guide/blob/main/docs/3_filesystem/directory_locations.md) - Cross-platform directory best practices

**CLI Styling:**
- [picocolors - npm](https://www.npmjs.com/package/picocolors) - Package documentation (v1.1.1)
- [Picocolors: The Fastest and Lightest Node.js Library for Terminal Styling](https://www.codingeasypeasy.com/blog/picocolors-the-fastest-and-lightest-nodejs-library-for-terminal-styling) - Performance comparison with chalk
- [Using console colors with Node.js - LogRocket Blog](https://blog.logrocket.com/using-console-colors-node-js/) - Console color overview

**ES Modules and bin Scripts:**
- [Creating ESM-based shell scripts for Unix and Windows with Node.js](https://2ality.com/2022/07/nodejs-esm-shell-scripts.html) - Shebang + ESM patterns
- [How to create a module-based Node.js executable](https://www.stefanjudis.com/snippets/how-to-create-a-module-based-node-js-executable/) - type: module bin configuration

**Local Development:**
- [npm-link | npm Docs](https://docs.npmjs.com/cli/v9/commands/npm-link/) - Official npm link documentation
- [Using npm link for Local Package Development](https://schalkneethling.com/posts/using-npm-link-for-local-package-development/) - Practical npm link workflow

---
*Stack research for: claude-sms-connect npm CLI packaging*
*Researched: 2026-02-15*
