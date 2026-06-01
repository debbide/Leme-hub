import test from 'node:test';
import assert from 'node:assert/strict';

import { renderGroupTabs, updateBulkBar } from '../public/lib/nodes-controller.js';

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
  assert.match(html, /group-tab-badge is-error">失败/u);
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
  assert.match(html, />全部<span class="group-tab-count">1<\/span>/u);
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

  assert.match(html, /group-tab-badge is-syncing">刷新中/u);
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
