// Fake hands in each pose, in the same 21-point layout as hands.js.
// Used by the tests and by gallery.html, so the characters can be checked
// without a camera or a headset. Units: palm length = 1.

// One finger: knuckle, middle joint, last joint, tip. `angle` is the
// direction the finger points (radians, 0 = right, PI/2 = up) and `curl`
// is how far each joint bends.
function finger(base, angle, lengths, curl) {
  const pts = [base];
  let a = angle, p = base;
  for (const l of lengths) {
    p = { x: p.x + Math.cos(a) * l, y: p.y + Math.sin(a) * l, z: p.z + (curl ? 0.12 * l : 0) };
    pts.push(p);
    a += curl;
  }
  return pts;
}

// Builds a hand pointing in `direction`, with each finger straight or curled.
// spread: angle between neighbouring fingers. thumbGap: how far the thumb is
// from the fingers (the sock puppet's mouth).
export function makeHand({ direction = Math.PI / 2, straight = [true, true, true, true], spread = 0.08, thumbGap = 0.3, origin = { x: 0, y: 0, z: 0 }, size = 1 } = {}) {
  const rot = (x, y) => ({
    x: origin.x + size * (x * Math.cos(direction - Math.PI / 2) - y * Math.sin(direction - Math.PI / 2)),
    y: origin.y + size * (x * Math.sin(direction - Math.PI / 2) + y * Math.cos(direction - Math.PI / 2)),
    z: origin.z,
  });
  // Build pointing up, then rotate. Knuckles across the top of the palm.
  const knuckles = [[-0.33, 0.92], [-0.1, 1], [0.12, 0.96], [0.32, 0.86]];
  const lengths = [[0.42, 0.26, 0.2], [0.46, 0.3, 0.22], [0.42, 0.28, 0.2], [0.33, 0.2, 0.18]];
  const local = [{ x: 0, y: 0, z: 0 }];
  // Thumb leaves from the side of the palm and points along the fingers,
  // further away when the "mouth" is open.
  local.push(...finger({ x: -0.32, y: 0.22, z: 0 }, Math.PI / 2 + 0.35 + thumbGap, [0.35, 0.3, 0.25], 0));
  knuckles.forEach(([x, y], i) => {
    const a = Math.PI / 2 + (1.5 - i) * spread;
    local.push(...finger({ x, y, z: 0 }, a, lengths[i], straight[i] ? 0 : -1.25));
  });
  return local.map((q) => ({ ...rot(q.x, q.y), z: origin.z + size * q.z }));
}

export const DEMO_POSES = {
  // Sideways (pointing left), fingers together, thumb below and a little open.
  dragon: (o) => makeHand({ direction: Math.PI - 0.05, spread: 0.02, thumbGap: 0.25, ...o }),
  // Hanging down, fingers loose.
  octopus: (o) => makeHand({ direction: -Math.PI / 2, spread: 0.16, thumbGap: 0, ...o }),
  // Only index and middle out, pointing down like legs.
  crab: (o) => makeHand({ direction: -Math.PI / 2 + 0.2, straight: [true, true, false, false], spread: 0.18, thumbGap: 0, ...o }),
  // Fingers spread wide and up.
  five: (o) => makeHand({ direction: Math.PI / 2, spread: 0.32, thumbGap: 0.4, ...o }),
  fist: (o) => makeHand({ direction: Math.PI / 2, straight: [false, false, false, false], thumbGap: 0, ...o }),
};
