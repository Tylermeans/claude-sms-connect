# Feature Research

**Domain:** npm Global CLI Package for SMS Relay Server
**Researched:** 2026-02-15
**Confidence:** HIGH

**Note:** This research focuses ONLY on npm packaging and CLI features. The SMS relay server features (Express routes, Twilio integration, tmux control) are already built and not covered here.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `npm install -g` support | Standard for all CLI tools - users expect global installation | LOW | Requires `bin` field in package.json with shebang `#!/usr/bin/env node` |
| `--help` flag | POSIX standard - every CLI must explain itself | LOW | Commander.js provides this automatically |
| `--version` flag | Users need to check installed version, troubleshoot | LOW | Commander.js reads from package.json automatically |
| Setup/init command | Users expect guided configuration, not manual file editing | MEDIUM | Interactive prompts with Inquirer.js, generates .env, validates input |
| Start command | Users expect simple command to run the server | LOW | Wrapper around existing Express server (dist/index.js) |
| Error messages that explain what to do | Users stuck without actionable errors | LOW | Return helpful error text with next steps, not stack traces |
| Graceful handling of missing deps | npm install failures shouldn't break everything | LOW | Try/catch around execFileSync with fallback instructions |
| Cross-platform compatibility | Windows, macOS, Linux all expected to work | MEDIUM | Shebang ignored on Windows but npm creates .cmd wrapper automatically |
| Non-destructive operations | Never overwrite user data without consent | HIGH | Check for existing .env before creating, backup settings.json before modifying |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-inject Claude Code hook | Automates manual hook setup - saves 10+ minutes of config | HIGH | Read ~/.claude/settings.json, parse, merge hooks array, write with backup |
| Interactive setup wizard | Guides users through Twilio credentials, validates format | MEDIUM | Inquirer.js prompts with validation, test Twilio connection before saving |
| Automatic .env.backup creation | Users can recover if setup fails | LOW | Copy .env to .env.backup.timestamp before modifications |
| Settings.json backup with timestamp | Users can manually restore Claude Code config if needed | LOW | Copy to settings.json.backup.TIMESTAMP before injection |
| Visual progress indicators | Professional feel, reduces perceived wait time | LOW | Ora spinners for async operations (npm install, API validation) |
| Colored output | Easier to scan success/error/warning messages | LOW | Chalk for green success, red errors, yellow warnings |
| Validation of Twilio credentials during setup | Catch config errors before first run | MEDIUM | Test API call to Twilio during setup, fail fast with clear error |
| Detection of existing Claude Code hook | Warn if hook already configured, prevent duplicates | MEDIUM | Parse settings.json hooks array, check for existing command matching pattern |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Daemon/background mode for server | "I want it always running" | Adds complexity (process management, logging, restart on crash), requires platform-specific solutions (systemd, launchd, Windows Service) | Run in foreground, document how users can use tmux/screen or systemd if needed |
| Auto-update settings.json without prompt | "Just make it work automatically" | Dangerous - modifying user config files without consent breaks trust, no recovery if it fails | Always prompt for consent, show what will be changed, create backup first |
| Bundling Twilio credentials in package | "Make it easier to get started" | Security nightmare - credentials in version control, npm registry | Require users to create their own Twilio account |
| `--force` flag to overwrite .env | "I want to regenerate config" | Easy to accidentally destroy working config | Require manual deletion of .env, show clear warning if it exists |
| Global config file for AUTH_TOKEN | "Share token across projects" | Security risk - global token harder to rotate, affects all projects | Per-project .env with unique tokens |
| Interactive mode for start command | "Ask me which port to use" | Server config should be stable, not interactive every launch | Port in .env, override with PORT environment variable if needed |
| npm postinstall script auto-setup | "Run setup automatically after install" | Hostile behavior - users don't expect global install to modify files, breaks trust | Require explicit `claude-sms-connect setup` command |

## Feature Dependencies

```
Setup Command
    ├──requires──> .env.example file (template)
    ├──requires──> scripts/setup.js (existing)
    └──generates──> .env file

Auto-inject Hook
    ├──requires──> Setup command (AUTH_TOKEN must exist in .env)
    ├──requires──> hooks/claude-code-hook.sh (existing)
    ├──reads────> ~/.claude/settings.json
    └──writes───> ~/.claude/settings.json (with backup)

Start Command
    ├──requires──> .env file (from setup)
    ├──requires──> npm install completed (dependencies)
    └──requires──> dist/index.js (compiled from TypeScript)

Global Installation
    ├──requires──> bin field in package.json
    ├──requires──> Shebang in CLI entry file
    └──provides──> All commands (setup, start)
```

### Dependency Notes

- **Setup must run before start:** Start command requires .env with Twilio credentials
- **Build must run before start:** TypeScript must be compiled to dist/index.js
- **Hook injection requires setup:** AUTH_TOKEN must exist in .env to update hook script
- **Global install enables all commands:** `bin` field exposes both setup and start commands

## MVP Definition

### Launch With (v1)

Minimum viable product - what's needed to validate the concept.

- [x] **Global installation via npm** - Core delivery mechanism
- [x] **`claude-sms-connect setup` command** - Interactive wizard for .env creation (ALREADY EXISTS in scripts/setup.js)
- [x] **`claude-sms-connect start` command** - Run Express server in foreground
- [x] **Auto-generate AUTH_TOKEN** - Secure token via crypto.randomBytes (ALREADY EXISTS)
- [ ] **Validate Twilio credentials** - Test API connection during setup
- [x] **Never overwrite existing .env** - Check existsSync, warn and exit if present (ALREADY EXISTS)
- [ ] **--help and --version flags** - Standard CLI expectations
- [ ] **Colored console output** - Success/error/warning clarity with Chalk
- [ ] **Hook auto-injection with consent** - Prompt user, backup settings.json, inject hook config

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **`claude-sms-connect doctor` command** - Validate full config (trigger for adding: users report setup confusion)
- [ ] **`claude-sms-connect uninstall` command** - Remove hook from settings.json, clean backups (trigger: users request clean removal)
- [ ] **Progress spinners with Ora** - Visual feedback during async operations (trigger: setup feels slow/frozen)
- [ ] **Detect existing hooks in settings.json** - Warn about duplicates before injection (trigger: users accidentally run setup twice)
- [ ] **`--skip-hook` flag for setup** - Allow skipping hook injection (trigger: advanced users want manual control)

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **`claude-sms-connect update-hook` command** - Refresh hook script in settings.json (defer: unclear if hook updates are common)
- [ ] **Multi-project hook support** - Register multiple projects with different tokens (defer: need evidence users run multiple instances)
- [ ] **Config file validation and repair** - Auto-fix common .env mistakes (defer: adds complexity, unclear value)
- [ ] **Integrated tunnel management** - Start/stop ngrok from CLI (defer: ngrok has its own excellent CLI)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Global npm install | HIGH | LOW | P1 |
| Setup command (interactive) | HIGH | MEDIUM | P1 |
| Start command | HIGH | LOW | P1 |
| Hook auto-injection | HIGH | HIGH | P1 |
| --help / --version | HIGH | LOW | P1 |
| Colored output | MEDIUM | LOW | P1 |
| .env validation (never overwrite) | HIGH | LOW | P1 |
| Twilio credential validation | HIGH | MEDIUM | P1 |
| Settings.json backup | HIGH | LOW | P1 |
| Progress spinners | MEDIUM | LOW | P2 |
| Doctor command | MEDIUM | MEDIUM | P2 |
| Uninstall command | MEDIUM | MEDIUM | P2 |
| Detect existing hooks | MEDIUM | MEDIUM | P2 |
| --skip-hook flag | LOW | LOW | P2 |
| Update-hook command | LOW | MEDIUM | P3 |
| Multi-project support | LOW | HIGH | P3 |
| Config repair | LOW | HIGH | P3 |
| Integrated ngrok | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (blocking npm publish)
- P2: Should have, add when possible (post-launch improvements)
- P3: Nice to have, future consideration (validate demand first)

## CLI Library Recommendations

Based on research, industry standards, and load time performance:

| Library | Purpose | Why Use | Load Time | Status |
|---------|---------|---------|-----------|--------|
| **Commander.js** | Command/option parsing | Industry standard, auto --help/--version, simple API | 12.1ms | REQUIRED |
| **Inquirer.js** | Interactive prompts | Largest market share, custom prompt types, validation | 6.2ms | REQUIRED |
| **Chalk** | Colored terminal output | Standard for styling, simple API, no dependencies | 85.2ms | RECOMMENDED |
| **Ora** | Spinner animations | Professional feel, minimal API, fast load | 3.8ms | RECOMMENDED |
| **dotenv** | .env file parsing | Twelve-Factor App standard, zero dependencies | N/A | ALREADY INSTALLED |

**Note:** Load times from performance analysis. All times under 100ms acceptable for CLI tools.

## User Experience Patterns

### Setup Command Flow

```
$ npm install -g claude-sms-connect
$ claude-sms-connect setup

[Spinner] Checking for existing configuration...
✓ No existing .env found

[Prompt] Enter your Twilio Account SID: AC1234...
[Prompt] Enter your Twilio Auth Token: ****
[Prompt] Enter your Twilio phone number: +15551234567
[Prompt] Enter your phone number: +15559876543

[Spinner] Validating Twilio credentials...
✓ Twilio credentials valid

[Spinner] Generating secure AUTH_TOKEN...
✓ AUTH_TOKEN generated

[Spinner] Writing .env file...
✓ .env created

[Prompt] Auto-configure Claude Code settings.json? (Y/n): Y
[Info] This will:
  - Backup ~/.claude/settings.json → settings.json.backup.1708012800
  - Inject notification hook configuration
  - Update hook script with AUTH_TOKEN

[Prompt] Proceed? (Y/n): Y

[Spinner] Backing up settings.json...
✓ Backup created: settings.json.backup.1708012800

[Spinner] Injecting notification hook...
✓ Hook configured

✓ Setup complete!

Next steps:
  1. Start the server: claude-sms-connect start
  2. Set up ngrok tunnel: ngrok http 3000
  3. Configure Twilio webhook with your ngrok URL
```

### Start Command Flow

```
$ claude-sms-connect start

[Spinner] Loading configuration...
✓ Configuration loaded

[Info] Claude SMS Connect v1.0.0
[Info] Starting Express server on http://localhost:3000

[Success] Server running
[Info] Waiting for SMS notifications...
[Info] Press Ctrl+C to stop
```

### Error Handling Examples

```
$ claude-sms-connect start

[Error] .env file not found
[Help] Run 'claude-sms-connect setup' first

---

$ claude-sms-connect setup

[Warning] .env already exists
[Help] To regenerate:
  1. Backup your current .env
  2. Delete .env
  3. Run setup again

---

$ claude-sms-connect setup
[Prompt] Enter your Twilio Account SID: AC1234
[Spinner] Validating Twilio credentials...
[Error] Invalid Twilio credentials
[Help] Check your Account SID and Auth Token at:
       https://console.twilio.com/
```

## Settings.json Hook Injection Strategy

### Challenge

Modify user's `~/.claude/settings.json` without breaking it:
- File may not exist (first-time Claude Code users)
- File may have existing hooks (don't duplicate)
- File may have syntax errors (handle gracefully)
- File may be empty object `{}` (common default)

### Safe Injection Pattern

```javascript
1. Check if ~/.claude/settings.json exists
   - If not: create with minimal structure

2. Read file, parse JSON with try/catch
   - If parse fails: warn user, abort (don't corrupt)

3. Create backup: settings.json.backup.TIMESTAMP

4. Check for existing hook:
   - Parse hooks.Notification array
   - Look for command matching "claude-code-hook.sh" or "claude-sms-connect"
   - If found: warn user, ask to overwrite

5. Merge hook configuration:
   - Initialize hooks.Notification if missing
   - Add new hook object to array
   - Preserve all other config

6. Write atomically:
   - Write to temp file
   - Validate JSON
   - Rename temp -> settings.json

7. Confirm success:
   - Print backup location
   - Show what was added
   - Explain how to manually restore if needed
```

### Backup Strategy

- **Timestamp format:** `settings.json.backup.1708012800` (Unix timestamp)
- **Location:** Same directory as settings.json (`~/.claude/`)
- **Retention:** Keep all backups, user can delete manually
- **Restoration:** Document in error messages how to `cp` backup back

### Ethical Considerations

**DO:**
- Always prompt for consent before modifying
- Show exactly what will change
- Create backup first
- Provide manual restoration instructions
- Abort on any uncertainty (parse errors, permission denied)

**DON'T:**
- Modify without explicit user approval
- Hide what's being changed
- Overwrite backups
- Proceed if file is corrupted
- Assume user wants automated changes

## Existing Implementation Assessment

Based on reading `/Users/tylermeans/github/claude-sms-connect/scripts/setup.js`:

**Already Implemented:**
- ✓ Generates cryptographically secure AUTH_TOKEN (randomBytes)
- ✓ Creates .env from .env.example template
- ✓ Never overwrites existing .env (existsSync check)
- ✓ Installs npm dependencies via execFileSync
- ✓ Clear console output with step-by-step instructions
- ✓ Graceful error handling with try/catch
- ✓ Shebang `#!/usr/bin/env node` for npm bin compatibility

**Missing for Global CLI:**
- ✗ No Commander.js integration (no --help, --version flags)
- ✗ No Inquirer.js prompts (instructions printed, but user edits .env manually)
- ✗ No Twilio credential validation
- ✗ No settings.json auto-injection
- ✗ No colored output (plain console.log)
- ✗ No progress spinners
- ✗ No start command wrapper

**Recommendation:** Existing setup.js is excellent foundation. For global CLI packaging, wrap it with Commander.js for command structure, add Inquirer.js for interactive prompts, and add settings.json injection as optional feature.

## Competitor Feature Analysis

| Feature | `create-*` tools (CRA, Vite) | PM2 | Our Approach |
|---------|------------------------------|-----|--------------|
| Interactive setup | Yes (npx create-react-app) | No | Yes (claude-sms-connect setup) |
| Global installation | No (prefer npx) | Yes (pm2) | Yes (global CLI) |
| Config file generation | Yes (.env, config files) | Yes (ecosystem.config.js) | Yes (.env from template) |
| Auto-start after install | No (manual npm start) | Optional (pm2 startup) | No (explicit start command) |
| Daemon mode | No (foreground only) | Yes (background process) | No (foreground, document alternatives) |
| User config modification | No (project-local only) | Yes (systemd integration) | Yes (with consent, backup) |
| Validation during setup | Partial (check Node version) | No | Yes (Twilio API test) |

**Key insight:** Most respected CLI tools either:
1. Run locally per-project (create-* tools) - no global state modification
2. Run as global daemon with explicit user consent (pm2 startup requires sudo)

**Our hybrid approach:** Global install but per-project .env, only modify global config (settings.json) with explicit consent and backup.

## Sources

**npm CLI Best Practices:**
- [Best practices for building CLI and publishing it to NPM](https://webbylab.com/blog/best-practices-for-building-cli-and-publishing-it-to-npm/)
- [How to Create a CLI Tool with Node.js](https://oneuptime.com/blog/post/2026-01-22-nodejs-create-cli-tool/view)
- [GitHub: Node.js CLI Apps Best Practices](https://github.com/liratal/nodejs-cli-apps-best-practices)
- [npm Blog: Building a simple command line tool with npm](https://blog.npmjs.org/post/118810260230/building-a-simple-command-line-tool-with-npm.html)

**User Experience Patterns:**
- [Using Node.js to Create Powerful, Beautiful, User-Friendly CLIs](https://nodesource.com/blog/node-js-powerful-beautiful-clis)
- [Node CLI with Commander and Inquirer](https://korzio.medium.com/node-cli-with-commander-and-inquirer-3eacc0086e7c)
- [How to Prototype a CLI Using CommanderJS and InquirerJS](https://medium.com/swlh/how-to-prototype-a-cli-using-commanderjs-and-inquirerjs-in-less-than-3-hours-6d5f0d1b9725)

**Process Management:**
- [How to Run a Node.js App as a Background Service](https://www.geeksforgeeks.org/how-to-run-a-node-js-app-as-a-background-service/)
- [A Complete Guide to Node.js Process Management with PM2](https://blog.appsignal.com/2022/03/09/a-complete-guide-to-nodejs-process-management-with-pm2.html)

**Configuration and Environment:**
- [dotenv - npm](https://www.npmjs.com/package/dotenv)
- [npm dotenv: Set Up and Configure .env File and Best Practices](https://www.dhiwise.com/post/environment-variables-best-practices-for-npm-dotenv-usage)

**Library Comparisons:**
- [chalk vs commander vs yargs vs inquirer vs ora](https://npm-compare.com/chalk,commander,yargs,inquirer,ora,cli-table,ink,blessed,terminal-kit)
- [What are the best libraries for using Node.js with a command-line interface?](https://reintech.io/blog/best-libraries-for-using-node-js-with-a-command-line-interface)

**package.json bin Configuration:**
- [What "Bin" does in package.json?](https://medium.com/nerd-for-tech/what-bin-does-in-package-json-931d691b1e33)
- [A guide to creating a NodeJS command-line package](https://medium.com/netscape/a-guide-to-create-a-nodejs-command-line-package-c2166ad0452e)

---
*Feature research for: npm Global CLI Package wrapping Express server*
*Researched: 2026-02-15*
