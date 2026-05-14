import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderNodeApplyStatus,
  renderSystemProxyAutoSwitchControls,
  renderSystemProxyNodeOptions
} from '../public/lib/dashboard-system.js';

const createSelect = () => ({
  innerHTML: '',
  value: '',
  disabled: false
});

test('renderSystemProxyNodeOptions names the actual default node', () => {
  const select = createSelect();

  renderSystemProxyNodeOptions({
    dashActiveNodeSelect: select,
    activeNodeId: '',
    nodes: [
      { id: 'n1', name: 'HK 01', server: 'hk.example' },
      { id: 'n2', name: 'JP 01', server: 'jp.example' }
    ]
  });

  assert.match(select.innerHTML, /<option value="">默认：HK 01<\/option>/u);
  assert.doesNotMatch(select.innerHTML, /默认首个节点/u);
});

test('renderSystemProxyAutoSwitchControls separates system proxy outlet from active node', () => {
  const current = { textContent: '' };
  const next = { textContent: '' };

  renderSystemProxyAutoSwitchControls({
    proxyProfile: {
      activeNode: { id: 'n1', name: 'Manual Node' },
      systemDefaultNode: { id: 'n2', name: 'System Node' },
      systemProxyAutoSwitch: {
        enabled: false,
        intervalSec: 600
      }
    },
    dashSystemAutoSwitchCurrent: current,
    dashSystemAutoSwitchNext: next
  });

  assert.equal(current.textContent, '系统代理出口：System Node · 主节点：Manual Node');
  assert.equal(next.textContent, '下次切换：未启用');
});

test('renderNodeApplyStatus exposes background apply progress and failures', () => {
  const el = {
    className: '',
    classList: {
      values: [],
      add(value) {
        this.values.push(value);
      }
    },
    textContent: '',
    title: ''
  };

  renderNodeApplyStatus({
    dashNodeApplyStatus: el,
    nodeApply: { state: 'applying' }
  });

  assert.equal(el.textContent, '节点配置：正在应用到核心');
  assert.equal(el.classList.values.includes('is-applying'), true);

  renderNodeApplyStatus({
    dashNodeApplyStatus: el,
    nodeApply: { state: 'failed', lastError: 'missing obfs password' }
  });

  assert.equal(el.textContent, '节点配置：应用失败');
  assert.equal(el.classList.values.includes('is-failed'), true);
  assert.match(el.title, /missing obfs password/);
});

test('renderNodeApplyStatus hides node-page status when idle', () => {
  const classes = new Set(['nodes-apply-status']);
  const el = {
    get className() {
      return [...classes].join(' ');
    },
    set className(value) {
      classes.clear();
      String(value).split(/\s+/u).filter(Boolean).forEach((item) => classes.add(item));
    },
    classList: {
      contains(value) {
        return classes.has(value);
      },
      add(value) {
        classes.add(value);
      },
      remove(value) {
        classes.delete(value);
      }
    },
    textContent: '',
    title: ''
  };

  renderNodeApplyStatus({
    dashNodeApplyStatus: el,
    nodeApply: { state: 'idle' }
  });

  assert.equal(classes.has('nodes-apply-status'), true);
  assert.equal(classes.has('hidden'), true);

  renderNodeApplyStatus({
    dashNodeApplyStatus: el,
    nodeApply: { state: 'applying' }
  });

  assert.equal(classes.has('hidden'), false);
  assert.equal(classes.has('is-applying'), true);
});
