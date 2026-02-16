# Pitfalls Research: npm Global CLI Packaging

**Domain:** Adding npm global CLI packaging to existing TypeScript ES module project
**Researched:** 2026-02-15
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: ES Module Shebang Incompatibility

**What goes wrong:**
The bin entry points to a built JavaScript file in `dist/` with `#!/usr/bin/env node`, but the extensionless file isn't recognized as an ES module. Node throws `SyntaxError: Cannot use import statement outside a module` or `ERR_REQUIRE_ESM`.

**Why it happens:**
Node.js determines module type by file extension (`.mjs` = ESM, `.cjs` = CommonJS). Extensionless bin scripts default to CommonJS mode, ignoring the package.json `"type": "module"` setting of the package. By not supporting ESM module syntax in extensionless shebang executables, you force the entire dependency tree to use CommonJS.

**How to avoid:**
- **Option 1 (Recommended):** Use `.mjs` extension for bin entry point: `"bin": { "claude-sms": "./dist/cli.mjs" }`. Configure TypeScript to output `.mjs` files or rename after build.
- **Option 2:** Use `--input-type=module` flag in shebang: `#!/usr/bin/env node --input-type=module` (less portable, some systems don't support flags in shebang)
- **Option 3:** Create a tiny CommonJS wrapper that imports the ESM: bin file is `.cjs` that uses dynamic `import('./main.mjs')`
- Verify with: `node --version` (ensure >= 22), `npm link`, then run the command

**Warning signs:**
- `SyntaxError: Cannot use import statement outside a module` when running globally installed CLI
- Bin file has no extension but uses `import` statements
- TypeScript outputs `.js` but package uses `"type": "module"`

**Phase to address:**
Phase 1 (CLI setup) — Must work before publishing to npm

---

### Pitfall 2: settings.json Corruption During Write

**What goes wrong:**
Node process crashes or is interrupted (Ctrl+C, system sleep) while writing to `~/.claude/settings.json`. File ends up with partial JSON content `{"hooks":{"preCom` or entirely empty. Claude Code fails to start.

**Why it happens:**
`fs.writeFileSync()` or `fs.writeFile()` writes directly to the target file. If the process is interrupted mid-write, the file is corrupted. JSON.stringify/parse also don't handle existing comments in settings.json (Claude Code may preserve comments internally).

**How to avoid:**
- **Atomic write pattern (REQUIRED):**
  1. Read existing settings.json content as a buffer/string first
  2. Write to temp file: `settings.json.tmp` in same directory (`~/.claude/`)
  3. Call `fs.fsyncSync(fd)` to flush temp file to disk
  4. Rename temp file over target: `fs.renameSync(tmpPath, targetPath)` (atomic on same filesystem)
  5. Call `fs.fsyncSync(dirFd)` on directory to ensure rename is persisted
- **Backup before modification:** Copy `settings.json` to `settings.json.backup-[timestamp]` before any write
- **Validation:** Parse JSON after write to verify integrity, restore from backup if invalid
- **Comment preservation:** Use `jsonc-parser` or `comment-json` npm packages if Claude Code settings.json contains comments

**Warning signs:**
- `JSON.parse()` errors when reading settings.json after CLI setup
- Empty or truncated settings.json file
- Using `fs.writeFileSync()` directly without temp file pattern

**Phase to address:**
Phase 2 (settings.json integration) — Critical before auto-configuration feature

---

### Pitfall 3: npm publish Includes Secrets or Dev Files

**What goes wrong:**
`.env` files, local development certificates, test data, or the entire `node_modules/` directory accidentally published to npm registry. Package is huge (50MB+), or worse, contains AWS keys/API tokens.

**Why it happens:**
If you add `.npmignore` to control what's published, it **completely replaces** `.gitignore` — it's not cumulative. An empty `.npmignore` publishes everything. The `files` field in package.json is a whitelist but doesn't prevent `.gitignore` from being consulted if `.npmignore` is missing. Nested directories can have their own `.npmignore` files with unpredictable behavior.

**How to avoid:**
- **Use `files` field (whitelist approach, recommended):** `"files": ["dist", "README.md"]` — only publish built output
- **Never create `.npmignore`** unless you understand it replaces `.gitignore` entirely
- **Test before publishing:** Run `npm pack` locally, inspect the generated `.tgz` file: `tar -tzf claude-sms-connect-1.0.0.tgz`
- **Add to .gitignore AND package.json:** Ensure `.env`, `*.key`, `secrets/` are excluded both ways
- **Use `npm publish --dry-run`:** Preview what would be published without actually publishing
- **Verify file count:** A CLI package should be small (< 1MB). If tarball is 50MB, something's wrong.

**Warning signs:**
- Package tarball > 5MB for a simple CLI
- `.env` or credential files appearing in `npm pack` output
- Seeing `src/` TypeScript files instead of `dist/` JavaScript in published package
- Publishing for first time without testing with `npm pack`

**Phase to address:**
Phase 3 (npm publish setup) — Test before first publish, automate verification

---

### Pitfall 4: prepare Script Missing or Wrong Order

**What goes wrong:**
Run `npm publish`, but TypeScript source hasn't been compiled. Published package has stale `dist/` output or no `dist/` at all. Users install the package and get runtime errors or missing files.

**Why it happens:**
Developers forget to build before publishing, assuming manual `npm run build` is enough. The `prepublish` lifecycle hook was deprecated and confusing (ran on both `install` and `publish`). The `prepare` script runs on both `npm install` (for git dependencies) and before `npm publish`, but developers forget to add it.

**How to avoid:**
- **Always use `prepare` script:** `"prepare": "npm run build"` in package.json
- **Never use deprecated `prepublish`:** It's been deprecated since npm 5
- **Consider `prepublishOnly`:** If you want a script that ONLY runs before publish (not on install), use `"prepublishOnly": "npm test"` for validation
- **Build script should clean first:** `"build": "rm -rf dist && tsc"` to avoid stale files
- **Test with fresh install:** `npm pack`, `npm install -g ./claude-sms-connect-1.0.0.tgz`, verify it works

**Warning signs:**
- No `prepare` script in package.json
- Publishing without running build manually first
- Package contains old dist/ files from previous version
- Users reporting "Cannot find module" after installing from npm

**Phase to address:**
Phase 3 (npm publish setup) — Add before first publish attempt

---

### Pitfall 5: bin Path Resolution Differs Between Global and Local Install

**What goes wrong:**
`npm install -g` works perfectly — the `claude-sms` command is available globally. But `npm install claude-sms-connect` in a local project doesn't create the bin symlink, or it's in `./node_modules/.bin/` and users don't know how to run it.

**Why it happens:**
Global install adds bin to PATH (`/usr/local/bin/claude-sms` on Mac/Linux, `%APPDATA%\npm` on Windows). Local install only creates symlink in `./node_modules/.bin/`. Users expect `claude-sms` to work globally, but it's not in PATH. Additionally, Windows path resolution behaves differently — npm adds `.cmd` wrappers that may fail if bin file isn't executable.

**How to avoid:**
- **Document both installation methods:** README should show `npm install -g` (recommended) vs `npx claude-sms-connect` (no install)
- **Use `npx` for local installs:** Tell users to run `npx claude-sms-connect setup` instead of expecting global command
- **Test on all platforms:** Verify global install on macOS, Linux, AND Windows (path behavior differs)
- **Check permissions:** Global install may require `sudo` on Linux/Mac, or users need to configure npm prefix to avoid EACCES errors
- **Never assume PATH:** Don't rely on hardcoded paths like `/usr/local/bin` in setup script

**Warning signs:**
- Works on developer's Mac but not on user's Windows machine
- `command not found: claude-sms` after successful `npm install`
- EACCES permission errors during global install
- Documentation only shows one installation method

**Phase to address:**
Phase 1 (CLI setup) — Test cross-platform before milestone completion

---

### Pitfall 6: TypeScript Import Extensions in Built Output

**What goes wrong:**
TypeScript source uses `import { foo } from './utils'` (no extension). Built JavaScript outputs `import { foo } from './utils'` but Node ESM requires explicit `.js` extension. CLI fails at runtime with `ERR_MODULE_NOT_FOUND`.

**Why it happens:**
TypeScript doesn't automatically add `.js` extensions to import paths when targeting ESM, even though Node.js requires them for ES modules. TypeScript validates imports against `.ts` source files, but the runtime looks for `.js`. Developers write `import './utils.ts'` thinking it helps, but that's wrong — the import must match the OUTPUT filename.

**How to avoid:**
- **Write imports with `.js` extension in TypeScript source:** `import { foo } from './utils.js'` (yes, `.js` even though source is `.ts`)
- **Configure tsconfig.json:** `"module": "ESNext"` and `"moduleResolution": "bundler"` (already set correctly in your tsconfig)
- **Never use `.ts` in imports:** Runtime won't have `.ts` files, only `.js`
- **Verify build output:** Check `dist/` for correct import paths after compilation
- **Test built output, not source:** Always run `npm run build && node dist/cli.js` to verify

**Warning signs:**
- `ERR_MODULE_NOT_FOUND` errors at runtime but source compiles fine
- Import statements in `dist/` JavaScript lack `.js` extensions
- Imports work in dev mode (`tsx`) but fail in production (`node`)

**Phase to address:**
Phase 1 (TypeScript build setup) — Fix before CLI functionality is built

---

### Pitfall 7: Global Install Runs Unexpected prepare/install Hooks

**What goes wrong:**
`npm install -g` triggers the `prepare` script, which runs `npm run build`, which installs devDependencies (TypeScript, etc.) globally. User's global `node_modules/` is polluted with hundreds of packages. Install takes 2+ minutes and uses 200MB+ disk space when it should be < 1MB.

**Why it happens:**
The `prepare` hook runs before packing and after install. When installing from npm registry, the package is already built (dist/ included), but `prepare` runs anyway and tries to rebuild. If build requires devDependencies, npm installs them globally.

**How to avoid:**
- **Only run prepare for source installs:** Check if `dist/` exists before building:
  ```json
  "prepare": "[ -d dist ] || npm run build"
  ```
- **Better: Separate build from prepare:** Only run type checking in prepare, not full build:
  ```json
  "prepare": "tsc --noEmit || true",
  "prepublishOnly": "npm run build"
  ```
- **Best: Use prepublishOnly exclusively:** Don't use `prepare` at all, only `prepublishOnly` which ONLY runs before publish:
  ```json
  "prepublishOnly": "npm run build && npm test"
  ```
- **Include dist/ in published package:** Use `files: ["dist"]` so built code is in tarball
- **Test with registry simulation:** `npm publish --dry-run`, then `npm install -g ./claude-sms-connect-1.0.0.tgz`

**Warning signs:**
- Global install takes > 30 seconds
- devDependencies appearing in global node_modules
- TypeScript being installed globally when user runs `npm install -g`
- `prepare` script running on every install

**Phase to address:**
Phase 3 (npm publish setup) — Test global install workflow

---

### Pitfall 8: chmod +x Not Set on Bin File (Windows Compatibility)

**What goes wrong:**
On Linux/Mac, the bin file needs executable permissions to work after global install. If the file isn't marked executable before publishing to npm, users get "Permission denied" errors when running the command.

**Why it happens:**
npm preserves file permissions from the published tarball. If you develop on Windows (which doesn't have chmod), the bin file isn't marked executable. Or if you run `npm pack` before making the file executable, the tarball has wrong permissions. Git also doesn't preserve executable bits by default unless `.gitattributes` is configured.

**How to avoid:**
- **Set executable bit before publishing:** `chmod +x dist/cli.mjs` (run in prepare/prepublishOnly script)
- **Use cross-platform solution:** Install `chmod` package and use in scripts:
  ```json
  "prepublishOnly": "npm run build && npx chmod +x dist/cli.mjs"
  ```
- **Alternative: Let npm handle it:** The shebang `#!/usr/bin/env node` is usually enough — npm detects it and sets executable
- **Test on Linux:** Even if developing on Mac/Windows, test install on Linux VM/Docker
- **Don't rely on .gitattributes:** File permissions aren't reliably preserved through git

**Warning signs:**
- `/usr/bin/env: 'node': Permission denied` on Linux after global install
- Works on Mac but not on Linux
- File exists at `/usr/local/bin/claude-sms` but isn't executable (`ls -l` shows no `x`)

**Phase to address:**
Phase 3 (npm publish setup) — Add chmod to build process, test on Linux

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| CommonJS bin wrapper for ESM | Avoids shebang complexity | Extra file to maintain | Never — ESM is standard, use .mjs extension |
| Manual build before publish | No prepare script to debug | Forget once = broken publish | Never — automate with prepublishOnly |
| Skipping npm pack testing | Faster publish workflow | Ship broken package, can't unpublish | Never — always test tarball contents |
| Not testing on Windows | Fewer test environments | Windows users get broken package | Acceptable if Windows isn't target platform |
| Using --input-type=module shebang | No .mjs extension needed | Less portable, obscure to debug | Acceptable for internal tools |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| settings.json modification | Direct fs.writeFileSync() | Atomic write: tmp file → fsync → rename |
| package.json "files" | Relying on .gitignore alone | Explicit whitelist: ["dist", "README.md"] |
| TypeScript imports | import './utils' (no extension) | import './utils.js' (yes .js in .ts files) |
| bin entry | Pointing to .js file with ESM | Use .mjs extension or CommonJS wrapper |
| npm lifecycle hooks | Using deprecated prepublish | Use prepare + prepublishOnly |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Installing devDeps globally | Global install takes 2+ minutes | Use prepublishOnly, not prepare | Every global install |
| Large published package | Tarball > 10MB for CLI tool | Use files: ["dist"], test with npm pack | First install experience |
| Slow settings.json writes | CLI setup takes > 5 seconds | Use async I/O, don't block on disk sync | Never — atomic writes are fast |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Publishing .env files | API keys leaked to npm registry | Use files: ["dist"] whitelist, test with npm pack |
| No settings.json backup | User config lost on corrupt write | Always backup to .backup-[timestamp] before write |
| Overwriting entire settings.json | Lose user's other hooks | Deep merge: read → parse → merge → write |
| Running setup as root | Global install writes to /root/.claude/ | Warn if process.getuid() === 0 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No installation instructions | Users don't know npm install -g vs npx | README with clear "Installation" section, both methods |
| Setup command not discoverable | Users don't know to run setup | Package.json bin: "claude-sms" (main) + "claude-sms-setup" |
| No version flag | Can't verify installed version | Add --version / -v flag to CLI |
| Silent failures in setup | Setup appears to work but settings.json not updated | Verbose output: "✓ Backup created", "✓ Hooks configured", etc. |
| No uninstall instructions | Settings persist after npm uninstall | README: "Uninstalling" section, cleanup command |

## "Looks Done But Isn't" Checklist

- [ ] **npm pack tested:** Tarball inspected with `tar -tzf`, only expected files present
- [ ] **Global install tested:** `npm install -g`, command available in PATH without errors
- [ ] **ES module imports work:** Built output runs with `node dist/cli.mjs`, no ERR_MODULE_NOT_FOUND
- [ ] **settings.json atomic write:** Tested with Ctrl+C during write, file not corrupted
- [ ] **settings.json deep merge:** Existing hooks preserved, new hook added alongside
- [ ] **Cross-platform tested:** Verified on macOS, Linux, Windows (or document platform limitations)
- [ ] **prepare vs prepublishOnly:** Only runs build before publish, not on every install
- [ ] **Version bump verified:** package.json version incremented before each publish

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Published package with secrets | HIGH | `npm unpublish` within 72 hours, rotate all exposed credentials, re-publish |
| Published broken package | MEDIUM | Fix issue, bump version, republish immediately (can't unpublish after 72h) |
| Corrupted settings.json | LOW | User restores from .backup file or re-runs setup |
| Wrong bin permissions | LOW | User runs `chmod +x $(which claude-sms)` manually, fix in next version |
| devDeps installed globally | LOW | User runs `npm uninstall -g` + reinstall after fix |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ES module shebang | Phase 1 (CLI setup) | Run globally installed command, no SyntaxError |
| settings.json corruption | Phase 2 (settings integration) | Interrupt write with Ctrl+C, verify backup exists |
| Secrets in npm package | Phase 3 (publish setup) | npm pack → inspect tarball, no .env or secrets/ |
| prepare script wrong | Phase 3 (publish setup) | npm pack → npm install -g tarball, verify no devDeps |
| bin path resolution | Phase 1 (CLI setup) | Test on Linux, Mac, Windows |
| TypeScript import extensions | Phase 1 (build setup) | node dist/cli.mjs works without ERR_MODULE_NOT_FOUND |
| Unexpected prepare hooks | Phase 3 (publish setup) | Time global install, should be < 10 seconds |
| chmod +x not set | Phase 3 (publish setup) | Linux: ls -l $(which claude-sms), verify +x |

## Sources

**ES Module Shebang Issues:**
- [Add command line argument to force launch node.js file in "ES modules" mode](https://github.com/nodejs/node/issues/41136)
- [Feature: ESM in executable files](https://github.com/nodejs/modules/issues/152)
- [Creating ESM-based shell scripts for Unix and Windows with Node.js](https://2ality.com/2022/07/nodejs-esm-shell-scripts.html)
- [Installing and running Node.js bin scripts](https://2ality.com/2022/08/installing-nodejs-bin-scripts.html)

**npm Publish Files Field Issues:**
- [Control What you Publish Inside your Npm Packages](https://medium.com/trabe/control-what-you-publish-inside-your-npm-packages-e3ec911638b8)
- [Files & Ignores - npm/cli Wiki](https://github.com/npm/cli/wiki/Files-&-Ignores)
- [Publishing what you mean to publish](https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish.html)

**TypeScript Build Scripts:**
- [How to Build and Publish an NPM TypeScript Package](https://nearsoft.pt/blog/11-a-guide-how-to-build-and-publish-an-npm-typescript-package)
- [scripts - npm Docs](https://docs.npmjs.com/cli/v11/using-npm/scripts/)
- [TypeScript: Documentation - Publishing](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html)

**JSON Config File Corruption:**
- [PSA: Avoid Data Corruption by Syncing to the Disk](https://blog.elijahlopez.ca/posts/data-corruption-atomic-writing/)
- [JSON getting corrupted when writing to same file from multiple processes](https://github.com/typicode/lowdb/issues/333)
- [How I Work with Node.js and JSON Files in Real Projects](https://thelinuxcode.com/how-i-work-with-nodejs-and-json-files-in-real-projects-read-write-validate-and-avoid-the-traps/)

**npm Global Install Path Issues:**
- [Resolving EACCES permissions errors when installing packages globally](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/)
- [Where does NPM Install the packages?](https://www.geeksforgeeks.org/where-does-npm-install-the-packages/)
- [Alternatives to installing npm packages globally](https://2ality.com/2022/06/global-npm-install-alternatives.html)

**ES Modules + TypeScript + Node.js 22:**
- [NodeJS, Typescript, and the infuriating ESM errors](https://thedrlambda.medium.com/nodejs-typescript-and-the-infuriating-esm-errors-828b77e7ecd3)
- [TypeScript in 2025 with ESM and CJS npm publishing](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing)
- [Version 22.20.0 tightens Module Loader?](https://github.com/nodejs/node/issues/60290)

**package.json exports and bin:**
- [Guide to the package.json exports field](https://hirok.io/posts/package-json-exports)
- [TypeScript and NPM package.json exports the 2024 way](https://www.velopen.com/blog/typescript-npm-package-json-exports/)

**File Permissions Cross-Platform:**
- [Setting correct file permissions for npm package published from Windows](https://community.latenode.com/t/setting-correct-file-permissions-for-npm-package-published-from-windows/33635)

**JSON Comments and Whitespace:**
- [Why JSON comments are not allowed and what to do about it](https://jsoneditoronline.org/indepth/parse/json-comments/)
- [Using Comments in JSON with Node.js](https://10xdev.blog/json-comments/)
- [JSON.stringify() and JSON.parse(): The Complete Developer Guide for 2026](https://devtoolbox.dedyn.io/blog/json-stringify-parse-guide)

**npm Lifecycle Hooks:**
- [npm 4.0 Deprecates Prepublish Lifecycle Script](https://www.infoq.com/news/2016/10/npmv4-breaking/)
- [Safely Migrating Away from 'prepublish' with npm 4](https://blog.balena.io/safely-migrating-away-from-prepublish-with-npm-4/)
- [scripts - npm Docs](https://docs.npmjs.com/cli/v8/using-npm/scripts/)

**npm link for Development:**
- [NPM Link: Developing and Testing Local NPM Packages](https://medium.com/@ruben.alapont/npm-link-developing-and-testing-local-npm-packages-b50a32b50c4a)
- [npm-link - npm Docs](https://docs.npmjs.com/cli/v9/commands/npm-link/)
- [How to test an npm package locally](https://flaviocopes.com/npm-local-package/)

---
*Pitfalls research for: npm global CLI packaging for TypeScript ES module project*
*Researched: 2026-02-15*
