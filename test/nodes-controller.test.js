import test from 'node:test';
import assert from 'node:assert/strict';

import { renderGroupTabs } from '../public/lib/nodes-controller.js';

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
