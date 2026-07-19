// src/index.js — Programmatic API entry point

export { startWatcher } from './watcher.js';
export { loadConfig, DEFAULTS, CONFIG_FILENAME } from './config.js';
export { scanFiles } from './secretScan.js';
export { generateCommitMessage, fallbackMessage, AVAILABLE_MODELS } from './gemini.js';
export { addAndCommit, pushToRemote, getDiff, hasChanges, assertGitRepo, assertRemote } from './git.js';
export { logger, setVerbose } from './logger.js';
