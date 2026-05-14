import test from 'node:test';
import assert from 'node:assert/strict';

import { renderUwpLoopbackStatus } from '../public/lib/system-runtime.js';

const createClassList = (owner) => ({
  add(value) {
    owner.className = `${owner.className} ${value}`.trim();
  }
});

const createElement = () => {
  const element = {
    className: '',
    textContent: '',
    disabled: false,
    hidden: false
  };
  element.classList = createClassList(element);
  return element;
};

test('renderUwpLoopbackStatus shows repair action when Microsoft Store is not exempted', () => {
  const statusEl = createElement();
  const desc = createElement();
  const refreshBtn = createElement();
  const enableBtn = createElement();
  const disableBtn = createElement();

  renderUwpLoopbackStatus({
    status: { supported: true, exempted: false },
    uwpLoopbackStatusEl: statusEl,
    uwpLoopbackDesc: desc,
    uwpLoopbackRefreshBtn: refreshBtn,
    uwpLoopbackEnableBtn: enableBtn,
    uwpLoopbackDisableBtn: disableBtn
  });

  assert.equal(statusEl.textContent, '未修复');
  assert.match(statusEl.className, /is-warn/u);
  assert.match(desc.textContent, /本地代理/u);
  assert.equal(refreshBtn.disabled, false);
  assert.equal(enableBtn.hidden, false);
  assert.equal(enableBtn.disabled, false);
  assert.equal(disableBtn.hidden, true);
});

test('renderUwpLoopbackStatus shows revoke action when Microsoft Store is exempted', () => {
  const statusEl = createElement();
  const enableBtn = createElement();
  const disableBtn = createElement();

  renderUwpLoopbackStatus({
    status: { supported: true, exempted: true },
    uwpLoopbackStatusEl: statusEl,
    uwpLoopbackEnableBtn: enableBtn,
    uwpLoopbackDisableBtn: disableBtn
  });

  assert.equal(statusEl.textContent, '已修复');
  assert.match(statusEl.className, /is-ok/u);
  assert.equal(enableBtn.hidden, true);
  assert.equal(disableBtn.hidden, false);
  assert.equal(disableBtn.disabled, false);
});

test('renderUwpLoopbackStatus shows detection errors without enabling repair', () => {
  const statusEl = createElement();
  const desc = createElement();
  const enableBtn = createElement();

  renderUwpLoopbackStatus({
    status: { supported: true, exempted: false, lastError: '需要管理员权限' },
    uwpLoopbackStatusEl: statusEl,
    uwpLoopbackDesc: desc,
    uwpLoopbackEnableBtn: enableBtn
  });

  assert.equal(statusEl.textContent, '检测失败');
  assert.equal(desc.textContent, '需要管理员权限');
  assert.equal(enableBtn.hidden, false);
  assert.equal(enableBtn.disabled, true);
});
