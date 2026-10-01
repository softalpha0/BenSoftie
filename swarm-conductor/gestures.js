// Turns a hand (21 points, see ../palm-pals/hands.js) into a swarm command.
// No dependencies, so it can be tested in Node.
import { measure, dist, norm, sub, add, scale, avg, mid, WRIST, THUMB, INDEX, MIDDLE, PINKY } from '../palm-pals/hands.js';

// What each gesture tells the swarm to do.
export const COMMANDS = {
  gather: { label: 'Gather', how: 'Open hand', color: '#f2b53a' },
  point: { label: 'Go there', how: 'Point', color: '#4cd6ff' },
  orbit: { label: 'Orbit', how: 'Two fingers', color: '#7cf29a' },
  carry: { label: 'Carry', how: 'Pinch', color: '#ff7ad9' },
  hold: { label: 'Hold', how: 'Fist', color: '#ff6b6b' },
};

// Returns the gesture (or null between gestures) plus the points the swarm needs.
export function readGesture(p) {
  const m = measure(p);
  const [index, middle, ring, pinky] = m.extended;
  // Pinch: thumb and index tips touching, with the index held out in front.
  // The second check stops a fist (index curled into the palm) counting as a pinch.
  const pinch = dist(p[THUMB[3]], p[INDEX[3]]) / m.palm < 0.35 && dist(p[INDEX[3]], p[WRIST]) > 1.05 * m.palm;

  let gesture = null;
  if (pinch) gesture = 'carry';
  else if (index && !middle && !ring && !pinky) gesture = 'point';
  else if (m.count === 0) gesture = 'hold';
  else if (index && middle && !ring && !pinky) gesture = 'orbit';
  else if (m.count >= 3) gesture = 'gather';

  return {
    gesture,
    palm: m.palm,
    // Point: aim along the index finger.
    tip: p[INDEX[3]],
    aim: norm(sub(p[INDEX[3]], p[INDEX[0]])),
    // Orbit: circle just past the two fingertips.
    orbitCenter: add(mid(p[INDEX[3]], p[MIDDLE[3]]), scale(norm(sub(mid(p[INDEX[3]], p[MIDDLE[3]]), p[WRIST])), 0.8 * m.palm)),
    // Carry: the pinch point.
    pinchAt: mid(p[THUMB[3]], p[INDEX[3]]),
    // Gather: hover above the middle of the palm.
    palmCenter: avg([p[WRIST], p[INDEX[0]], p[PINKY[0]], p[MIDDLE[0]]]),
  };
}
