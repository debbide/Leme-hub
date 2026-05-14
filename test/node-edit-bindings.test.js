import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fillGeneratedUuid,
  generateUuidV4,
} from '../public/lib/node-edit-bindings.js';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

test('generateUuidV4 creates a valid version 4 UUID without crypto.randomUUID', () => {
  let byte = 0;
  const uuid = generateUuidV4({
    cryptoImpl: {
      getRandomValues(bytes) {
        bytes.forEach((_, index) => {
          bytes[index] = byte;
          byte = (byte + 17) & 0xff;
        });
        return bytes;
      }
    }
  });

  assert.match(uuid, UUID_V4_RE);
});

test('fillGeneratedUuid writes the uuid field and dispatches input events', () => {
  const events = [];
  const field = {
    value: '',
    dispatchEvent(event) {
      events.push(event.type);
    },
    focusCalled: false,
    selectCalled: false,
    focus() {
      this.focusCalled = true;
    },
    select() {
      this.selectCalled = true;
    }
  };

  const uuid = fillGeneratedUuid({
    nodeForm: { elements: { uuid: field } },
    generateUuid: () => '0478303c-d7d2-4156-afba-1ab7e14c47fd'
  });

  assert.equal(uuid, '0478303c-d7d2-4156-afba-1ab7e14c47fd');
  assert.equal(field.value, uuid);
  assert.deepEqual(events, ['input', 'change']);
  assert.equal(field.focusCalled, true);
  assert.equal(field.selectCalled, true);
});
