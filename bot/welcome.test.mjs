import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeText } from './welcome.mjs';

test('welcome post fits Telegram limits and names the schedule', () => {
  const text = welcomeText();
  assert.ok(text.length <= 4096, `welcome text is ${text.length} chars`);
  assert.ok(text.includes('Thursday'));
  assert.ok(text.includes('09:54 UTC'));
  assert.ok(text.includes('rebate'));
  assert.ok(text.includes('48h'));
});

test('welcome post explains the Incentives tab', () => {
  const text = welcomeText();
  assert.ok(text.includes('Incentives'));
  assert.ok(text.includes('https://lants.eth.limo/#incentives'));
});

test('welcome post mentions the site as the place to claim', () => {
  const text = welcomeText();
  assert.ok(text.includes('lants.eth.limo'));
});
