import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderSystemProxyAutoSwitchControls,
  renderSystemProxyNodeOptions
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
