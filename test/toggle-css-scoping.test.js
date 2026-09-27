import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

// Regression guard for the "derailed toggle knob" bug (2026-09-27):
// the settings toggle (.cyber-switch, 52px track / 20px knob / 26px travel)
// and the dashboard toggle (.cyber-toggle, 36px track / 14px knob / 16px travel)
// share the .cyber-slider class name. Any UNPREFIXED .cyber-slider selector
// leaks one component's geometry into the other and the knob visibly jumps
// out of its track.
const collectSliderSelectors = (source) => {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    for (const part of match[1].split(',')) {
      const selector = part.trim();
      if (selector.includes('.cyber-slider')) {
        selectors.push(selector);
      }
    }
  }
  return selectors;
};

test('every .cyber-slider selector is scoped to .cyber-switch or .cyber-toggle', () => {
  const selectors = collectSliderSelectors(css);
  assert.ok(selectors.length > 0, 'expected to find .cyber-slider selectors in styles.css');
  for (const selector of selectors) {
    assert.ok(
      selector.includes('.cyber-switch') || selector.includes('.cyber-toggle'),
      `unscoped .cyber-slider selector leaks across toggle components: "${selector}"`
    );
  }
});

test('both toggle components keep their own slider rules', () => {
  const selectors = collectSliderSelectors(css);
  assert.ok(
    selectors.some((s) => s.includes('.cyber-switch')),
    'settings toggle (.cyber-switch) lost its .cyber-slider rules'
  );
  assert.ok(
    selectors.some((s) => s.includes('.cyber-toggle')),
    'dashboard toggle (.cyber-toggle) lost its .cyber-slider rules'
  );
});
