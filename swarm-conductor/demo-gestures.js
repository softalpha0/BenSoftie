// Fake hands for each swarm gesture. Used by the tests and the ?demo preview.
import { makeHand } from '../palm-pals/demo-hands.js';

const shift = (pts, d) => pts.map((q) => ({ x: q.x + d.x, y: q.y + d.y, z: q.z + d.z }));

export const DEMO_GESTURES = {
  gather: (o) => makeHand({ direction: Math.PI / 2, spread: 0.2, thumbGap: 0.4, ...o }),
  point: (o) => makeHand({ straight: [true, false, false, false], thumbGap: 0, ...o }),
  orbit: (o) => makeHand({ straight: [true, true, false, false], spread: 0.15, thumbGap: 0, ...o }),
  hold: (o) => makeHand({ straight: [false, false, false, false], thumbGap: 0, ...o }),
  // Pinch: an open hand with the thumb tip brought onto the index tip.
  carry: (o) => {
    const pts = makeHand({ spread: 0.12, ...o });
    const size = o?.size ?? 1;
    const tip = pts[8];
    pts[4] = { x: tip.x - 0.05 * size, y: tip.y - 0.05 * size, z: tip.z };
    pts[3] = { x: (pts[2].x + pts[4].x) / 2, y: (pts[2].y + pts[4].y) / 2, z: tip.z };
    return pts;
  },
};

// Moves a hand so that its index fingertip lands on `at`.
export function placeTip(pts, at) {
  return shift(pts, { x: at.x - pts[8].x, y: at.y - pts[8].y, z: at.z - pts[8].z });
}
