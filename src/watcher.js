// src/watcher.js — chokidar file watcher with debounce and push strategy

import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

import { logger } from './logger.js';
import { scanFiles } from './secretScan.js';
import { getDiff, addAndCommit, pushToRemote, hasChanges } from './git.js';
import { generateCommitMessage, fallbackMessage } from './gemini.js';

/** Events tracked per debounce window */
const TRACKED_EVENTS = new Set(['add', 'change', 'unlink', 'addDir', 'unlinkDir']);

/**
 * Start the file watcher.
 *
 * @param {object} config - merged config object
 * @returns {{ stop: () => Promise<void> }} - control handle
 */
export async function startWatcher(config) {
  const {
    watchPath,
    debounceMs,
    ignorePatterns,
    secretScan,
    pushMode,
    pushIntervalMinutes,
    branch,
    dryRun,
    geminiApiKey,
  } = config;

  logger.banner(`auto-git-sync v${getVersion()} — Watching ${watchPath}`);
  logger.info(`Push mode    : ${pushMode}`);
  logger.info(`Debounce     : ${debounceMs}ms`);
  logger.info(`Branch       : ${branch}`);
  logger.info(`Secret scan  : ${secretScan ? 'enabled' : 'DISABLED ⚠️'}`);
  logger.info(`Gemini AI    : ${geminiApiKey ? `enabled (${config.geminiModel})` : 'disabled (no API key)'}`);
  if (dryRun) logger.warn('DRY-RUN mode — no actual commits or pushes will occur');
  logger.divider();

  // ── Build ignore filter ────────────────────────────────────────────────────
  const ig = ignore().add(['.git', 'node_modules', ...ignorePatterns]);

  // Load .gitignore if present
  const gitignorePath = path.join(watchPath, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    ig.add(gitignoreContent);
    logger.debug('Loaded .gitignore rules');
  }

  function isIgnored(filePath) {
    const rel = path.relative(watchPath, filePath).replace(/\\/g, '/');
    return ig.ignores(rel);
  }

  // ── Debounced change buffer ────────────────────────────────────────────────
  const changedFiles = new Set();
  let debounceTimer = null;

  function scheduleFlush() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => flush(), debounceMs);
  }

  // ── Flush: run secret scan → Gemini → git add/commit/push ─────────────────
  async function flush() {
    const files = [...changedFiles];
    changedFiles.clear();

    if (files.length === 0) return;

    logger.info(`📁 Changes detected (${files.length} file${files.length !== 1 ? 's' : ''})`);
    for (const f of files) {
      logger.debug(`  • ${path.relative(watchPath, f)}`);
    }

    // ── Secret scan ──────────────────────────────────────────────────────────
    let safeFiles = files;
    if (secretScan) {
      const result = scanFiles(files, config);
      safeFiles = result.safeFiles;

      if (result.skippedFiles.length > 0) {
        logger.warn(
          `🔐 Skipped ${result.skippedFiles.length} file(s) due to secret scan:`
        );
        for (const { file, reason } of result.skippedFiles) {
          logger.warn(`   ✖ ${path.basename(file)}: ${reason}`);
        }
      }

      if (safeFiles.length === 0) {
        logger.warn('All changed files were skipped — nothing to commit');
        return;
      }
    }

    // ── Check if there are actual git changes ────────────────────────────────
    const hasGitChanges = await hasChanges(watchPath);
    if (!hasGitChanges) {
      logger.debug('No git changes detected (possibly a no-op save) — skipping commit');
      return;
    }

    // ── Generate commit message via Gemini or template ───────────────────────
    let commitMessage;
    if (config.commitMessageTemplate) {
      commitMessage = applyTemplate(config.commitMessageTemplate, safeFiles);
    } else {
      const diff = await getDiff(watchPath, safeFiles);
      commitMessage = await generateCommitMessage(diff, config, safeFiles);
    }

    // ── git add + commit ─────────────────────────────────────────────────────
    try {
      const sha = await addAndCommit(watchPath, safeFiles, commitMessage, dryRun);
      if (!dryRun) {
        logger.success(`📝 Committed [${sha.slice(0, 7)}] ${commitMessage}`);
      }
    } catch (err) {
      logger.error(`Commit failed: ${err.message}`);
      return;
    }

    // ── Push (if pushMode === 'immediate') ───────────────────────────────────
    if (pushMode === 'immediate') {
      try {
        await pushToRemote(watchPath, branch, dryRun);
      } catch (err) {
        logger.error(`Push failed: ${err.message}`);
      }
    } else if (pushMode === 'manual') {
      logger.info(`Manual push mode — run: git push origin ${branch}`);
    }
    // 'interval' mode is handled by the interval below
  }

  // ── chokidar watcher ──────────────────────────────────────────────────────
  const watcher = chokidar.watch(watchPath, {
    ignored: (filePath) => {
      // chokidar calls this for directories too
      const rel = path.relative(watchPath, filePath).replace(/\\/g, '/');
      if (!rel) return false; // don't ignore the root itself
      return isIgnored(filePath);
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  for (const event of TRACKED_EVENTS) {
    watcher.on(event, (filePath) => {
      if (isIgnored(filePath)) return;
      changedFiles.add(filePath);
      logger.debug(`[${event}] ${path.relative(watchPath, filePath)}`);
      scheduleFlush();
    });
  }

  watcher.on('error', (err) => {
    logger.error(`Watcher error: ${err.message}`);
  });

  watcher.on('ready', () => {
    logger.info('👀 Watching for file changes… (Ctrl+C to stop)\n');
  });

  // ── Interval push ─────────────────────────────────────────────────────────
  let intervalHandle = null;
  if (pushMode === 'interval') {
    const intervalMs = pushIntervalMinutes * 60 * 1000;
    logger.info(`Interval push every ${pushIntervalMinutes} minute(s)`);
    intervalHandle = setInterval(async () => {
      try {
        const has = await hasChanges(watchPath);
        if (has) {
          logger.info(`⏱ Interval push — pushing to origin/${branch}…`);
          await pushToRemote(watchPath, branch, dryRun);
        } else {
          logger.debug('Interval tick — no changes to push');
        }
      } catch (err) {
        logger.error(`Interval push failed: ${err.message}`);
      }
    }, intervalMs);
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function stop() {
    logger.info('Stopping watcher…');
    if (debounceTimer) clearTimeout(debounceTimer);
    if (intervalHandle) clearInterval(intervalHandle);
    await watcher.close();
    logger.info('Watcher stopped.');
  }

  return { stop };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyTemplate(template, files) {
  const dateStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const count = files.length;
  return template
    .replace('{count}', String(count))
    .replace('{files}', files.map((f) => path.basename(f)).join(', '))
    .replace('{date}', dateStr);
}

function getVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}
