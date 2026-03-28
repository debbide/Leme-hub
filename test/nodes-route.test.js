import test from 'node:test';
import assert from 'node:assert/strict';

import { assignStableLocalPorts } from '../app/server/services/CoreManager.js';

test('assignStableLocalPorts preserves existing assignments when nodes change', () => {
  const initialNodes = assignStableLocalPorts([
    { id: 'alpha', type: 'socks', server: 'one.example', port: 1080 },
    { id: 'beta', type: 'socks', server: 'two.example', port: 1081 }
  ], 20000);

  assert.equal(initialNodes[0].local_port, 20000);
  assert.equal(initialNodes[1].local_port, 20001);

  const afterDeleteAndAdd = assignStableLocalPorts([
    initialNodes[1],
    { id: 'gamma', type: 'socks', server: 'three.example', port: 1082 }
  ], 20000);

  assert.equal(afterDeleteAndAdd[0].id, 'beta');
  assert.equal(afterDeleteAndAdd[0].local_port, 20001);
  assert.equal(afterDeleteAndAdd[1].id, 'gamma');
  assert.equal(afterDeleteAndAdd[1].local_port, 20000);
});
