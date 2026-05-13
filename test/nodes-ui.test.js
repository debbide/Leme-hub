import test from 'node:test';
import assert from 'node:assert/strict';

import { createQrMatrix } from '../public/lib/qr-code.js';
import { copySelectedNodeShareLinks, renderNodeRow } from '../public/lib/nodes-ui.js';

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

test('renderNodeRow includes a QR share action beside copy link', () => {
  const html = renderNodeRow({
    node: {
      id: 'node-1',
      type: 'vmess',
      server: 'example.com',
      port: 443,
      name: 'Example',
      shareLink: 'vmess://one'
    },
    activeNodeId: null,
    groupsData: [],
    nodesData: [],
    escapeHtml: (value) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
  });

  assert.match(html, /class="row-action-btn qr-node-btn"/u);
  assert.match(html, /title="二维码分享"/u);
  assert.match(html, /ph ph-qr-code/u);
});

test('createQrMatrix generates a square QR matrix for proxy links', () => {
  const qr = createQrMatrix('vmess://one');

  assert.equal(qr.size, 21);
  assert.equal(qr.modules.length, qr.size);
  assert.equal(qr.modules.every((row) => row.length === qr.size), true);
  assert.equal(qr.modules[0][0], true);
  assert.equal(qr.modules[6][6], true);
});
