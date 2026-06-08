import test from 'node:test';
import assert from 'node:assert/strict';

import { bindWindowChromeFallbacks } from '../public/lib/app-init.js';

const restoreGlobal = (key, descriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }

  delete globalThis[key];
};

const createClassList = () => {
  const values = new Set();

  return {
    add(value) {
      values.add(value);
    },
    contains(value) {
      return values.has(value);
    },
    remove(value) {
      values.delete(value);
    },
    toggle(value, force) {
      const shouldAdd = force === undefined ? !values.has(value) : Boolean(force);
      if (shouldAdd) {
        values.add(value);
      } else {
        values.delete(value);
      }
      return shouldAdd;
    }
  };
};

const createButton = () => ({
  attributes: {},
  classList: createClassList(),
  innerHTML: '',
  listeners: {},
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  },
  click() {
    return this.listeners.click?.({
      preventDefault() {},
      stopPropagation() {}
    });
  },
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
});

const createDocument = (elements) => ({
  body: {
    classList: createClassList()
  },
  listeners: {},
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  },
  getElementById(id) {
    return elements[id] || null;
  },
  querySelectorAll() {
    return [];
  }
});

test('bindWindowChromeFallbacks wires Electron window controls', async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const calls = [];
  let maximizeStateListener = null;
  const elements = {
    'titlebar-close': createButton(),
    'titlebar-maximize': createButton(),
    'titlebar-minimize': createButton()
  };
  const documentStub = createDocument(elements);

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentStub
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      lemeDesktopWindow: {
        isAvailable: true,
        close: async () => {
          calls.push('close');
        },
        isMaximized: async () => false,
        minimize: async () => {
          calls.push('minimize');
        },
        onMaximizedChange: (listener) => {
          maximizeStateListener = listener;
          return () => {};
        },
        toggleMaximize: async () => {
          calls.push('toggle-maximize');
          return { isMaximized: true };
        }
      }
    }
  });

  try {
    bindWindowChromeFallbacks({ showToast: () => {} });
    await Promise.resolve();

    assert.equal(documentStub.body.classList.contains('desktop-shell'), true);
    assert.equal(elements['titlebar-maximize'].attributes['aria-label'], 'Maximize window');

    await elements['titlebar-minimize'].click();
    await elements['titlebar-maximize'].click();
    await elements['titlebar-close'].click();

    assert.deepEqual(calls, ['minimize', 'toggle-maximize', 'close']);
    assert.equal(elements['titlebar-maximize'].attributes['aria-label'], 'Restore window');
    assert.equal(elements['titlebar-maximize'].classList.contains('is-maximized'), true);

    maximizeStateListener(false);
    assert.equal(elements['titlebar-maximize'].attributes['aria-label'], 'Maximize window');
    assert.equal(elements['titlebar-maximize'].classList.contains('is-maximized'), false);
  } finally {
    restoreGlobal('document', documentDescriptor);
    restoreGlobal('window', windowDescriptor);
  }
});

test('bindWindowChromeFallbacks keeps browser mode controls hidden', () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const toastCalls = [];
  const elements = {
    'titlebar-close': createButton(),
    'titlebar-maximize': createButton(),
    'titlebar-minimize': createButton()
  };
  const documentStub = createDocument(elements);

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentStub
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {}
  });

  try {
    bindWindowChromeFallbacks({
      showToast: (message, tone) => toastCalls.push({ message, tone })
    });

    assert.equal(documentStub.body.classList.contains('desktop-shell'), false);
    elements['titlebar-close'].click();
    assert.equal(toastCalls.length, 1);
    assert.equal(toastCalls[0].tone, 'info');
  } finally {
    restoreGlobal('document', documentDescriptor);
    restoreGlobal('window', windowDescriptor);
  }
});
