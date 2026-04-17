import test from 'node:test';
import assert from 'node:assert/strict';

import { copySelectedNodeShareLinks } from '../public/lib/nodes-ui.js';

const restoreGlobal = (key, descriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }

  delete globalThis[key];
};

test('copySelectedNodeShareLinks copies selected links line by line and skips nodes without share links', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const toastCalls = [];
  let copied = null;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        }
      }
    }
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: undefined
  });

  try {
    await copySelectedNodeShareLinks({
      selectedNodeIds: new Set(['node-1', 'node-2', 'node-3']),
      nodesData: [
        { id: 'node-1', shareLink: 'vmess://one' },
        { id: 'node-2', shareLink: null },
        { id: 'node-3', shareLink: 'vless://three' },
      ],
      showToast: (message, tone) => toastCalls.push({ message, tone }),
    });

    assert.equal(copied, 'vmess://one\nvless://three');
    assert.deepEqual(toastCalls, [
      {
        message: '已复制 2 条代理链接，跳过 1 条无分享链接节点',
        tone: 'success',
      }
    ]);
  } finally {
    restoreGlobal('navigator', navigatorDescriptor);
    restoreGlobal('document', documentDescriptor);
  }
});

test('copySelectedNodeShareLinks reports when no selected node has a share link', async () => {
  const toastCalls = [];

  await copySelectedNodeShareLinks({
    selectedNodeIds: new Set(['node-1']),
    nodesData: [{ id: 'node-1', shareLink: null }],
    showToast: (message, tone) => toastCalls.push({ message, tone }),
  });

  assert.deepEqual(toastCalls, [
    {
      message: '所选节点暂无可复制的代理链接',
      tone: 'error',
    }
  ]);
});
