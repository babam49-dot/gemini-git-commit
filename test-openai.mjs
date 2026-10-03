// test-openai.mjs — Test OpenAI & Gemini model selection and generation logic
import { loadConfig } from './src/config.js';
import { generateCommitMessage, listModels } from './src/gemini.js';
import { generateOpenAICommitMessage } from './src/openai.js';

console.log('--- Testing AI Model Listing ---');
listModels();

console.log('\n--- Testing OpenAI Config Resolution ---');
const configOpenAI = loadConfig(process.cwd(), {
  model: 'gpt-4o-mini',
});
console.log('Selected Model:', configOpenAI.model || configOpenAI.openaiModel);

const testDiff = [
  'diff --git a/src/server.js b/src/server.js',
  '--- a/src/server.js',
  '+++ b/src/server.js',
  '@@ -5,0 +5,3 @@',
  '+app.use("/api/v1", apiRouter);',
].join('\n');

console.log('\n--- Testing Fallback behavior when OPENAI_API_KEY is not set ---');
const msg = await generateCommitMessage(testDiff, configOpenAI, ['src/server.js']);
console.log('Resulting message:', msg);

console.log('\n✅ Test executed successfully!');
