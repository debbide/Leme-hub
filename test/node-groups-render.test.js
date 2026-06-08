import test from 'node:test';
import assert from 'node:assert/strict';

import { renderNodeGroups } from '../public/lib/node-groups-render.js';

const createListElement = () => ({
  innerHTML: '',
  querySelectorAll: () => []
});

test('renderNodeGroups keeps compact icon actions for custom groups', () => {
  const nodeGroupsList = createListElement();

  renderNodeGroups({
    nodeGroupsList,
    nodeGroups: [{
      id: 'group-1',
      name: 'Test Group',
      nodeIds: ['node-1'],
      selectedNodeId: 'node-1',
    }],
    groupSortOrder: [],
    routingNodeOptions: [{
      id: 'node-1',
      name: 'Node One',
      server: 'example.com',
      port: 443,
      type: 'vless',
      localPort: 20001,
    }],
    nodeGroupSortByLatency: false,
    nodeGroupSearchQuery: '',
    nodeGroupSearchCount: null,
    nodeGroupExpandedIds: new Set(),
    nodeGroupLatencyMap: new Map(),
    getNodeGroupDisplayName: (group) => group.name,
    getEffectiveGroupNodeIds: (group) => group.nodeIds,
    formatNodeGroupLatencyBadge: () => ({ text: '-', cls: '', title: '' }),
    flagFromCountryCode: () => '',
    escapeHtml: (value) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
    onToggleExpanded: () => {},
    onSelectNode: () => {},
    onCountryOverride: () => {},
    onTestGroup: () => {},
    onToggleSort: () => {},
    onTestSingleNode: () => {},
    onDeleteGroup: () => {},
    onEditGroup: () => {},
  });

  const html = nodeGroupsList.innerHTML;
  assert.match(html, /class="btn-outline node-group-sort-btn/u);
  assert.match(html, /class="btn-outline node-group-test-btn"/u);
  assert.match(html, /class="btn-outline node-group-edit-btn"/u);
  assert.match(html, /class="btn-outline node-group-delete-btn"/u);
  assert.match(html, /node-group-edit-btn[^>]*aria-label="编辑节点组"[^>]*><i class="ph ph-pencil-simple"><\/i><\/button>/u);
  assert.match(html, /node-group-delete-btn[^>]*aria-label="删除节点组"[^>]*><i class="ph ph-trash"><\/i><\/button>/u);
  assert.doesNotMatch(html, />编辑<\/button>/u);
  assert.doesNotMatch(html, />删除<\/button>/u);
});
