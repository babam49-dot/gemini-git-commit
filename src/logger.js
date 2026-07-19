// src/logger.js — Timestamped, color-coded console logger

const COLORS = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
};

let verboseEnabled = false;

/** Enable verbose mode globally */
export function setVerbose(enabled) {
  verboseEnabled = !!enabled;
}

/** Format current time as HH:MM:SS */
function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function prefix(level, color) {
  return `${COLORS.dim}[${timestamp()}]${COLORS.reset} ${color}${COLORS.bold}${level}${COLORS.reset}`;
}

export const logger = {
  info(msg, ...args) {
    console.log(`${prefix('INFO ', COLORS.cyan)} ${msg}`, ...args);
  },

  success(msg, ...args) {
    console.log(`${prefix('OK   ', COLORS.green)} ${msg}`, ...args);
  },

  warn(msg, ...args) {
    console.warn(`${prefix('WARN ', COLORS.yellow)} ${msg}`, ...args);
  },

  error(msg, ...args) {
    console.error(`${prefix('ERROR', COLORS.red)} ${msg}`, ...args);
  },

  debug(msg, ...args) {
    if (verboseEnabled) {
      console.log(`${prefix('DEBUG', COLORS.magenta)} ${msg}`, ...args);
    }
  },

  /** Bold header banner */
  banner(msg) {
    const line = '─'.repeat(60);
    console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.white}  ${msg}${COLORS.reset}`);
    console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
  },

  /** Separator */
  divider() {
    console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`);
  },
};
