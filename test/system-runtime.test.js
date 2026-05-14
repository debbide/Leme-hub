import test from 'node:test';
import assert from 'node:assert/strict';

import { renderUwpLoopbackStatus } from '../public/lib/system-runtime.js';
import { requestJson } from '../public/lib/utils.js';

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

test('renderUwpLoopbackStatus shows store login repair progress', () => {
  const statusEl = createElement();
  const desc = createElement();

  renderUwpLoopbackStatus({
    status: { supported: true, exempted: false, exemptedCount: 2, totalCount: 6 },
    uwpLoopbackStatusEl: statusEl,
    uwpLoopbackDesc: desc
  });

  assert.equal(statusEl.textContent, '未修复 2/6');
  assert.match(desc.textContent, /登录链路/u);
});

test('renderUwpLoopbackStatus shows completed store login repair progress', () => {
  const statusEl = createElement();
  const desc = createElement();

  renderUwpLoopbackStatus({
    status: { supported: true, exempted: true, exemptedCount: 6, totalCount: 6 },
    uwpLoopbackStatusEl: statusEl,
    uwpLoopbackDesc: desc
  });

  assert.equal(statusEl.textContent, '已修复 6/6');
  assert.match(desc.textContent, /账号登录组件/u);
});

test('renderUwpLoopbackStatus shows proxy diagnosis failures after UWP repair', () => {
  const statusEl = createElement();
  const desc = createElement();

  renderUwpLoopbackStatus({
    status: { supported: true, exempted: true, exemptedCount: 2, totalCount: 2 },
    systemProxyDiagnosis: {
      ok: false,
      checks: {
        wininet: { ok: true },
        winhttp: { ok: false },
        localProxy: { ok: true }
      }
    },
    uwpLoopbackStatusEl: statusEl,
    uwpLoopbackDesc: desc
  });

  assert.equal(statusEl.textContent, '待验证 2/2');
  assert.match(desc.textContent, /WinHTTP/u);
  assert.match(statusEl.className, /is-warn/u);
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

test('requestJson exposes error response body to callers', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      ok: false,
      error: '修复命令已执行，但系统复查后仍未放行微软商店回环',
      uwpLoopback: { exempted: false }
    })
  });

  await assert.rejects(
    async () => requestJson('/api/system/uwp-loopback/store/enable', { method: 'POST' }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.body.uwpLoopback.exempted, false);
      return true;
    }
  );
});
