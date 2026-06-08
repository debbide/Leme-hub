import test from 'node:test';
import assert from 'node:assert/strict';

import { createToastController, runWithButtonState, setControlBusy } from '../public/lib/ui.js';

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
    }
  };
};

const createElement = (tagName = 'div') => {
  const element = {
    attributes: {},
    children: [],
    className: '',
    classList: createClassList(),
    dataset: {},
    disabled: false,
    innerHTMLValue: '',
    listeners: {},
    parentNode: null,
    removed: false,
    tagName,
    textContent: '',
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    click() {
      return this.listeners.click?.();
    },
    querySelector(selector) {
      if (selector === '.toast-message') return this.messageElement || null;
      if (selector === '.toast-close') return this.closeElement || null;
      return null;
    },
    remove() {
      this.removed = true;
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      }
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };

  Object.defineProperty(element, 'innerHTML', {
    get() {
      return this.innerHTMLValue;
    },
    set(value) {
      this.innerHTMLValue = value;
      if (String(value).includes('toast-message')) {
        this.messageElement = createElement('span');
        this.closeElement = createElement('button');
      }
    }
  });

  return element;
};

test('setControlBusy disables and restores a control', () => {
  const button = createElement('button');
  button.textContent = '保存';

  const restore = setControlBusy(button, '保存中...');

  assert.equal(button.disabled, true);
  assert.equal(button.textContent, '保存中...');
  assert.equal(button.attributes['aria-busy'], 'true');
  assert.equal(button.dataset.busy, 'true');

  restore();

  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '保存');
  assert.equal(button.attributes['aria-busy'], undefined);
  assert.equal(button.dataset.busy, undefined);
});

test('setControlBusy can leave final disabled and text state to renderers', () => {
  const button = createElement('button');
  button.textContent = '刷新';

  const restore = setControlBusy(button, '刷新中...', {
    restoreDisabled: false,
    restoreText: false
  });

  assert.equal(button.disabled, true);
  assert.equal(button.textContent, '刷新中...');

  button.textContent = '后台更新中';
  restore();

  assert.equal(button.disabled, true);
  assert.equal(button.textContent, '后台更新中');
  assert.equal(button.attributes['aria-busy'], undefined);
  assert.equal(button.dataset.busy, undefined);
});

test('runWithButtonState restores controls after async failures', async () => {
  const button = createElement('button');
  button.textContent = '执行';

  await assert.rejects(
    () => runWithButtonState(button, '执行中...', async () => {
      assert.equal(button.disabled, true);
      throw new Error('failed');
    }),
    /failed/u
  );

  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '执行');
});

test('createToastController renders semantic toast content', () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
  const container = createElement('div');

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement
    }
  });
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    value: () => 0
  });

  try {
    const { showToast } = createToastController(container);
    showToast('保存成功', 'success', { durationMs: 0 });

    assert.equal(container.children.length, 1);
    const toast = container.children[0];
    assert.equal(toast.className, 'toast success');
    assert.equal(toast.attributes.role, 'status');
    assert.equal(toast.attributes['aria-live'], 'polite');
    assert.equal(toast.querySelector('.toast-message').textContent, '保存成功');

    toast.querySelector('.toast-close').click();
    assert.equal(toast.classList.contains('hiding'), true);
  } finally {
    restoreGlobal('document', documentDescriptor);
    restoreGlobal('setTimeout', timeoutDescriptor);
  }
});
