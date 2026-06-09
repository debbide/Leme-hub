import test from 'node:test';
import assert from 'node:assert/strict';

import { renderGroupTabs, testAllNodes, updateBulkBar } from '../public/lib/nodes-controller.js';

const createTabsElement = () => ({
  innerHTML: '',
  querySelectorAll: () => []
});

const renderTabsHtml = (overrides = {}) => {
  const groupTabsEl = createTabsElement();
  const state = {
    activeGroupTab: overrides.activeGroupTab ?? null,
    currentGroup: undefined
  };

  renderGroupTabs({
    groupTabsEl,
    nodesData: overrides.nodesData || [],
    groupsData: overrides.groupsData || [],
    subscriptionsData: overrides.subscriptionsData || [],
    groupSortOrder: overrides.groupSortOrder || [],
    activeGroupTab: state.activeGroupTab,
    setActiveGroupTab: (value) => { state.activeGroupTab = value; },
    setCurrentGroup: (value) => { state.currentGroup = value; },
    renderNodesElement: () => {},
    showInputModal: async () => null,
    showConfirmModal: async () => false,
    requestJson: async () => ({}),
    showToast: () => {},
    loadNodes: () => {},
    getSubscriptionForGroup: overrides.getSubscriptionForGroup || (() => null),
    isSubscriptionRefreshing: overrides.isSubscriptionRefreshing || (() => false),
  });

  return { html: groupTabsEl.innerHTML, state };
};

test('renderGroupTabs folds subscription status into compact group tabs', () => {
  const subscription = {
    id: 'sub-1',
    groupName: 'Feed',
    lastStatus: 'error'
  };

  const { html } = renderTabsHtml({
    nodesData: [{ id: 'n1', group: 'Feed' }],
    groupsData: ['Feed'],
    subscriptionsData: [subscription],
    getSubscriptionForGroup: (group) => group === 'Feed' ? subscription : null,
  });

  assert.match(html, /group-tab is-subscription/u);
  assert.match(html, /group-tab-badge is-error" title="失败" aria-label="失败"><i class="ph ph-broadcast"><\/i>/u);
  assert.match(html, /title="订阅分组：Feed，点击查看订阅详情"/u);
  assert.doesNotMatch(html, /group-delete-btn/u);
});

test('renderGroupTabs resets removed active groups and escapes group labels', () => {
  const { html, state } = renderTabsHtml({
    activeGroupTab: 'Removed',
    nodesData: [{ id: 'n1', group: 'Feed <A>' }],
    groupsData: ['Feed <A>'],
  });

  assert.equal(state.activeGroupTab, null);
  assert.equal(state.currentGroup, null);
  assert.match(html, /class="group-tab active" data-key="" title="查看全部节点"/u);
  assert.match(html, /<span class="group-tab-name">全部<\/span><span class="group-tab-count">1<\/span>/u);
  assert.match(html, /Feed &lt;A&gt;/u);
  assert.doesNotMatch(html, /Feed <A>/u);
});

test('renderGroupTabs applies persisted group sort order', () => {
  const { html } = renderTabsHtml({
    nodesData: [
      { id: 'n1', group: 'Alpha' },
      { id: 'n2', group: 'Beta' }
    ],
    groupsData: ['Alpha', 'Beta'],
    groupSortOrder: ['Beta', 'Alpha']
  });

  assert.ok(html.indexOf('>Beta') < html.indexOf('>Alpha'));
});

test('renderGroupTabs marks refreshing subscriptions without expanding the tab content', () => {
  const subscription = {
    id: 'sub-1',
    groupName: 'Feed',
    lastStatus: 'success'
  };

  const { html } = renderTabsHtml({
    nodesData: [{ id: 'n1', group: 'Feed' }],
    groupsData: ['Feed'],
    subscriptionsData: [subscription],
    getSubscriptionForGroup: (group) => group === 'Feed' ? subscription : null,
    isSubscriptionRefreshing: (id) => id === 'sub-1',
  });

  assert.match(html, /group-tab-badge is-syncing" title="刷新中" aria-label="刷新中"><i class="ph ph-broadcast"><\/i>/u);
  assert.doesNotMatch(html, /https?:\/\//u);
});

test('updateBulkBar escapes group menu labels', () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const bar = {
    classList: { add() {}, remove() {} }
  };
  const label = { textContent: '' };
  const trigger = { disabled: false, title: '' };
  const menu = {
    innerHTML: '',
    classList: { remove() {} },
    querySelectorAll: () => []
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      getElementById(id) {
        return {
          'bulk-action-bar': bar,
          'bulk-count-label': label,
          'bulk-move-btn': trigger,
          'bulk-group-menu': menu,
        }[id] || null;
      }
    }
  });

  try {
    updateBulkBar({
      selectedNodeIds: new Set(['n1']),
      groupsData: ['Feed <A>'],
      nodesData: [{ id: 'n1', group: 'Feed <A>' }],
      requestJson: async () => ({}),
      setNodesData: () => {},
      setGroupsData: () => {},
      clearSelectedNodeIds: () => {},
      renderGroupTabs: () => {},
      renderNodesElement: () => {},
      syncNodeMutationFeedback: () => {},
      showToast: () => {},
    });

    assert.match(menu.innerHTML, /Feed &lt;A&gt;/u);
    assert.doesNotMatch(menu.innerHTML, /Feed <A>/u);
  } finally {
    if (documentDescriptor) {
      Object.defineProperty(globalThis, 'document', documentDescriptor);
    } else {
      delete globalThis.document;
    }
  }
});

test('testAllNodes applies streamed latency results as each event arrives', async () => {
  const applied = [];
  const marked = [];
  const actionStates = [];
  const toasts = [];
  const button = { disabled: false, textContent: '' };

  await testAllNodes({
    activeGroupTab: null,
    nodesData: [
      { id: 'n1', name: 'One', server: 'one.example' },
      { id: 'n2', name: 'Two', server: 'two.example' }
    ],
    nodeSearchQuery: '',
    testAllBtn: button,
    requestJson: async () => {
      throw new Error('fallback should not be used');
    },
    requestSseStream: async (url, options, onEvent) => {
      assert.equal(url, '/api/nodes/test-batch-stream');
      assert.deepEqual(JSON.parse(options.body).ids, ['n1', 'n2']);
      await onEvent({ event: 'result', data: { id: 'n1', ok: true, latencyMs: 88, done: 1 } });
      assert.deepEqual(applied.map((item) => item.id), ['n1']);
      assert.deepEqual(marked, ['n1', 'n2']);
      assert.equal(button.textContent, '测试 1/2...');
      await onEvent({ event: 'result', data: { id: 'n2', ok: false, error: 'timeout', done: 2 } });
      await onEvent({ event: 'complete', data: { ok: true, core: { status: 'running' }, autoStarted: true } });
    },
    updateCoreStatus: () => {},
    applyLatencyResult: (result) => applied.push(result),
    resetLatencyPlaceholders: () => {},
    markLatencyTesting: (id) => marked.push(id),
    setNodeTestingActionState: (id, isTesting) => actionStates.push({ id, isTesting }),
    getLatencyTestingElapsed: () => 123,
    showToast: (message, type) => toasts.push({ message, type }),
  });

  assert.deepEqual(applied.map((item) => ({
    id: item.id,
    ok: item.ok,
    latencyMs: item.latencyMs,
    error: item.error,
    elapsedMs: item.elapsedMs,
  })), [
    { id: 'n1', ok: true, latencyMs: 88, error: undefined, elapsedMs: 123 },
    { id: 'n2', ok: false, latencyMs: undefined, error: 'timeout', elapsedMs: 123 }
  ]);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '批量测试');
  assert.deepEqual(actionStates, [
    { id: 'n1', isTesting: true },
    { id: 'n2', isTesting: true },
    { id: 'n1', isTesting: false },
    { id: 'n2', isTesting: false },
    { id: 'n1', isTesting: false },
    { id: 'n2', isTesting: false }
  ]);
  assert.equal(toasts.at(-1).type, 'info');
});
