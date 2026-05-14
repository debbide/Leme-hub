import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteNodeRecord, testSingleNode } from '../public/lib/nodes-data.js';

const restoreGlobal = (key, descriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }

  delete globalThis[key];
};

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

test('testSingleNode marks row testing state and passes elapsed time to latency result', async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      querySelector: (selector) => selector === '#test-result-n1' ? {} : null
    }
  });

  const calls = [];
  try {
    await testSingleNode({
      id: 'n1',
      requestJson: async (url, options) => {
        calls.push({ url, options });
        return { latencyMs: 88, core: { status: 'running' } };
      },
      updateCoreStatus: (core) => calls.push({ core }),
      showToast: (message, tone) => calls.push({ message, tone }),
      markLatencyTesting: (id) => calls.push({ mark: id }),
      setNodeTestingActionState: (id, isTesting) => calls.push({ action: id, isTesting }),
      getLatencyTestingElapsed: (id) => {
        calls.push({ elapsedFor: id });
        return 321;
      },
      applyLatencyResult: (result) => calls.push({ result }),
    });
  } finally {
    restoreGlobal('document', documentDescriptor);
  }

  assert.equal(calls[0].mark, 'n1');
  assert.deepEqual(calls.filter((item) => item.action), [
    { action: 'n1', isTesting: true },
    { action: 'n1', isTesting: false }
  ]);
  assert.equal(calls.find((item) => item.result)?.result.elapsedMs, 321);
  assert.equal(calls.find((item) => item.result)?.result.latencyMs, 88);
});
