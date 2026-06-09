import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderNodeApplyStatus,
  renderSystemProxyAutoSwitchControls,
  renderSystemProxyNodeOptions,
  updateCoreStatus
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

test('renderSystemProxyAutoSwitchControls updates dashboard auto switch summary', () => {
  const summary = { textContent: '' };
  const detail = { textContent: '' };
  const count = { textContent: '' };

  renderSystemProxyAutoSwitchControls({
    proxyProfile: {
      nodeGroups: [
        { id: 'g1', name: 'Fallback', selectedNodeId: 'n1' },
        { id: 'g2', name: 'Video', selectedNodeId: 'n2' }
      ],
      systemProxyAutoSwitch: {
        enabled: true,
        groupId: 'g2',
        intervalSec: 300,
        nextAt: '2026-06-09T12:00:00.000Z'
      }
    },
    dashAutoSwitchSummary: summary,
    dashAutoSwitchDetail: detail,
    dashNodeGroupCount: count
  });

  assert.equal(summary.textContent, 'Video · 5 分钟');
  assert.match(detail.textContent, /^下次切换：/u);
  assert.equal(count.textContent, '2 组');
});

test('updateCoreStatus fills dashboard summary cards from proxy profile', () => {
  const currentOutlet = { textContent: '' };
  const proxyMode = { textContent: '' };
  const linkSummary = { textContent: '' };
  const linkDetail = { textContent: '' };
  const configSummary = { textContent: '' };
  const configDetail = { textContent: '' };
  const coreStatusIndicator = {
    className: '',
    classList: { add() {} },
    title: ''
  };
  const dashText = { textContent: '', className: '' };
  const dashSwitch = {
    classList: {
      add() {},
      remove() {}
    }
  };
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      getElementById(id) {
        return {
          'master-switch': dashSwitch,
          'master-status-text': dashText
        }[id] || null;
      }
    }
  });

  try {
    updateCoreStatus({
      core: {
        status: 'running',
        systemProxy: { enabled: true },
        proxy: {
          mode: 'global',
          activeNode: { id: 'n1', name: 'Manual' },
          systemDefaultNode: { id: 'n2', name: 'Auto Exit' },
          systemProxyEnabled: true,
          systemProxyAutoSwitch: { enabled: false }
        },
        nodeApply: { state: 'applied', lastAppliedAt: '2026-06-09T12:00:00.000Z' }
      },
      setCurrentCoreState: () => {},
      coreStatusIndicator,
      renderRoutingModeBanner: () => {},
      getCurrentCoreState: () => ({}),
      getUptimeTimer: () => null,
      setUptimeTimer: () => {},
      renderProxyEndpoints: () => {},
      renderSystemProxyAutoSwitchControls: () => {},
      renderNodeApplyStatus: () => {},
      dashCurrentOutlet: currentOutlet,
      dashProxyMode: proxyMode,
      dashLinkSummary: linkSummary,
      dashLinkDetail: linkDetail,
      dashConfigSummary: configSummary,
      dashConfigDetail: configDetail
    });

    assert.equal(currentOutlet.textContent, 'Auto Exit');
    assert.equal(proxyMode.textContent, '全局接管');
    assert.equal(linkSummary.textContent, '系统代理 → Auto Exit');
    assert.match(linkDetail.textContent, /Manual/u);
    assert.match(configSummary.textContent, /^已应用/u);
    assert.equal(configDetail.textContent, '最新节点配置已应用到核心。');
  } finally {
    if (documentDescriptor) {
      Object.defineProperty(globalThis, 'document', documentDescriptor);
    } else {
      delete globalThis.document;
    }
  }
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
