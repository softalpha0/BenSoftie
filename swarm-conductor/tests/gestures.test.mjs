// Run with: npm test (from swarm-conductor/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGesture } from '../gestures.js';
import { DEMO_GESTURES } from '../demo-gestures.js';

for (const gesture of Object.keys(DEMO_GESTURES)) {
  test(`recognises ${gesture}`, () => {
    for (const size of [0.12, 0.09, 1]) {
      for (const direction of [Math.PI / 2, Math.PI / 3, 2 * Math.PI / 3]) {
        const pts = DEMO_GESTURES[gesture]({ size, direction, origin: { x: 0.3, y: -0.2, z: 0.1 } });
        assert.equal(readGesture(pts).gesture, gesture, `size ${size}, direction ${direction.toFixed(2)}`);
      }
    }
  });
}

test('point aims along the index finger', () => {
  const { aim } = readGesture(DEMO_GESTURES.point({ direction: 0 }));
  assert.ok(aim.x > 0.95, `aim ${JSON.stringify(aim)}`);
});
