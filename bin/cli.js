#!/usr/bin/env node
// bin/cli.js — auto-git-sync command-line interface

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

import readline from 'readline/promises';
import { loadConfig, defaultConfigJson, CONFIG_FILENAME } from '../src/config.js';
import { startWatcher } from '../src/watcher.js';
import { assertGitRepo, assertRemote, addAndCommit, getDiff, getChangedFiles, pushToRemote } from '../src/git.js';
import { scanFiles } from '../src/secretScan.js';
import { logger, setVerbose } from '../src/logger.js';
import {
  printModelVersion,
  listModels,
  AVAILABLE_MODELS,
  generateCommitMessage,
} from '../src/gemini.js';

// ─── Package version ──────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

// ─── Root program ─────────────────────────────────────────────────────────────
const program = new Command();

program
  .name('auto-git-sync')
  .description(
    'Watch a project folder and automatically commit + push changes to GitHub,\n' +
    'powered by Gemini AI for intelligent commit messages.'
  )
  .version(pkg.version, '-v, --version', 'Print version number');

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND: start
// ══════════════════════════════════════════════════════════════════════════════
program
  .command('start')
  .description('Start watching the current directory for file changes')
  .option('--debounce <ms>',       'Debounce delay in milliseconds (default: 4000)')
  .option('--branch <name>',       'Git branch to push to (default: main)')
  .option('--push-mode <mode>',    'Push strategy: immediate | interval | manual (default: immediate)')
  .option('--push-interval <min>', 'Push interval in minutes when --push-mode=interval (default: 10)')
  .option('--dry-run',             'Log what would happen without making any git changes')
  .option('--no-secret-scan',      'Disable secret scanning (prints a loud warning)')
  .option('--verbose',             'Enable verbose/debug output')
  .option('--api-key <key>',       'Gemini API key (alternative to GEMINI_API_KEY env var)')
  .action(async (opts) => {
    // Resolve verbose first so all subsequent logs respect it
    const verbose = opts.verbose ?? false;
    setVerbose(verbose);

    // ── Map CLI flags → config keys ─────────────────────────────────────────
    const cliFlags = {
      debounceMs:           opts.debounce       ? Number(opts.debounce) : undefined,
      branch:               opts.branch,
      pushMode:             opts.pushMode,
      pushIntervalMinutes:  opts.pushInterval    ? Number(opts.pushInterval) : undefined,
      dryRun:               opts.dryRun          ?? false,
      secretScan:           opts.secretScan      ?? true,   // Commander flips --no-* to false
      verbose,
      geminiApiKey:         opts.apiKey,
    };

    const config = loadConfig(process.cwd(), cliFlags);

    // ── Secret scan warning ──────────────────────────────────────────────────
    if (!config.secretScan) {
      logger.warn('═══════════════════════════════════════════════════════════');
      logger.warn('  ⚠️  SECRET SCANNING IS DISABLED  ⚠️');
      logger.warn('  Sensitive files (API keys, private keys, .env) may be');
      logger.warn('  committed and pushed to your remote repository!');
      logger.warn('═══════════════════════════════════════════════════════════');
    }

    // ── Validate git environment ─────────────────────────────────────────────
    try {
      await assertGitRepo(config.watchPath);
    } catch (err) {
      logger.error(err.message);
      process.exit(1);
    }

    if (config.pushMode !== 'manual') {
      try {
        await assertRemote(config.watchPath);
      } catch (err) {
        logger.error(err.message);
        process.exit(1);
      }
    }

    // ── Start watcher ────────────────────────────────────────────────────────
    const { stop } = await startWatcher(config);

    // Graceful shutdown
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, async () => {
        console.log();
        await stop();
        process.exit(0);
      });
    }
  });

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND: commit
// ══════════════════════════════════════════════════════════════════════════════
program
  .command('commit')
  .description('Track changes, scan for secrets, analyze diff with Gemini, and commit locally (no automatic push)')
  .option('--api-key <key>',       'Gemini API key (alternative to GEMINI_API_KEY env var)')
  .option('--no-secret-scan',      'Disable secret scanning')
  .option('--dry-run',             'Log what would happen without making any actual commit')
  .option('--verbose',             'Enable verbose/debug output')
  .action(async (opts) => {
    const verbose = opts.verbose ?? false;
    setVerbose(verbose);

    const cliFlags = {
      secretScan:           opts.secretScan ?? true,
      dryRun:               opts.dryRun ?? false,
      verbose,
      geminiApiKey:         opts.apiKey,
    };

    const config = loadConfig(process.cwd(), cliFlags);

    // Validate git repository
    try {
      await assertGitRepo(config.watchPath);
    } catch (err) {
      logger.error(err.message);
      process.exit(1);
    }

    // Get modified / untracked files
    const files = await getChangedFiles(config.watchPath);
    if (files.length === 0) {
      logger.info('No changes detected in the workspace — nothing to commit.');
      return;
    }

    logger.info(`📁 Tracked changes in ${files.length} file(s)`);

    // Run secret scan if enabled
    let safeFiles = files;
    if (config.secretScan) {
      const result = scanFiles(files, config);
      safeFiles = result.safeFiles;

      if (result.skippedFiles.length > 0) {
        logger.warn(`🔐 Skipped ${result.skippedFiles.length} file(s) due to secret scan:`);
        for (const { file, reason } of result.skippedFiles) {
          logger.warn(`   ✖ ${path.basename(file)}: ${reason}`);
        }
      }

      if (safeFiles.length === 0) {
        logger.warn('All changed files were skipped — commit aborted.');
        return;
      }
    }

    // Get unified diff for Gemini
    const diff = await getDiff(config.watchPath, safeFiles);

    // Generate commit message using Gemini
    const timestamp = new Date().toTimeString().slice(0, 8);
    process.stdout.write(`\x1b[2m[${timestamp}]\x1b[0m \x1b[36m\x1b[1mINFO \x1b[0m Analyzing......`);
    const commitMessage = await generateCommitMessage(diff, config, safeFiles);
    process.stdout.write('\r\x1b[K'); // clear the "Analyzing......" line

    logger.success(`Gemini analyzed the changes successfully!`);
    console.log(`🤖 Proposed Commit Message: "${commitMessage}"\n`);

    // Setup interactive prompt
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let currentMessage = commitMessage;
    let done = false;

    while (!done) {
      console.log('What would you like to do?');
      console.log('  [1] Commit & Push to GitHub');
      console.log('  [2] Commit locally only (no push)');
      console.log('  [3] Edit/change the commit message');
      console.log('  [4] Abort');
      console.log();

      const answer = await rl.question('Enter choice (1-4): ');
      const choice = answer.trim();

      if (choice === '1') {
        rl.close();
        done = true;
        try {
          // Check if remote is configured if pushing
          await assertRemote(config.watchPath);
          const sha = await addAndCommit(config.watchPath, safeFiles, currentMessage, config.dryRun);
          if (!config.dryRun) {
            logger.success(`📝 Committed: [${sha.slice(0, 7)}] ${currentMessage}`);
            logger.info(`Pushing to origin/${config.branch}…`);
            await pushToRemote(config.watchPath, config.branch, config.dryRun);
          } else {
            logger.info(`[DRY-RUN] Would commit & push: "${currentMessage}"`);
          }
        } catch (err) {
          logger.error(`Failed: ${err.message}`);
          process.exit(1);
        }
      } else if (choice === '2') {
        rl.close();
        done = true;
        try {
          const sha = await addAndCommit(config.watchPath, safeFiles, currentMessage, config.dryRun);
          if (!config.dryRun) {
            logger.success(`📝 Committed locally: [${sha.slice(0, 7)}] ${currentMessage}`);
            logger.info(`Run 'git push origin ${config.branch}' to push manually when ready.`);
          } else {
            logger.info(`[DRY-RUN] Would commit locally: "${currentMessage}"`);
          }
        } catch (err) {
          logger.error(`Failed: ${err.message}`);
          process.exit(1);
        }
      } else if (choice === '3') {
        const newMsg = await rl.question('\nEnter new commit message: ');
        if (newMsg.trim()) {
          currentMessage = newMsg.trim();
          console.log(`\n📝 Updated Commit Message: "${currentMessage}"\n`);
        } else {
          console.log('\n⚠️ Message cannot be empty.\n');
        }
      } else if (choice === '4' || choice.toLowerCase() === 'q') {
        rl.close();
        done = true;
        logger.info('Commit aborted.');
      } else {
        console.log('\n❌ Invalid choice. Please select 1, 2, 3, or 4.\n');
      }
    }
  });

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND: init
// ══════════════════════════════════════════════════════════════════════════════
program
  .command('init')
  .description(`Create a default ${CONFIG_FILENAME} in the current directory`)
  .option('--force', 'Overwrite existing config file')
  .action((opts) => {
    const configPath = path.join(process.cwd(), CONFIG_FILENAME);

    if (fs.existsSync(configPath) && !opts.force) {
      logger.warn(`${CONFIG_FILENAME} already exists. Use --force to overwrite.`);
      process.exit(0);
    }

    fs.writeFileSync(configPath, defaultConfigJson(), 'utf8');
    logger.success(`Created ${configPath}`);
    console.log(`
  📄  Next steps:
      1. Edit ${CONFIG_FILENAME} to set your branch, pushMode, Gemini API key, etc.
      2. Set your API key:  export GEMINI_API_KEY="your-key-here"
      3. Start watching:    auto-git-sync start
`);
  });

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND: model
// ══════════════════════════════════════════════════════════════════════════════
program
  .command('model')
  .description('Show Gemini model information')
  .option('--show-version', 'Print the current configured Gemini model name and version')
  .option('--list',         'List all available Gemini models')
  .action((opts) => {
    if (opts.list) {
      listModels();
      return;
    }

    // --show-version or bare `model`
    const config = loadConfig(process.cwd(), {});
    printModelVersion(config);

    if (!opts.showVersion && !opts.list) {
      // Bare `model` — show both
      listModels();
    }
  });

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND: install
// ══════════════════════════════════════════════════════════════════════════════
program
  .command('install')
  .description('Print installation instructions and useful commands')
  .action(() => {
    console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║              auto-git-sync — Install & Usage                 ║
  ╚══════════════════════════════════════════════════════════════╝

  ─── Install globally (recommended) ─────────────────────────────
    npm install -g auto-git-sync

  ─── Run without installing (npx) ────────────────────────────────
    npx auto-git-sync start

  ─── Local dev install ───────────────────────────────────────────
    npm install --save-dev auto-git-sync

  ─── Version check ───────────────────────────────────────────────
    auto-git-sync --version
    auto-git-sync -v

  ─── Gemini model check ──────────────────────────────────────────
    auto-git-sync model --version
    auto-git-sync model --list

  ─── Set up Gemini API key ───────────────────────────────────────
    export GEMINI_API_KEY="your-key-here"          # macOS/Linux
    set GEMINI_API_KEY=your-key-here               # Windows CMD
    $env:GEMINI_API_KEY="your-key-here"            # Windows PowerShell

    Get a free key at: https://aistudio.google.com/apikey

  ─── Common usage ────────────────────────────────────────────────
    auto-git-sync init                # create .autogitsyncrc.json
    auto-git-sync start               # start watching
    auto-git-sync start --dry-run     # preview without committing
    auto-git-sync start --push-mode manual   # commit-only, no push
    auto-git-sync start --verbose     # full debug output
    auto-git-sync start --no-secret-scan     # ⚠️ disable secret check

  ─── Version: ${pkg.version.padEnd(51)}─
`);
  });

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND: status (bonus)
// ══════════════════════════════════════════════════════════════════════════════
program
  .command('status')
  .description('Show current configuration that would be used')
  .option('--api-key <key>', 'Gemini API key')
  .action((opts) => {
    const config = loadConfig(process.cwd(), { geminiApiKey: opts.apiKey });
    console.log('\n  Current auto-git-sync configuration:\n');
    const display = { ...config };
    if (display.geminiApiKey) {
      display.geminiApiKey = display.geminiApiKey.slice(0, 8) + '…(redacted)';
    }
    console.log(JSON.stringify(display, null, 4));
    console.log();
  });

// ══════════════════════════════════════════════════════════════════════════════
// Parse & run
// ══════════════════════════════════════════════════════════════════════════════
program.parse(process.argv);

// Show help if no command given
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
