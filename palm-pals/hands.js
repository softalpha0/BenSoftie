// Hand pose logic shared by webcam mode (MediaPipe) and Quest mode (WebXR).
// Both sources are converted to the same 21-point layout MediaPipe uses:
//   0 wrist · 1-4 thumb · 5-8 index · 9-12 middle · 13-16 ring · 17-20 pinky
// (for each finger: knuckle, middle joint, last joint, tip).
// Points are plain {x, y, z} objects in a Y-up space, so this file has no
// dependencies and can be tested in Node.

export const WRIST = 0;
export const THUMB = [1, 2, 3, 4];
export const INDEX = [5, 6, 7, 8];
export const MIDDLE = [9, 10, 11, 12];
export const RING = [13, 14, 15, 16];
export const PINKY = [17, 18, 19, 20];
export const FINGERS = [INDEX, MIDDLE, RING, PINKY];

// WebXR joint names in the same order as the MediaPipe points above.
// WebXR's "phalanx-proximal" joint sits at the knuckle, which is MediaPipe's MCP.
const XR_FINGER = (f) => [`${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`];
export const XR_JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...XR_FINGER('index-finger'),
  ...XR_FINGER('middle-finger'),
  ...XR_FINGER('ring-finger'),
  ...XR_FINGER('pinky-finger'),
];

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const dist = (a, b) => len(sub(a, b));
export const norm = (a) => { const l = len(a) || 1; return scale(a, 1 / l); };
export const mid = (a, b) => scale(add(a, b), 0.5);
export const avg = (pts) => scale(pts.reduce(add, { x: 0, y: 0, z: 0 }), 1 / pts.length);

// Measurements the poses are built from. All distances are relative to the
// palm length, so they work the same for a hand on a webcam (screen units)
// and a hand in a headset (metres).
export function measure(p) {
  const palm = dist(p[WRIST], p[MIDDLE[0]]) || 1e-6;
  const palmWidth = dist(p[INDEX[0]], p[PINKY[0]]) || 1e-6;
  // A finger counts as straight when its tip is clearly further from the
  // wrist than its middle joint. A curled finger folds the tip back in.
  const extended = FINGERS.map(([, pip, , tip]) => dist(p[WRIST], p[tip]) > 1.05 * dist(p[WRIST], p[pip]));
  return {
    palm,
    extended,
    count: extended.filter(Boolean).length,
    // Which way the hand points, from the wrist toward the middle knuckle.
    pointing: norm(sub(p[MIDDLE[0]], p[WRIST])),
    // How far apart the index and pinky tips are, in palm widths.
    spread: dist(p[INDEX[3]], p[PINKY[3]]) / palmWidth,
    // Gap between the thumb tip and the index/middle tips, in palm lengths.
    // This is the sock puppet's mouth.
    mouth: dist(p[THUMB[3]], mid(p[INDEX[3]], p[MIDDLE[3]])) / palm,
  };
}

// Returns 'fist', 'crab', 'octopus', 'five', 'dragon', or null when the
// hand is between poses (the caller keeps the previous character).
export function classify(m) {
  const [index, middle, ring, pinky] = m.extended;
  if (m.count <= 1) return 'fist';
  if (index && middle && !ring && !pinky) return 'crab';
  if (m.count < 3) return null;
  if (m.pointing.y < -0.45) return 'octopus';
  if (m.spread > 1.6 && m.pointing.y > -0.2) return 'five';
  return 'dragon';
}

// Only switch character after the same pose has been held for a few frames,
// so a hand passing through a pose doesn't flicker between costumes.
export class PoseTracker {
  constructor(holdFrames = 5) {
    this.holdFrames = holdFrames;
    this.pose = 'dragon';
    this.candidate = null;
    this.count = 0;
  }
  update(next) {
    if (next === null || next === this.pose) {
      this.candidate = null;
      this.count = 0;
      return this.pose;
    }
    if (next === this.candidate) this.count += 1;
    else { this.candidate = next; this.count = 1; }
    if (this.count >= this.holdFrames) {
      this.pose = next;
      this.candidate = null;
      this.count = 0;
    }
    return this.pose;
  }
}

// Exponential smoothing. Tracking wobbles a few millimetres; this keeps the
// costume steady without making it lag behind the hand.
export function smooth(prev, next, amount = 0.5) {
  if (!prev) return next.map((q) => ({ ...q }));
  return next.map((q, i) => ({
    x: prev[i].x + (q.x - prev[i].x) * amount,
    y: prev[i].y + (q.y - prev[i].y) * amount,
    z: prev[i].z + (q.z - prev[i].z) * amount,
  }));
}
