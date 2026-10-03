// src/index.js — Programmatic API entry point

export { startWatcher } from './watcher.js';
export { loadConfig, DEFAULTS, CONFIG_FILENAME } from './config.js';
export { scanFiles } from './secretScan.js';
export { generateCommitMessage, fallbackMessage, AVAILABLE_MODELS, GEMINI_MODELS } from './gemini.js';
export { generateOpenAICommitMessage, AVAILABLE_OPENAI_MODELS } from './openai.js';
export { addAndCommit, pushToRemote, getDiff, hasChanges, assertGitRepo, assertRemote, getChangedFiles } from './git.js';
export { logger, setVerbose } from './logger.js';

export const VERSION = '1.0.0';
