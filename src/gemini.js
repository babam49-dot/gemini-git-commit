// src/gemini.js — AI integration manager for Gemini & OpenAI commit message generation

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger.js';
import { generateOpenAICommitMessage, AVAILABLE_OPENAI_MODELS } from './openai.js';

// ─── Available Gemini models ─────────────────────────────────────────────────
export const GEMINI_MODELS = [
  // ── Gemini 3.x family (latest / frontier) ──────────────────────────────────
  {
    id: 'gemini-3.5-flash',
    provider: 'gemini',
    description: '⚡ Latest & fastest — best for agentic / coding tasks (default)',
    default: true,
  },
  {
    id: 'gemini-3.1-pro',
    provider: 'gemini',
    description: '🧠 Most capable — complex reasoning, long context',
    default: false,
  },
  {
    id: 'gemini-3.1-flash',
    provider: 'gemini',
    description: 'Fast 3.1 variant — balanced speed & intelligence',
    default: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'gemini',
    description: 'Lightest 3.x model — lowest latency, high volume',
    default: false,
  },
  // ── Gemini 2.5 family (stable / production) ────────────────────────────────
  {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    description: 'Stable flagship — proven for production environments',
    default: false,
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    description: 'Stable fast variant — reliable & cost-effective',
    default: false,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    description: 'Lightest 2.5 model',
    default: false,
  },
  // ── Gemini 2.0 family (legacy) ─────────────────────────────────────────────
  {
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    description: 'Previous generation flash (legacy)',
    default: false,
  },
  {
    id: 'gemini-2.0-flash-lite',
    provider: 'gemini',
    description: 'Lightest legacy variant',
    default: false,
  },
];

// Combine all supported models (Gemini + OpenAI)
export const AVAILABLE_MODELS = [
  ...GEMINI_MODELS,
  ...AVAILABLE_OPENAI_MODELS,
];

export const SYSTEM_PROMPT = `You are a senior software engineer writing git commit messages.
Given a unified diff of file changes, produce a single concise and highly descriptive commit message summarizing the exact change as if written directly by the developer themself.

Rules:
- Strictly ignore and do NOT use any emojis, symbols, or emoji shortcodes (e.g. do NOT output "✨", "🐛", ":sparkles:", etc.)
- Do NOT use commit type prefixes, labels, or tags (e.g. do NOT output "feat:", "fix:", "chore:", etc.)
- Write in a natural, self-written human developer style
- Start with a capital letter and write a clear, natural English sentence/phrase
- Be specific and descriptive of what was changed and why (e.g. "Bypass local CORS errors in app.js contact form by mocking API responses" or "Reduce mobile hero name size to 8.5vw to prevent Y clipping")
- Keep the message concise (aim for under 72 characters) but prioritize clarity and descriptiveness
- Do NOT add a body, bullet points, markdown formatting, or extra explanation — output ONLY the raw commit message line
- Do NOT include quotes around the message`;

/**
 * Strip emojis, emoji shortcodes, conventional commit prefixes, and surrounding quotes.
 * Ensures the commit message looks natural, clean, and self-written.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeCommitMessage(text) {
  if (!text) return '';
  let msg = text.split('\n')[0].replace(/^["'`]|["'`]$/g, '').trim();

  // Strip unicode emojis & pictographic symbols
  msg = msg.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');

  // Strip emoji shortcodes like :sparkles:, :bug:, etc.
  msg = msg.replace(/:[a-zA-Z0-9_+-]+:/g, '');

  // Clean leading spaces
  msg = msg.trim();

  // Strip leading conventional commit prefixes like "feat:", "fix:", "chore(ui):", etc.
  msg = msg.replace(/^(feat|fix|chore|docs|style|refactor|perf|test|build|ci)(\([a-zA-Z0-9_-]+\))?:\s*/i, '');

  // Collapse spaces and trim
  msg = msg.replace(/\s+/g, ' ').trim();

  // Ensure first character is uppercase
  if (msg.length > 0) {
    msg = msg.charAt(0).toUpperCase() + msg.slice(1);
  }

  return msg;
}

/**
 * Generate an AI-powered commit message routing to either OpenAI or Gemini.
 *
 * @param {string} diff      - output of \`git diff --staged\` or similar
 * @param {object} config    - merged config
 * @param {string[]} files   - list of changed file paths (used for fallback)
 * @returns {Promise<string>} - commit message
 */
export async function generateCommitMessage(diff, config, files = []) {
  const selectedModel =
    config.model ||
    config.activeModel ||
    config.geminiModel ||
    config.openaiModel ||
    'gemini-3.5-flash';

  const isOpenAI =
    config.aiProvider === 'openai' ||
    selectedModel.startsWith('gpt-') ||
    selectedModel.startsWith('o1') ||
    selectedModel.startsWith('o3');

  if (isOpenAI) {
    return generateOpenAICommitMessage(diff, { ...config, model: selectedModel }, files);
  }

  return generateGeminiCommitMessage(diff, { ...config, model: selectedModel }, files);
}

/**
 * Generate commit message using Gemini API.
 */
export async function generateGeminiCommitMessage(diff, config, files = []) {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  const modelName = config.model || config.geminiModel || 'gemini-3.5-flash';

  // ── Fallback: no API key ──────────────────────────────────────────────
  if (!apiKey) {
    logger.warn(
      '⚠️  No GEMINI_API_KEY set.\n' +
      '      Set it via env var: export GEMINI_API_KEY="AIza..."\n' +
      '      or pass: auto-git-sync start --api-key="AIza..."\n' +
      '      Get a free key at: https://aistudio.google.com/apikey'
    );
    return fallbackMessage(files);
  }

  // ── API key format sanity check ───────────────────────────────────────────
  if (!apiKey.startsWith('AIza') && !apiKey.startsWith('AQ')) {
    logger.warn(
      '⚠️  Your Gemini API key does not look like a valid key.\n' +
      '      Expected format: AIza... or AQ... \n' +
      '      Got format: ' + apiKey.slice(0, 10) + '...\n' +
      '      Get a free key at: https://aistudio.google.com/apikey'
    );
  }

  if (!diff || diff.trim().length === 0) {
    logger.debug('Empty diff — using auto-generated commit message');
    return fallbackMessage(files);
  }

  // ── Truncate very large diffs ─────────────────────────────────────────────
  const MAX_DIFF_CHARS = 30_000;
  const truncatedDiff =
    diff.length > MAX_DIFF_CHARS
      ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[...diff truncated for brevity...]'
      : diff;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    });

    logger.debug(`Calling Gemini (${modelName}) for commit message…`);

    const result = await model.generateContent(
      `Here is the unified diff of the changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``
    );

    const text = result.response.text().trim();
    if (!text) throw new Error('Empty response from Gemini');

    // Sanitise: strip emojis, prefixes, surrounding quotes, and ensure capitalisation
    const message = sanitizeCommitMessage(text);

    logger.debug(`Gemini commit message: "${message}"`);
    return message;
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
      logger.warn(`Gemini API error (network/fetch failed) — check your internet connection`);
    } else if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
      logger.warn(
        `Gemini API error: Invalid or unauthorized API key.\n` +
        `      Your key: ${apiKey.slice(0, 10)}…\n` +
        `      Get a valid key at: https://aistudio.google.com/apikey`
      );
    } else if (msg.includes('404') || msg.includes('not found') || msg.includes('models/')) {
      logger.warn(
        `Gemini API error: Model "${modelName}" not found or not available for your key.\n` +
        `      Run: auto-git-sync model  to view available models.`
      );
    } else {
      logger.warn(`Gemini API error (${msg}) — falling back to auto-generated message`);
    }
    return fallbackMessage(files);
  }
}

/**
 * Fallback commit message when AI is unavailable.
 * Format: "Update filename1, filename2"
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
 * Print version info about the configured AI model.
 */
export function printModelVersion(config) {
  const model = config?.model || config?.geminiModel || config?.openaiModel || 'gemini-3.5-flash';
  const info = AVAILABLE_MODELS.find((m) => m.id === model);
  const isOpenAI = info?.provider === 'openai' || model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3');

  const apiKeySet = isOpenAI
    ? Boolean(config?.openaiApiKey || process.env.OPENAI_API_KEY)
    : Boolean(config?.geminiApiKey || process.env.GEMINI_API_KEY);

  console.log(`\n  Current AI model  : ${model} (${isOpenAI ? 'OpenAI' : 'Gemini'})`);
  if (info) console.log(`  Description       : ${info.description}`);
  console.log(`  Provider          : ${isOpenAI ? 'OpenAI API' : '@google/generative-ai SDK'}`);
  console.log(
    `  API key set       : ${apiKeySet ? '✅ yes' : `❌ no (set ${isOpenAI ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'})`}\n`
  );
}

/**
 * Print a table of all available AI models (Gemini & OpenAI).
 */
export function listModels() {
  console.log('\n  Available AI models:\n');

  console.log('  Google Gemini Models:');
  for (const m of GEMINI_MODELS) {
    const tag = m.default ? ' ← default Gemini' : '';
    console.log(`    ${m.id.padEnd(28)} ${m.description}${tag}`);
  }

  console.log('\n  OpenAI Models:');
  for (const m of AVAILABLE_OPENAI_MODELS) {
    const tag = m.default ? ' ← default OpenAI' : '';
    console.log(`    ${m.id.padEnd(28)} ${m.description}${tag}`);
  }
  console.log();
}
