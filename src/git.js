// src/git.js — simple-git wrapper for all git operations

import { simpleGit } from 'simple-git';
import path from 'path';
import { logger } from './logger.js';

/**
 * Create a simple-git instance configured for the given directory.
 * @param {string} cwd - absolute path to the git repository root
 */
export function createGit(cwd) {
  return simpleGit({
    baseDir: cwd,
    binary: 'git',
    maxConcurrentProcesses: 1,
    trimmed: false,
  });
}

/**
 * Verify that `cwd` is inside a git repository.
 * @throws if not a git repo
 */
export async function assertGitRepo(cwd) {
  const git = createGit(cwd);
  try {
    const topLevel = await git.revparse(['--show-toplevel']);
    logger.debug(`Git repo root: ${topLevel.trim()}`);
  } catch {
    throw new Error(
      `No git repository found in "${cwd}".\n` +
      `  Run: git init && git remote add origin <your-repo-url>`
    );
  }
}

/**
 * Verify that a remote (origin) exists.
 * @throws if no remote
 */
export async function assertRemote(cwd) {
  const git = createGit(cwd);
  const remotes = await git.getRemotes(true);
  if (remotes.length === 0) {
    throw new Error(
      `No git remote configured.\n` +
      `  Run: git remote add origin https://github.com/<user>/<repo>.git`
    );
  }
  logger.debug(`Remotes: ${remotes.map((r) => r.name).join(', ')}`);
}

/**
 * Get the unified diff of all uncommitted changes (staged + unstaged).
 * Used to send to Gemini for commit message generation.
 *
 * @param {string} cwd
 * @param {string[]} files - specific files to diff (optional)
 * @returns {Promise<string>} unified diff string
 */
export async function getDiff(cwd, files = []) {
  const git = createGit(cwd);
  try {
    // Stage files first so we can get a staged diff
    // (we'll re-stage in addAndCommit — this is read-only staging for diff)
    let diff = '';

    // Unstaged diff
    const unstagedArgs = ['--', ...files];
    diff += await git.diff(unstagedArgs);

    // Diff for new (untracked) files — show them as added
    const status = await git.status();
    const newFiles = files.length > 0
      ? status.not_added.filter((f) => files.some((sf) => sf.includes(f)))
      : status.not_added;

    if (newFiles.length > 0) {
      for (const nf of newFiles.slice(0, 10)) { // limit new-file diffs
        try {
          const content = await git.show([`HEAD:${nf}`]).catch(() => '');
          diff += `\n--- /dev/null\n+++ b/${nf}\n`;
        } catch { /* ignore */ }
      }
      diff += `\n[${newFiles.length} new file(s): ${newFiles.join(', ')}]`;
    }

    return diff || `[${files.length} file(s) changed — no readable diff]`;
  } catch (err) {
    logger.debug(`getDiff error: ${err.message}`);
    return '';
  }
}

/**
 * Stage the specified files and create a commit.
 *
 * @param {string}   cwd
 * @param {string[]} files   - files to stage (pass [] for `git add -A`)
 * @param {string}   message - commit message
 * @param {boolean}  dryRun  - if true, log what would happen but don't commit
 * @returns {Promise<string>} - the commit SHA (or empty string on dry-run)
 */
export async function addAndCommit(cwd, files, message, dryRun = false) {
  const git = createGit(cwd);

  if (dryRun) {
    logger.info(`[DRY-RUN] Would commit ${files.length} file(s): "${message}"`);
    return '';
  }

  try {
    // Stage only the safe files (or all if none specified)
    if (files.length > 0) {
      await git.add(files);
    } else {
      await git.add('-A');
    }
    logger.debug(`Staged ${files.length || 'all'} file(s)`);

    const result = await git.commit(message);
    const sha = result.commit || '(no sha)';
    logger.debug(`Committed ${sha}: "${message}"`);
    return sha;
  } catch (err) {
    throw new Error(`git commit failed: ${err.message}`);
  }
}

/**
 * Push the current branch to origin, with one rebase-retry on rejection.
 *
 * @param {string} cwd
 * @param {string} branch
 * @param {boolean} dryRun
 */
export async function pushToRemote(cwd, branch, dryRun = false) {
  const git = createGit(cwd);

  if (dryRun) {
    logger.info(`[DRY-RUN] Would push branch "${branch}" to origin`);
    return;
  }

  try {
    logger.debug(`Pushing to origin/${branch}…`);
    await git.push('origin', branch);
    logger.success(`✅ Pushed to origin/${branch}`);
  } catch (pushErr) {
    const msg = pushErr.message || '';

    // ── Detect a non-fast-forward rejection ──────────────────────────────
    if (
      msg.includes('rejected') ||
      msg.includes('non-fast-forward') ||
      msg.includes('fetch first')
    ) {
      logger.warn(
        `Push rejected (non-fast-forward). Attempting git pull --rebase…`
      );
      try {
        await git.pull('origin', branch, { '--rebase': 'true' });
        logger.debug('Rebase succeeded — retrying push…');
        await git.push('origin', branch);
        logger.success(`✅ Pushed to origin/${branch} (after rebase)`);
      } catch (rebaseErr) {
        throw new Error(
          `Push failed after rebase attempt.\n` +
          `  Please resolve conflicts manually and push:\n` +
          `  git push origin ${branch}\n\n` +
          `  Details: ${rebaseErr.message}`
        );
      }
    } else if (
      msg.includes('Authentication') ||
      msg.includes('could not read Username') ||
      msg.includes('403')
    ) {
      throw new Error(
        `Push failed — authentication error.\n` +
        `  Ensure your git credentials/SSH key are configured.\n` +
        `  Details: ${msg}`
      );
    } else {
      throw new Error(`Push failed: ${msg}`);
    }
  }
}

/**
 * Check whether there are any staged or unstaged changes.
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
export async function hasChanges(cwd) {
  const git = createGit(cwd);
  const status = await git.status();
  return (
    status.modified.length > 0 ||
    status.not_added.length > 0 ||
    status.deleted.length > 0 ||
    status.created.length > 0 ||
    status.staged.length > 0
  );
}
