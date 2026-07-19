// src/gemini.js — Gemini AI integration for intelligent commit messages

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger.js';

// ─── Available models (for `auto-git-sync model --list`) ─────────────────────
export const AVAILABLE_MODELS = [
  // ── Gemini 3.x family (latest / frontier) ──────────────────────────────────
  {
    id: 'gemini-3.5-flash',
    description: '⚡ Latest & fastest — best for agentic / coding tasks (default)',
    default: true,
  },
  {
    id: 'gemini-3.1-pro',
    description: '🧠 Most capable — complex reasoning, long context',
    default: false,
  },
  {
    id: 'gemini-3.1-flash',
    description: 'Fast 3.1 variant — balanced speed & intelligence',
    default: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    description: 'Lightest 3.x model — lowest latency, high volume',
    default: false,
  },
  // ── Gemini 2.5 family (stable / production) ────────────────────────────────
  {
    id: 'gemini-2.5-pro',
    description: 'Stable flagship — proven for production environments',
    default: false,
  },
  {
    id: 'gemini-2.5-flash',
    description: 'Stable fast variant — reliable & cost-effective',
    default: false,
  },
  {
    id: 'gemini-2.5-flash-lite',
    description: 'Lightest 2.5 model',
    default: false,
  },
  // ── Gemini 2.0 family (legacy) ─────────────────────────────────────────────
  {
    id: 'gemini-2.0-flash',
    description: 'Previous generation flash (legacy)',
    default: false,
  },
  {
    id: 'gemini-2.0-flash-lite',
    description: 'Lightest legacy variant',
    default: false,
  },
];

const SYSTEM_PROMPT = `You are a senior software engineer writing git commit messages.
Given a unified diff of file changes, produce a single concise and highly descriptive commit message summarizing the exact change.

Rules:
- Do NOT use any emojis, labels, or prefixes (e.g. do NOT output "feat:", "fix:", "✨", etc.)
- Start with a capital letter and write a clear, natural English sentence/phrase
- Be specific and descriptive of what was changed and why (e.g. "Bypass local CORS errors in app.js contact form by mocking API responses" or "Reduce mobile hero name size to 8.5vw to prevent Y clipping")
- Keep the message concise (aim for under 72 characters) but prioritize clarity and descriptiveness
- Do NOT add a body, bullet points, markdown formatting, or extra explanation — output ONLY the raw commit message line
- Do NOT include quotes around the message`;

/**
 * Generate an AI-powered commit message from a unified diff.
 *
 * @param {string} diff      - output of `git diff --staged` or similar
 * @param {object} config    - merged config (geminiApiKey, geminiModel)
 * @param {string[]} files   - list of changed file paths (used for fallback)
 * @returns {Promise<string>} - commit message
 */
export async function generateCommitMessage(diff, config, files = []) {
  // ── Fallback: no diff or no API key ────────────────────────────────
  if (!config.geminiApiKey) {
    logger.debug('No GEMINI_API_KEY — using auto-generated commit message');
    return fallbackMessage(files);
  }

  // ── API key format sanity check ───────────────────────────────────────────
  if (!config.geminiApiKey.startsWith('AIza') && !config.geminiApiKey.startsWith('AQ')) {
    logger.warn(
      '⚠️  Your Gemini API key does not look like a valid key.\n' +
      '      Expected format: AIza... or AQ... \n' +
      '      Got format: ' + config.geminiApiKey.slice(0, 10) + '...\n' +
      '      Get a free key at: https://aistudio.google.com/apikey'
    );
  }

  if (!diff || diff.trim().length === 0) {
    logger.debug('Empty diff — using auto-generated commit message');
    return fallbackMessage(files);
  }

  // ── Truncate very large diffs to avoid token limits ───────────────────────
  const MAX_DIFF_CHARS = 30_000;
  const truncatedDiff =
    diff.length > MAX_DIFF_CHARS
      ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[...diff truncated for brevity...]'
      : diff;

  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: config.geminiModel || 'gemini-3.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    logger.debug(
      `Calling Gemini (${config.geminiModel || 'gemini-3.5-flash'}) for commit message…`
    );

    const result = await model.generateContent(
      `Here is the unified diff of the changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``
    );

    const text = result.response.text().trim();
    if (!text) throw new Error('Empty response from Gemini');

    // Sanitise: take only first line, strip surrounding quotes
    const message = text
      .split('\n')[0]
      .replace(/^["']|["']$/g, '')
      .trim();

    logger.debug(`Gemini commit message: "${message}"`);
    return message;
  } catch (err) {
    const msg = err.message || String(err);
    // Give a more actionable error hint
    if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
      logger.warn(`Gemini API error (network/fetch failed) — check your internet connection`);
    } else if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
      logger.warn(
        `Gemini API error: Invalid or unauthorized API key.\n` +
        `      Your key: ${config.geminiApiKey.slice(0, 10)}…\n` +
        `      Get a valid key at: https://aistudio.google.com/apikey`
      );
    } else if (msg.includes('404') || msg.includes('not found') || msg.includes('models/')) {
      logger.warn(
        `Gemini API error: Model "${config.geminiModel}" not found or not available for your key.\n` +
        `      Try: auto-git-sync model --list  to see available models.`
      );
    } else {
      logger.warn(`Gemini API error (${msg}) — falling back to auto-generated message`);
    }
    return fallbackMessage(files);
  }
}

/**
 * Fallback commit message when Gemini is unavailable.
 * Format: "auto-sync: updated N files - YYYY-MM-DD HH:MM"
 */
export function fallbackMessage(files = []) {
  if (files.length === 0) return 'Update project files';

  const names = files.map((f) => f.split(/[/\\]/).pop());
  const uniqueNames = Array.from(new Set(names));

  if (uniqueNames.length <= 3) {
    return `Update ${uniqueNames.join(', ')}`;
  }
  return `Update ${uniqueNames.slice(0, 3).join(', ')} and ${uniqueNames.length - 3} other files`;
}

/**
 * Print version info about the configured Gemini model.
 */
export function printModelVersion(config) {
  const model = config?.geminiModel || 'gemini-2.0-flash';
  const info = AVAILABLE_MODELS.find((m) => m.id === model);
  console.log(`\n  Current Gemini model : ${model}`);
  if (info) console.log(`  Description          : ${info.description}`);
  console.log(`  Source               : @google/generative-ai SDK`);
  console.log(
    `  API key set          : ${config?.geminiApiKey ? '✅ yes' : '❌ no (set GEMINI_API_KEY)'}\n`
  );
}

/**
 * Print a table of all available Gemini models.
 */
export function listModels() {
  console.log('\n  Available Gemini models:\n');
  for (const m of AVAILABLE_MODELS) {
    const tag = m.default ? ' ← default' : '';
    console.log(`    ${m.id.padEnd(28)} ${m.description}${tag}`);
  }
  console.log();
}
