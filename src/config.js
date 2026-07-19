// src/config.js — Load, validate, and merge configuration

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export const CONFIG_FILENAME = '.autogitsyncrc.json';

/** Full set of defaults */
export const DEFAULTS = {
  watchPath: '.',
  debounceMs: 4000,
  branch: 'main',
  pushMode: 'immediate',        // 'immediate' | 'interval' | 'manual'
  pushIntervalMinutes: 10,
  ignorePatterns: [],
  commitMessageTemplate: null,  // null = use Gemini / auto-generated
  secretScan: true,
  allowSecretPatterns: [],      // regex strings to allowlist
  dryRun: false,
  verbose: false,
  geminiApiKey: null,           // override GEMINI_API_KEY env var
  geminiModel: 'gemini-3.5-flash',
};

/**
 * Load config from .autogitsyncrc.json in cwd (or a given dir),
 * then merge with CLI-supplied overrides.
 *
 * @param {string} cwd        - directory to search for config file
 * @param {object} cliFlags   - parsed CLI flag overrides
 * @returns {object}          - merged, validated config
 */
export function loadConfig(cwd = process.cwd(), cliFlags = {}) {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  let fileConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(raw);
      logger.debug(`Loaded config from ${configPath}`);
    } catch (err) {
      logger.error(`Failed to parse ${CONFIG_FILENAME}: ${err.message}`);
      process.exit(1);
    }
  } else {
    logger.debug(`No ${CONFIG_FILENAME} found — using defaults + CLI flags`);
  }

  // Merge: defaults < file < cli
  const merged = {
    ...DEFAULTS,
    ...fileConfig,
    ...stripUndefined(cliFlags),
  };

  // Normalise
  merged.debounceMs = Number(merged.debounceMs);
  merged.pushIntervalMinutes = Number(merged.pushIntervalMinutes);
  merged.watchPath = path.resolve(cwd, merged.watchPath);

  // Validate pushMode
  const validModes = ['immediate', 'interval', 'manual'];
  if (!validModes.includes(merged.pushMode)) {
    logger.error(
      `Invalid pushMode "${merged.pushMode}". Must be one of: ${validModes.join(', ')}`
    );
    process.exit(1);
  }

  // API key precedence: flag > config > env
  if (!merged.geminiApiKey) {
    merged.geminiApiKey = process.env.GEMINI_API_KEY || null;
  }

  return merged;
}

/** Return the default config object as formatted JSON */
export function defaultConfigJson() {
  return JSON.stringify(
    {
      watchPath: '.',
      debounceMs: 4000,
      branch: 'main',
      pushMode: 'immediate',
      pushIntervalMinutes: 10,
      ignorePatterns: [],
      commitMessageTemplate: null,
      secretScan: true,
      allowSecretPatterns: [],
      dryRun: false,
      geminiApiKey: null,
      geminiModel: 'gemini-3.5-flash',
    },
    null,
    2
  );
}

/** Strip keys whose value is undefined (avoids overwriting file config with CLI non-values) */
function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null || typeof v === 'boolean')
  );
}
