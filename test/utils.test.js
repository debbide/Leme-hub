import test from 'node:test';
import assert from 'node:assert/strict';

import { copyTextToClipboard } from '../public/lib/utils.js';

const restoreGlobal = (key, descriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }

  delete globalThis[key];
};

test('copyTextToClipboard uses navigator clipboard when available', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let copied = null;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        }
      }
    }
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: undefined
  });

  try {
    await copyTextToClipboard('hello');
    assert.equal(copied, 'hello');
  } finally {
    restoreGlobal('navigator', navigatorDescriptor);
    restoreGlobal('document', documentDescriptor);
  }
});

test('copyTextToClipboard falls back to execCommand when clipboard api is unavailable', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let appendedValue = null;
  let removed = false;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {}
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      body: {
        appendChild: (node) => {
          node.parentNode = {
            removeChild: () => {
              removed = true;
            }
          };
          appendedValue = node.value;
        }
      },
      createElement: () => ({
        value: '',
        style: {},
        setAttribute() {},
        focus() {},
        select() {}
      }),
      execCommand: (command) => command === 'copy'
    }
  });

  try {
    await copyTextToClipboard('fallback');
    assert.equal(appendedValue, 'fallback');
    assert.equal(removed, true);
  } finally {
    restoreGlobal('navigator', navigatorDescriptor);
    restoreGlobal('document', documentDescriptor);
  }
});

test('copyTextToClipboard falls back to execCommand when clipboard api rejects', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let appendedValue = null;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error('blocked');
        }
      }
    }
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      body: {
        appendChild: (node) => {
          appendedValue = node.value;
        }
      },
      createElement: () => ({
        value: '',
        style: {},
        setAttribute() {},
        focus() {},
        select() {},
        remove() {}
      }),
      execCommand: (command) => command === 'copy'
    }
  });

  try {
    await copyTextToClipboard('retry');
    assert.equal(appendedValue, 'retry');
  } finally {
    restoreGlobal('navigator', navigatorDescriptor);
    restoreGlobal('document', documentDescriptor);
  }
});
