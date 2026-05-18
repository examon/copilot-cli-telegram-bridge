import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../extension.mjs', import.meta.url), 'utf8');

test('bridge defines health.json path and stale watchdog constants', () => {
  assert.match(src, /function botHealthPath\(name\)/);
  assert.match(src, /PROMPT_STALE_AFTER_MS\s*=\s*15 \* 60 \* 1000/);
  assert.match(src, /MAX_TYPING_SESSION_MS\s*=\s*30 \* 60 \* 1000/);
});

test('inbound prompts start and clear an active prompt lifecycle', () => {
  assert.match(src, /function startActivePrompt\(chatId, messageId/);
  assert.match(src, /function clearActivePrompt\(reason = "completed"\)/);
  assert.match(src, /startActivePrompt\(chatId, message\.message_id/);
  assert.match(src, /clearActivePrompt\("assistant-message"\)/);
  assert.match(src, /clearActivePrompt\("session-idle"\)/);
  assert.match(src, /clearActivePrompt\("session-error"\)/);
});

test('watchdog stops typing and reports a stalled Copilot session', () => {
  assert.match(src, /function ensurePromptWatchdog\(\)/);
  assert.match(src, /function checkPromptWatchdog\(\)/);
  assert.match(src, /Copilot appears stuck/);
  assert.match(src, /stopTyping\(\)/);
});

test('status includes bridge health fields', () => {
  assert.match(src, /function buildHealthSnapshot/);
  assert.match(src, /Health:/);
  assert.match(src, /Last Copilot event:/);
  assert.match(src, /Likely state:/);
});

test('connect and release write honest health states', () => {
  assert.doesNotMatch(src, /lastToolEventAt = null;\s*writeHealthSnapshot\("connected"\);\s*access =/);
  assert.match(src, /connected = true;\s*writeHealthSnapshot\("connected"\);/);
  assert.match(src, /connected = false;[\s\S]*writeHealthSnapshot\(`released-\$\{reason\}`\);[\s\S]*currentBotName = null;/);
});

test('non-response paths clear active prompt and typing state', () => {
  assert.match(src, /catch \(err\) \{\s*clearActivePrompt\("attachment-error"\);\s*stopTyping\(\);/);
  assert.match(src, /clearActivePrompt\("unsupported-message"\);\s*stopTyping\(\);[\s\S]*await enqueue\(\(\) => sendMessage\(chatId, "Unsupported message type/);
  assert.match(src, /sess\.on\("session\.error"[\s\S]*clearActivePrompt\("session-error"\);\s*stopTyping\(\);/);
});

test('child assistant events still count as Copilot activity without clearing prompt', () => {
  assert.match(src, /sess\.on\("assistant\.message", async \(event\) => \{\s*if \(!connected\) return;\s*recordCopilotEvent\("assistant\.message"\);\s*if \(event\.data\.parentToolCallId\) return;/);
  assert.match(src, /sess\.on\("assistant\.message_delta", \(event\) => \{\s*if \(!connected\) return;\s*recordCopilotEvent\("assistant\.message_delta"\);\s*if \(event\.data\.parentToolCallId\) return;/);
});
