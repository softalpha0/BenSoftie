// Run with: node --test palm-pals/tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, classify, PoseTracker, XR_JOINTS } from '../hands.js';
import { DEMO_POSES } from '../demo-hands.js';

for (const pose of Object.keys(DEMO_POSES)) {
  test(`recognises the ${pose} pose`, () => {
    assert.equal(classify(measure(DEMO_POSES[pose]())), pose);
  });
}

test('poses do not depend on hand size or position', () => {
  for (const pose of Object.keys(DEMO_POSES)) {
    // Webcam scale (fractions of the screen) and headset scale (metres).
    for (const size of [0.12, 0.09, 3]) {
      const pts = DEMO_POSES[pose]({ size, origin: { x: 0.4, y: -1.2, z: 0.3 } });
      assert.equal(classify(measure(pts)), pose, `${pose} at size ${size}`);
    }
  }
});

test('mouth gets bigger as the thumb opens', () => {
  const closed = measure(DEMO_POSES.dragon({ thumbGap: 0 })).mouth;
  const open = measure(DEMO_POSES.dragon({ thumbGap: 0.7 })).mouth;
  assert.ok(open > closed + 0.3, `open ${open} vs closed ${closed}`);
});

test('tracker waits for a pose to be held before switching', () => {
  const t = new PoseTracker(3);
  assert.equal(t.update('five'), 'dragon');
  assert.equal(t.update('five'), 'dragon');
  assert.equal(t.update('five'), 'five');
  // A single in-between frame doesn't reset the character.
  assert.equal(t.update(null), 'five');
  assert.equal(t.update('crab'), 'five');
});

test('WebXR joints map onto 21 points', () => {
  assert.equal(XR_JOINTS.length, 21);
  assert.equal(new Set(XR_JOINTS).size, 21);
});
