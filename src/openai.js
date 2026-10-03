// src/openai.js — OpenAI API integration for commit message generation

import { logger } from './logger.js';
import { fallbackMessage } from './gemini.js';

export const SYSTEM_PROMPT = `You are a senior software engineer writing git commit messages.
Given a unified diff of file changes, produce a single concise and highly descriptive commit message summarizing the exact change.

Rules:
- Do NOT use any emojis, labels, or prefixes (e.g. do NOT output "feat:", "fix:", "✨", etc.)
- Start with a capital letter and write a clear, natural English sentence/phrase
- Be specific and descriptive of what was changed and why (e.g. "Bypass local CORS errors in app.js contact form by mocking API responses" or "Reduce mobile hero name size to 8.5vw to prevent Y clipping")
- Keep the message concise (aim for under 72 characters) but prioritize clarity and descriptiveness
- Do NOT add a body, bullet points, markdown formatting, or extra explanation — output ONLY the raw commit message line
- Do NOT include quotes around the message`;

export const AVAILABLE_OPENAI_MODELS = [
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    description: '⚡ Fast, lightweight & cost-effective — recommended OpenAI default',
    default: true,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    description: '🧠 Flagship high-intelligence model for complex diffs',
    default: false,
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    description: '🚀 Advanced reasoning model optimized for code changes',
    default: false,
  },
  {
    id: 'o1-mini',
    provider: 'openai',
    description: '🔬 Fast reasoning model for technical & algorithmic changes',
    default: false,
  },
  {
    id: 'gpt-4-turbo',
    provider: 'openai',
    description: '⚙️ High-capacity GPT-4 model with broad knowledge',
    default: false,
  },
  {
    id: 'gpt-3.5-turbo',
    provider: 'openai',
    description: '📜 Legacy GPT-3.5 model',
    default: false,
  },
];

/**
 * Generate an AI-powered commit message using OpenAI API.
 *
 * @param {string} diff      - output of `git diff --staged` or similar
 * @param {object} config    - merged config (openaiApiKey, openaiModel or model)
 * @param {string[]} files   - list of changed file paths
 * @returns {Promise<string>} - commit message
 */
export async function generateOpenAICommitMessage(diff, config, files = []) {
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  const modelName = config.model || config.openaiModel || 'gpt-4o-mini';

  if (!apiKey) {
    logger.warn(
      '⚠️  No OPENAI_API_KEY set.\n' +
      '      Set it via env var: export OPENAI_API_KEY="sk-..."\n' +
      '      or pass: auto-git-sync start --openai-api-key="sk-..."\n' +
      '      Get a key at: https://platform.openai.com/api-keys'
    );
    return fallbackMessage(files);
  }

  if (!apiKey.startsWith('sk-')) {
    logger.warn(
      '⚠️  Your OpenAI API key does not start with "sk-".\n' +
      '      Expected format: sk-... or sk-proj-...\n' +
      '      Got format: ' + apiKey.slice(0, 10) + '...\n' +
      '      Get a valid key at: https://platform.openai.com/api-keys'
    );
  }

  if (!diff || diff.trim().length === 0) {
    logger.debug('Empty diff — using auto-generated commit message');
    return fallbackMessage(files);
  }

  const MAX_DIFF_CHARS = 30_000;
  const truncatedDiff =
    diff.length > MAX_DIFF_CHARS
      ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[...diff truncated for brevity...]'
      : diff;

  try {
    logger.debug(`Calling OpenAI API (${modelName}) for commit message…`);

    const isReasoningModel = modelName.startsWith('o1') || modelName.startsWith('o3');

    const messages = isReasoningModel
      ? [
          {
            role: 'user',
            content: `${SYSTEM_PROMPT}\n\nHere is the unified diff of the changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``,
          },
        ]
      : [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Here is the unified diff of the changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``,
          },
        ];

    const bodyPayload = {
      model: modelName,
      messages,
    };

    if (!isReasoningModel) {
      bodyPayload.temperature = 0.2;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errMessage = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
      throw new Error(errMessage);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content?.trim();

    if (!rawText) throw new Error('Empty response from OpenAI');

    // Sanitise: take first line, strip quotes
    const message = rawText
      .split('\n')[0]
      .replace(/^["']|["']$/g, '')
      .trim();

    logger.debug(`OpenAI commit message: "${message}"`);
    return message;
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
      logger.warn(`OpenAI API error (network/fetch failed) — check internet connection`);
    } else if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
      logger.warn(
        `OpenAI API error: Invalid API key.\n` +
        `      Your key: ${apiKey.slice(0, 10)}…\n` +
        `      Get a valid key at: https://platform.openai.com/api-keys`
      );
    } else if (msg.includes('404') || msg.includes('model_not_found') || msg.includes('does not exist')) {
      logger.warn(
        `OpenAI API error: Model "${modelName}" not found or not permitted for your key.\n` +
        `      Run: auto-git-sync model  to view available models.`
      );
    } else {
      logger.warn(`OpenAI API error (${msg}) — falling back to auto-generated message`);
    }
    return fallbackMessage(files);
  }
}
