import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteNodeRecord } from '../public/lib/nodes-data.js';

test('deleteNodeRecord uses the shared confirm modal when available', async () => {
  const confirmCalls = [];
  const requestCalls = [];
  let rendered = false;
  let mutationMessage = '';
  let latestNodes = null;

  await deleteNodeRecord({
    id: 'n1',
    nodesData: [{ id: 'n1', name: 'HK 01', server: 'hk.example' }],
    showConfirmModal: async (title, body) => {
      confirmCalls.push({ title, body });
      return true;
    },
    requestJson: async (url, options) => {
      requestCalls.push({ url, options });
      return { nodes: [{ id: 'n2' }] };
    },
    setNodesData: (nodes) => { latestNodes = nodes; },
    renderNodesElement: () => { rendered = true; },
    syncNodeMutationFeedback: (payload, message) => { mutationMessage = message; },
    showInlineMessage: () => {},
    nodesError: {}
  });

  assert.deepEqual(confirmCalls, [
    {
      title: '删除节点 HK 01',
      body: '此操作不可撤销，确认删除这个节点吗？'
    }
  ]);
  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0].url, '/api/nodes');
  assert.equal(JSON.parse(requestCalls[0].options.body).id, 'n1');
  assert.deepEqual(latestNodes, [{ id: 'n2' }]);
  assert.equal(rendered, true);
  assert.equal(mutationMessage, '节点已删除');
});

test('deleteNodeRecord stops when shared confirm modal is cancelled', async () => {
  let requested = false;

  await deleteNodeRecord({
    id: 'n1',
    nodesData: [{ id: 'n1', name: 'HK 01' }],
    showConfirmModal: async () => false,
    requestJson: async () => {
      requested = true;
      return {};
    },
    setNodesData: () => {},
    renderNodesElement: () => {},
    syncNodeMutationFeedback: () => {},
    showInlineMessage: () => {},
    nodesError: {}
  });

  assert.equal(requested, false);
});
