// src/secretScan.js — Pre-commit secret & sensitive-file safety check

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

// ─── Filename patterns ────────────────────────────────────────────────────────

const SENSITIVE_FILENAME_PATTERNS = [
  /^\.env$/i,
  /^\.env\..+$/i,          // .env.local, .env.production, etc.
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa/i,              // id_rsa, id_rsa.pub
  /^credentials\.json$/i,
  /^secrets?\./i,          // secret.json, secrets.yaml
  /^auth\.json$/i,
  /^service[-_]?account/i, // service-account.json
  /\.pfx$/i,
  /\.p12$/i,
];

// ─── Content patterns ─────────────────────────────────────────────────────────

const SENSITIVE_CONTENT_PATTERNS = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: 'Private Key block',
    pattern: /-----BEGIN\s[\w\s]*PRIVATE KEY-----/,
  },
  {
    name: 'Generic API key assignment',
    // Matches: api_key="LONGVALUE", API_KEY=LONGVALUE, apiKey: "LONGVALUE" (≥20 chars)
    pattern: /(?:api[_\-]?key|apikey|secret[_\-]?key|access[_\-]?token|auth[_\-]?token)\s*[=:]\s*["']?([A-Za-z0-9\/+_\-]{20,})["']?/i,
  },
  {
    name: 'Generic password assignment',
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']([^"'\s]{8,})["']/i,
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[A-Za-z0-9]{36}/,
  },
  {
    name: 'GitHub OAuth Token',
    pattern: /gho_[A-Za-z0-9]{36}/,
  },
  {
    name: 'Slack token',
    pattern: /xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-f0-9]{32}/i,
  },
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z\-_]{35}/,
  },
  {
    name: 'Stripe secret key',
    pattern: /sk_live_[0-9a-zA-Z]{24}/,
  },
  {
    name: 'Generic Bearer token',
    pattern: /bearer\s+[A-Za-z0-9\-_]{20,}/i,
  },
];

// Binary-looking extensions — skip content scan, warn on filename only
const BINARY_EXTENSIONS = new Set([
  '.pem', '.key', '.p12', '.pfx', '.der', '.crt', '.cer',
  '.bin', '.exe', '.dll', '.so', '.dylib',
]);

// Max bytes to read for content scan (avoid scanning giant files)
const MAX_SCAN_BYTES = 512 * 1024; // 512 KB

/**
 * Scan an array of file paths for secrets/sensitive content.
 *
 * @param {string[]} files         - absolute or cwd-relative file paths
 * @param {object}   config        - merged config object
 * @returns {{ safeFiles: string[], skippedFiles: { file, reason }[] }}
 */
export function scanFiles(files, config = {}) {
  const allowlist = buildAllowlist(config.allowSecretPatterns || []);
  const safeFiles = [];
  const skippedFiles = [];

  for (const file of files) {
    const violation = checkFile(file, allowlist);
    if (violation) {
      skippedFiles.push({ file, reason: violation });
      logger.warn(
        `🔐 SECRET SCAN — Skipping "${path.basename(file)}" — ${violation}`
      );
    } else {
      safeFiles.push(file);
    }
  }

  return { safeFiles, skippedFiles };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildAllowlist(patterns) {
  return patterns.map((p) => {
    try {
      return new RegExp(p);
    } catch {
      logger.warn(`Invalid allowSecretPatterns entry (not a valid regex): ${p}`);
      return null;
    }
  }).filter(Boolean);
}

function checkFile(filePath, allowlist) {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // ── 1. Filename check ──
  for (const pattern of SENSITIVE_FILENAME_PATTERNS) {
    if (pattern.test(basename)) {
      const reason = `Sensitive filename matched pattern ${pattern}`;
      if (isAllowlisted(basename, allowlist)) {
        logger.debug(`Allowlisted sensitive filename: ${basename}`);
        break;
      }
      return reason;
    }
  }

  // ── 2. Content check (text files only) ──
  if (BINARY_EXTENSIONS.has(ext)) return null; // already warned via filename

  let content;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    // Read only up to MAX_SCAN_BYTES
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(stat.size, MAX_SCAN_BYTES));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    content = buf.toString('utf8');
  } catch {
    // File might be deleted or unreadable by the time we scan — skip
    return null;
  }

  for (const { name, pattern } of SENSITIVE_CONTENT_PATTERNS) {
    const match = pattern.exec(content);
    if (match) {
      const snippet = match[0].slice(0, 40).replace(/\n/g, '\\n');
      if (isAllowlisted(snippet, allowlist)) {
        logger.debug(`Allowlisted content pattern "${name}" in ${basename}`);
        continue;
      }
      return `Content matched "${name}" (near: ${snippet}…)`;
    }
  }

  return null;
}

function isAllowlisted(value, allowlist) {
  return allowlist.some((re) => re.test(value));
}
