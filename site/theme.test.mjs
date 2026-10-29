// site/theme.test.mjs - theme switcher: resolveTheme, THEMES shape, applyTheme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardown } from './dom-test-helper.mjs';
import { THEMES, resolveTheme, applyTheme } from './theme.mjs';

test('THEMES: exposes the two dark themes with labels', () => {
  assert.deepEqual(Object.keys(THEMES).sort(), ['ant', 'lants']);
  assert.equal(THEMES.lants.label, 'lANTS');
  assert.equal(THEMES.ant.label, 'ant');
});

test('resolveTheme: defaults to lants for missing input', () => {
  assert.equal(resolveTheme(undefined), 'lants');
  assert.equal(resolveTheme(null), 'lants');
});

test('resolveTheme: defaults to lants for garbage input', () => {
  assert.equal(resolveTheme(''), 'lants');
  assert.equal(resolveTheme('dark'), 'lants');
  assert.equal(resolveTheme('VEXXY'), 'lants');
  assert.equal(resolveTheme(123), 'lants');
});

test('resolveTheme: maps exact names', () => {
  assert.equal(resolveTheme('ant'), 'ant');
  assert.equal(resolveTheme('lants'), 'lants');
});

test('applyTheme: sets data-theme and persists the choice', () => {
  const { document, window } = setupDom();
  try {
    applyTheme('ant');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'ant');
    assert.equal(window.localStorage.getItem('lants.theme'), 'ant');

    applyTheme('garbage');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'lants');
    assert.equal(window.localStorage.getItem('lants.theme'), 'lants');

    applyTheme('lants');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'lants');
    assert.equal(window.localStorage.getItem('lants.theme'), 'lants');
  } finally {
    teardown();
  }
});

console.log('theme_ok=1');
