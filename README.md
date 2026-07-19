# auto-git-sync

> 🤖 Watch your project folder, auto-commit with **Gemini AI**-generated commit messages, and push to GitHub — all automatically.

[![npm version](https://img.shields.io/npm/v/auto-git-sync?color=blue)](https://www.npmjs.com/package/auto-git-sync)
[![Node.js](https://img.shields.io/node/v/auto-git-sync)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-babam49--dot%2Fgemini--git--commit-black?logo=github)](https://github.com/babam49-dot/gemini-git-commit)

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔍 **Smart file watching** | Uses [chokidar](https://github.com/paulmillr/chokidar), respects `.gitignore`, ignores `.git` & `node_modules` |
| 🤖 **Gemini AI commit messages** | Sends the unified diff to Gemini 2.0 Flash — gets a precise, emoji-prefixed commit message |
| ⏱ **Debounce** | Batches rapid saves into one commit (configurable, default 4 s) |
| 🔐 **Secret scanning** | Blocks `.env`, `*.pem`, AWS keys, private key blocks, and more from ever being committed |
| 🚀 **Push strategies** | `immediate` / `interval` / `manual` — fully configurable |
| 🔄 **Safe push retry** | On rejection: one `git pull --rebase` attempt, then a clear error — **never force-pushes** |
| 📄 **Config file** | `.autogitsyncrc.json` in your project root |
| 🏃 **Zero setup** | Works with `npx auto-git-sync start` in any git repo |

---

## 📦 Installation

### Global (recommended for daily use)
```bash
npm install -g auto-git-sync
```

### One-off with npx (no install required)
```bash
npx auto-git-sync start
```

### Local dev dependency
```bash
npm install --save-dev auto-git-sync
```

---

## 🚀 Quickstart

```bash
# 1. Navigate to your git project
cd my-project

# 2. Set your Gemini API key (free at https://aistudio.google.com/apikey)
export GEMINI_API_KEY="AIza..."          # macOS / Linux
$env:GEMINI_API_KEY="AIza..."           # Windows PowerShell
set GEMINI_API_KEY=AIza...              # Windows CMD

# 3. Start watching
auto-git-sync start
```

That's it! Every time you save files, `auto-git-sync` will:
1. Detect the changes
2. Run a secret scan
3. Get the diff and ask Gemini to write a commit message
4. `git add` + `git commit` + `git push`

---

## 🛠 CLI Commands

### `auto-git-sync start` — Start watching

```bash
auto-git-sync start [options]
```

| Flag | Description | Default |
|---|---|---|
| `--debounce <ms>` | Delay after last change before committing | `4000` |
| `--branch <name>` | Branch to push to | `main` |
| `--push-mode <mode>` | `immediate` \| `interval` \| `manual` | `immediate` |
| `--push-interval <min>` | Minutes between pushes (interval mode) | `10` |
| `--api-key <key>` | Gemini API key (alternative to env var) | — |
| `--dry-run` | Preview what would happen, no git changes | `false` |
| `--no-secret-scan` | ⚠️ Disable secret scanning | — |
| `--verbose` | Print full debug output | `false` |

**Examples:**
```bash
# Commit locally only, push manually
auto-git-sync start --push-mode manual

# Batch pushes every 5 minutes
auto-git-sync start --push-mode interval --push-interval 5

# Test without making real commits
auto-git-sync start --dry-run --verbose

# Slower debounce for big projects
auto-git-sync start --debounce 8000
```

---

### `auto-git-sync commit` — Interactive Gemini Commit (Manual)

If you do not want to automatically track, commit, and push files in the background, you can run this command on demand. It will stage all your changes, print a dynamic `Analyzing......` indicator, call Gemini to generate a message, and present you with an interactive selection menu:

```bash
auto-git-sync commit [options]
```

#### Interactive Menu Options:
1. **Commit & Push to GitHub**: Stages, commits locally using the proposed/edited message, and pushes to your configured branch.
2. **Commit locally only**: Stages and commits locally without pushing to GitHub.
3. **Edit/change the commit message**: Lets you input a custom commit message before committing.
4. **Abort**: Cancels the staging and exit.

| Flag | Description |
|---|---|
| `--api-key <key>` | Gemini API key (alternative to env var) |
| `--no-secret-scan` | Disable pre-commit secret safety scanning |
| `--dry-run` | Preview the generated commit message without making any commit |
| `--verbose` | Print full debug output |

**Example:**
```bash
# Start the interactive commit flow
auto-git-sync commit

# Preview the generated message
auto-git-sync commit --dry-run
```

---

### `auto-git-sync init` — Create config file

```bash
auto-git-sync init
auto-git-sync init --force   # overwrite existing
```

Creates a `.autogitsyncrc.json` in the current directory with all options.

---

### `auto-git-sync model` — Gemini model info

```bash
# Show current model and API key status
auto-git-sync model --show-version

# List all available models
auto-git-sync model --list
```

**Output example:**
```
  Current Gemini model : gemini-3.5-flash
  Description          : ⚡ Latest & fastest — best for agentic / coding tasks (default)
  API key set          : ✅ yes

  Available Gemini models:

    gemini-3.5-flash             ⚡ Latest & fastest — best for agentic / coding tasks (default) ← default
    gemini-3.1-pro               🧠 Most capable — complex reasoning, long context
    gemini-3.1-flash             Fast 3.1 variant — balanced speed & intelligence
    gemini-3.1-flash-lite        Lightest 3.x model — lowest latency, high volume
    gemini-2.5-pro               Stable flagship — proven for production environments
    gemini-2.5-flash             Stable fast variant — reliable & cost-effective
    gemini-2.5-flash-lite        Lightest 2.5 model
    gemini-2.0-flash             Previous generation flash (legacy)
    gemini-2.0-flash-lite        Lightest legacy variant
```

---

### `auto-git-sync install` — Usage guide

```bash
auto-git-sync install
```

Prints the full install/setup reference.

---

### `auto-git-sync status` — Config dump

```bash
auto-git-sync status
```

Prints the current resolved config (API key is redacted).

---

### Version check

```bash
auto-git-sync --version
auto-git-sync -v
```

---

## ⚙️ Configuration — `.autogitsyncrc.json`

Run `auto-git-sync init` to create this file, then edit as needed:

```jsonc
{
  // Directory to watch (relative to this file, default: ".")
  "watchPath": ".",

  // Milliseconds to wait after the last file change before committing
  "debounceMs": 4000,

  // Git branch to push to
  "branch": "main",

  // Push strategy: "immediate" | "interval" | "manual"
  "pushMode": "immediate",

  // Only used when pushMode = "interval"
  "pushIntervalMinutes": 10,

  // Extra paths/globs to ignore (on top of .gitignore)
  "ignorePatterns": ["dist/", "*.log"],

  // Custom commit message template.
  // Placeholders: {count}, {files}, {date}
  // Set to null to use Gemini AI (recommended)
  "commitMessageTemplate": null,

  // Enable pre-commit secret scanning
  "secretScan": true,

  // Regex strings to allowlist (false positive override)
  "allowSecretPatterns": [],

  // Simulate without making git changes
  "dryRun": false,

  // Your Gemini API key (or use GEMINI_API_KEY env var — preferred)
  "geminiApiKey": null,

  // Gemini model to use for commit messages
  "geminiModel": "gemini-3.5-flash"
}
```

### Config precedence (highest → lowest)
```
CLI flags > .autogitsyncrc.json > defaults
```

---

## 🤖 Gemini AI Commit Messages

When `GEMINI_API_KEY` is set, every commit message is generated by Gemini:

```
✨ Add user authentication with JWT tokens
🐛 Fix null pointer in payment handler
♻️ Refactor database connection pool
📝 Update README with deployment instructions
🔧 Configure ESLint rules for TypeScript
```

If the API key is not set, auto-git-sync falls back to a timestamp message:
```
🔄 auto-sync: updated 3 files (app.js, routes.js, db.js) - 2026-07-18 14:32
```

**Get a free Gemini API key:**
👉 https://aistudio.google.com/apikey

### Custom commit message template

If you prefer to bypass Gemini entirely:
```json
{
  "commitMessageTemplate": "auto-sync: {count} file(s) changed on {date}"
}
```

Available placeholders: `{count}`, `{files}`, `{date}`.

---

## 🔐 Secret Scanning

Before every commit, `auto-git-sync` scans all changed files for:

### Filename patterns blocked automatically:
- `.env`, `.env.*` (`.env.local`, `.env.production`, …)
- `*.pem`, `*.key`, `*.p12`, `*.pfx`
- `id_rsa*`, `id_rsa.pub`
- `credentials.json`, `secrets.*`, `service-account.json`

### Content patterns detected:
| Pattern | Example |
|---|---|
| AWS Access Key | `AKIA...` (20 chars) |
| Private Key block | `-----BEGIN RSA PRIVATE KEY-----` |
| Generic API key assignments | `api_key="sk-abc123..."` |
| GitHub tokens | `ghp_...`, `gho_...` |
| Slack tokens | `xoxb-...` |
| Google API keys | `AIza...` |
| Stripe secret keys | `sk_live_...` |
| Generic Bearer tokens | `Bearer eyJ...` |

When a violation is found, the file is **skipped** (not blocked — the rest of your changes still commit) and a clear warning is logged:

```
[14:32:01] WARN  🔐 SECRET SCAN — Skipping ".env.local" — Sensitive filename matched...
```

### Allowlist false positives:
```json
{
  "allowSecretPatterns": ["MY_ALLOWED_TOKEN_PATTERN", "test-api-key"]
}
```

### Disable scanning (not recommended):
```bash
auto-git-sync start --no-secret-scan
```
⚠️ This prints a prominent multi-line warning.

---

## 🔄 Push Strategies

| Mode | Behavior |
|---|---|
| `immediate` | Push to remote after every commit (default) |
| `interval` | Commit immediately, push every N minutes |
| `manual` | Commit locally only — you push when ready |

Switch mode without editing config:
```bash
auto-git-sync start --push-mode manual
auto-git-sync start --push-mode interval --push-interval 15
```

### Safe push behavior
1. Pushes normally
2. If rejected (non-fast-forward): runs `git pull --rebase` once, retries push
3. If still failing: prints a clear error message and stops (never force-pushes)

---

## 📡 Programmatic API

```js
import { startWatcher, loadConfig } from 'auto-git-sync';

const config = loadConfig(process.cwd(), {
  pushMode: 'manual',
  debounceMs: 2000,
  geminiApiKey: process.env.GEMINI_API_KEY,
});

const { stop } = await startWatcher(config);

// Stop watching after 1 hour
setTimeout(stop, 60 * 60 * 1000);
```

Available exports:
```js
import {
  startWatcher,       // Start the file watcher
  loadConfig,         // Load + merge configuration
  scanFiles,          // Run secret scan on file list
  generateCommitMessage, // Ask Gemini for a commit message
  fallbackMessage,    // Generate auto-timestamp message
  AVAILABLE_MODELS,   // List of Gemini models
  addAndCommit,       // git add + commit
  pushToRemote,       // git push (with retry)
  getDiff,            // Get unified diff
  hasChanges,         // Check for pending changes
  assertGitRepo,      // Validate git repo
  assertRemote,       // Validate remote exists
  logger,             // Timestamped logger
  setVerbose,         // Toggle verbose mode
} from 'auto-git-sync';
```

---

## 🏗 Package Structure

```
auto-git-sync/
├── bin/
│   └── cli.js          # CLI entry (Commander.js)
├── src/
│   ├── index.js        # Programmatic API barrel
│   ├── watcher.js      # chokidar watcher + debounce + flush logic
│   ├── git.js          # simple-git wrapper (add/commit/push/diff)
│   ├── config.js       # Config loader and defaults
│   ├── secretScan.js   # Pre-commit secret scanner
│   ├── gemini.js       # Gemini AI commit message generation
│   └── logger.js       # Timestamped color logger
├── .autogitsyncrc.json # Default config template
├── package.json
└── README.md
```

---

## 🧪 How It Works — Flow Diagram

```
File saved
    │
    ▼
chokidar detects change
    │
    ▼
Add to changedFiles Set
    │
    ▼
Debounce timer reset (4s default)
    │
    ▼ (timer fires)
Secret scan on changed files
    │
    ├─ violations found → skip those files, warn
    │
    ▼
git diff (staged + unstaged)
    │
    ▼
Gemini API: analyze diff → commit message
    │
    ├─ no API key / error → fallback timestamp message
    │
    ▼
git add <safe files>
git commit -m "<message>"
    │
    ▼
Push strategy?
    ├─ immediate → git push (+ pull --rebase retry on rejection)
    ├─ interval  → push every N minutes
    └─ manual    → log "run git push origin <branch>"
```

---

## 🔧 Requirements

- **Node.js** ≥ 18
- **Git** installed and on PATH
- A git repository with a remote configured (`git remote add origin …`)
- **Gemini API key** (optional — falls back to timestamp messages if not set)

---

## 🚨 Error Handling

| Error | Behavior |
|---|---|
| Not a git repo | Clear message with `git init` hint, exits |
| No remote set | Clear message with `git remote add` hint, exits |
| Push rejected | One `git pull --rebase` retry, then a clear failure message |
| Gemini API error | Falls back to timestamp-based commit message, logs warning |
| Unreadable file | Skipped gracefully |
| Secret found | File skipped, rest of changes still commit |

---

## 📝 License

MIT — see [LICENSE](LICENSE)

---

## 🙏 Dependencies

| Package | Purpose |
|---|---|
| [chokidar](https://github.com/paulmillr/chokidar) | Cross-platform file watching |
| [simple-git](https://github.com/steveukx/git-js) | Safe git operations (no `exec`) |
| [ignore](https://github.com/kaelzhang/node-ignore) | Parse and apply `.gitignore` rules |
| [commander](https://github.com/tj/commander.js) | CLI argument parsing |
| [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) | Gemini AI API client |
