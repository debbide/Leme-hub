import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createQrMatrix } from '../public/lib/qr-code.js';
import { applyLatencyResult, copySelectedNodeShareLinks, markLatencyTesting, renderNodeRow, resetLatencyPlaceholders, setNodeTestingActionState } from '../public/lib/nodes-ui.js';

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

test('renderNodeRow groups frequent actions and share options clearly', () => {
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

  assert.doesNotMatch(html, /row-action-btn/u);
  assert.doesNotMatch(html, /node-action-more-btn/u);
  assert.match(html, /class="node-row-float-btn node-action-menu-btn"/u);
  assert.match(html, /aria-label="节点操作"/u);
  assert.match(html, /data-menu-panel="row"/u);
  assert.match(html, /class="node-action-menu-title"/u);
  assert.match(html, /节点操作/u);
  assert.match(html, /class="node-table-spacer-cell"/u);
  assert.match(html, /class="node-menu-item test-node-btn"/u);
  assert.match(html, />测试延迟</u);
  assert.match(html, /class="node-menu-item detail-node-btn"/u);
  assert.match(html, />编辑详情</u);
  assert.match(html, /class="node-menu-item share-node-btn"/u);
  assert.match(html, /class="node-menu-item qr-node-btn"/u);
  assert.match(html, /ph ph-qr-code/u);
  assert.match(html, /class="node-menu-item is-danger delete-node-btn"/u);
});

test('latency helpers show testing state, elapsed detail, and reset action buttons', () => {
  const elements = new Map();
  const resultEl = {
    textContent: '',
    className: '',
    title: '',
    dataset: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
    }
  };
  const buttonLabel = { textContent: '测速' };
  const button = {
    disabled: false,
    title: '',
    classList: {
      values: new Set(),
      toggle(value, enabled) {
        if (enabled) this.values.add(value);
        else this.values.delete(value);
      }
    },
    querySelector(selector) {
      return selector === 'span' ? buttonLabel : null;
    }
  };
  elements.set('#test-result-node-1', resultEl);
  elements.set('.test-node-btn[data-id="node-1"]', button);

  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const cssDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      querySelector: (selector) => elements.get(selector) || null,
    }
  });
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    writable: true,
    value: { escape: (value) => value }
  });

  try {
    markLatencyTesting('node-1');
    setNodeTestingActionState('node-1', true);

    assert.equal(resultEl.textContent, '测试中...');
    assert.equal(resultEl.className, 'latency testing');
    assert.equal(button.disabled, true);
    assert.equal(buttonLabel.textContent, '测速中');

    applyLatencyResult({ id: 'node-1', ok: true, latencyMs: 120, elapsedMs: 456 });
    assert.equal(resultEl.textContent, '120ms');
    assert.equal(resultEl.classList.values.has('good'), true);
    assert.equal(resultEl.title, '测试耗时 456 ms');

    resetLatencyPlaceholders(['node-1']);
    assert.equal(resultEl.textContent, '-');
    assert.equal(button.disabled, false);
    assert.equal(buttonLabel.textContent, '测速');
  } finally {
    restoreGlobal('document', documentDescriptor);
    restoreGlobal('CSS', cssDescriptor);
  }
});

test('createQrMatrix generates a square QR matrix for proxy links', () => {
  const qr = createQrMatrix('vmess://one');

  assert.equal(qr.size, 21);
  assert.equal(qr.modules.length, qr.size);
  assert.equal(qr.modules.every((row) => row.length === qr.size), true);
  assert.equal(qr.modules[0][0], true);
  assert.equal(qr.modules[6][6], true);
});

test('node table spacer column hosts floating action buttons', () => {
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const spacerRule = styles.match(/#nodes-list th:nth-child\(6\),\s*#nodes-list td:nth-child\(6\)\s*\{(?<body>[^}]+)\}/u);

  assert.ok(spacerRule);
  assert.doesNotMatch(spacerRule.groups.body, /pointer-events\s*:\s*none/u);
  assert.match(styles, /\.node-row-float-btn\s*\{/u);
  assert.match(styles, /\.node-row:hover \.node-row-float-btn/u);
});
