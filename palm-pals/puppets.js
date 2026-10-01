// The four felt characters. Each one is rebuilt every frame from the hand
// points, so it follows the hand exactly. Sizes are multiples of the palm
// length, which keeps them right on a webcam and in a headset.
import * as THREE from 'three';
import { WRIST, THUMB, INDEX, MIDDLE, RING, PINKY, FINGERS, avg, mid, sub, add, scale, norm, dist } from './hands.js';

const V = (q) => new THREE.Vector3(q.x, q.y, q.z);
const UP = new THREE.Vector3(0, 1, 0);

// ---------- felt material ----------

function feltTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, size, size);
  // Short random fibres give the fuzzy felt look.
  for (let i = 0; i < 2200; i++) {
    const shade = 200 + Math.floor(Math.random() * 55);
    g.strokeStyle = `rgb(${shade},${shade},${shade})`;
    g.lineWidth = 1;
    const x = Math.random() * size, y = Math.random() * size, a = Math.random() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let FELT_TEX = null;
const materials = new Map();
export function felt(color) {
  if (!materials.has(color)) {
    FELT_TEX ??= feltTexture();
    materials.set(color, new THREE.MeshPhysicalMaterial({
      color, map: FELT_TEX, bumpMap: FELT_TEX, bumpScale: 0.6,
      roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'),
    }));
  }
  return materials.get(color);
}
const plain = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.35 });

const COLORS = {
  dragon: '#4e9a52', dragonDark: '#3a7a3e', horn: '#e8a417', mouth: '#7a1f33',
  octopus: '#8a5bb8', crab: '#e2703a', crabDark: '#b9552a', white: '#fbfbfb',
  teal: '#1f8a83', gold: '#e8a417', smoke: '#cfc8d6',
};

// ---------- building blocks ----------

const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
const CONE = new THREE.ConeGeometry(1, 1, 16);

export class Ball extends THREE.Mesh {
  constructor(material) { super(SPHERE, material); }
  set(pos, r, sy = 1) { this.position.copy(pos); this.scale.set(r, r * sy, r); return this; }
}

// A felt tube between two points with rounded ends.
export class Limb extends THREE.Group {
  constructor(material) {
    super();
    this.tube = new THREE.Mesh(CYL, material);
    this.a = new Ball(material);
    this.b = new Ball(material);
    this.add(this.tube, this.a, this.b);
  }
  set(a, b, ra, rb = ra) {
    const d = new THREE.Vector3().subVectors(b, a);
    const l = d.length();
    this.tube.position.copy(a).addScaledVector(d, 0.5);
    this.tube.quaternion.setFromUnitVectors(UP, d.normalize());
    const r = (ra + rb) / 2;
    this.tube.scale.set(r, l, r);
    this.a.set(a, ra);
    this.b.set(b, rb);
    return this;
  }
}

// A cone whose tip points along `dir`.
class Spike extends THREE.Mesh {
  constructor(material) { super(CONE, material); }
  set(base, dir, r, h) {
    this.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    this.position.copy(base).addScaledVector(dir.clone().normalize(), h / 2);
    this.scale.set(r, h, r);
    return this;
  }
}

// Googly eye that looks at the viewer and blinks now and then.
class Eye extends THREE.Group {
  constructor() {
    super();
    this.white = new Ball(plain(COLORS.white));
    this.pupil = new Ball(plain('#1b1320'));
    this.add(this.white, this.pupil);
    this.blinkOffset = Math.random() * 4;
  }
  set(pos, r, toViewer, t, closed = false) {
    const blinking = closed || ((t + this.blinkOffset) % 4) < 0.12;
    this.white.set(pos, r, blinking ? 0.12 : 1);
    this.pupil.visible = !blinking;
    this.pupil.set(pos.clone().addScaledVector(toViewer, r * 0.62), r * 0.5);
    return this;
  }
}

// ---------- characters ----------
// ctx: { p (Vector3[21]), L (palm length), viewer (Vector3), talk 0..1, t (seconds) }

const toward = (from, viewer) => new THREE.Vector3().subVectors(viewer, from).normalize();

class Character extends THREE.Group {
  constructor(name) { super(); this.name = name; this.visible = false; }
  update() {}
  // Where the "poof" appears when switching to this character.
  center(ctx) { return ctx.p[MIDDLE[0]].clone().lerp(ctx.p[WRIST], 0.5); }
}

// Grumble: sock puppet. Fingers are the top jaw, thumb is the bottom jaw.
class Dragon extends Character {
  constructor() {
    super('Grumble');
    const g = felt(COLORS.dragon), g2 = felt(COLORS.dragonDark);
    this.sleeve = new Limb(g2);
    this.palmBall = new Ball(g2);
    this.upper = new Limb(g);
    this.lower = new Limb(g2);
    this.mouth = new Ball(plain(COLORS.mouth));
    this.eyes = [new Eye(), new Eye()];
    this.horns = [new Spike(felt(COLORS.horn)), new Spike(felt(COLORS.horn))];
    this.teeth = [0, 1, 2].map(() => new Spike(plain(COLORS.white)));
    this.add(this.sleeve, this.palmBall, this.upper, this.lower, this.mouth, ...this.eyes, ...this.horns, ...this.teeth);
    this.smoke = [];
    this.smokeTimer = 0;
  }
  update(ctx, dt, scene) {
    const { p, L, viewer, t } = ctx;
    const knuckles = avg([p[INDEX[0]], p[MIDDLE[0]], p[RING[0]], p[PINKY[0]]]);
    const tips = avg([p[INDEX[3]], p[MIDDLE[3]], p[RING[3]], p[PINKY[3]]]);
    const K = V(knuckles), T = V(tips);
    const jawDir = new THREE.Vector3().subVectors(T, K).normalize();
    const thumbMid = V(mid(p[THUMB[1]], p[THUMB[3]]));
    // "Up" for the head is away from the thumb, square to the jaw.
    const up = new THREE.Vector3().subVectors(K, thumbMid);
    up.addScaledVector(jawDir, -up.dot(jawDir)).normalize();
    const side = new THREE.Vector3().crossVectors(jawDir, up).normalize();
    const back = new THREE.Vector3().subVectors(p[WRIST], K).normalize();
    const look = toward(K, viewer);

    this.sleeve.set(p[WRIST].clone().addScaledVector(back, 0.9 * L), p[WRIST].clone(), 0.42 * L, 0.42 * L);
    this.palmBall.set(p[WRIST].clone().lerp(K, 0.5), 0.5 * L);
    this.upper.set(K, T, 0.42 * L, 0.3 * L);
    this.lower.set(p[THUMB[1]].clone(), p[THUMB[3]].clone(), 0.32 * L, 0.24 * L);

    // Mouth opens with the thumb gap; your voice adds a little extra.
    const open = THREE.MathUtils.clamp(ctx.open * 1.2 + ctx.talk * 0.4, 0, 1);
    const mouthCenter = new THREE.Vector3().addVectors(V(p[THUMB[3]]), T).add(K).multiplyScalar(1 / 3);
    this.mouth.set(mouthCenter, (0.12 + 0.28 * open) * L);

    const eyeBase = K.clone().addScaledVector(jawDir, 0.35 * L).addScaledVector(up, 0.42 * L);
    this.eyes[0].set(eyeBase.clone().addScaledVector(side, 0.2 * L), 0.16 * L, look, t);
    this.eyes[1].set(eyeBase.clone().addScaledVector(side, -0.2 * L), 0.16 * L, look, t);
    const hornBase = K.clone().addScaledVector(jawDir, -0.05 * L).addScaledVector(up, 0.38 * L);
    const hornDir = up.clone().addScaledVector(jawDir, -0.6);
    this.horns[0].set(hornBase.clone().addScaledVector(side, 0.18 * L), hornDir, 0.09 * L, 0.35 * L);
    this.horns[1].set(hornBase.clone().addScaledVector(side, -0.18 * L), hornDir, 0.09 * L, 0.35 * L);
    // Teeth hang from the top jaw toward the thumb.
    this.teeth.forEach((tooth, i) => {
      const base = K.clone().lerp(T, 0.45 + i * 0.18).addScaledVector(up, -0.3 * L);
      tooth.visible = open > 0.25;
      tooth.set(base, up.clone().negate(), 0.06 * L, 0.16 * L);
    });

    // Smoke puffs out of the nose when the mouth is wide open.
    this.smokeTimer -= dt;
    if (open > 0.7 && this.smokeTimer <= 0) {
      this.smokeTimer = 0.12;
      const puff = new Ball(new THREE.MeshStandardMaterial({ color: COLORS.smoke, transparent: true, opacity: 0.8 }));
      puff.userData = { life: 0, pos: T.clone().addScaledVector(jawDir, 0.2 * L).addScaledVector(up, 0.15 * L), L, drift: up.clone().addScaledVector(jawDir, 0.5) };
      scene.add(puff);
      this.smoke.push(puff);
    }
    this.smoke = this.smoke.filter((puff) => {
      const d = puff.userData;
      d.life += dt;
      if (d.life > 1.2) { scene.remove(puff); puff.material.dispose(); return false; }
      d.pos.addScaledVector(d.drift, dt * 1.2 * d.L);
      puff.set(d.pos, (0.08 + d.life * 0.18) * d.L);
      puff.material.opacity = 0.8 * (1 - d.life / 1.2);
      return true;
    });
  }
}

// Chef Ink: hang your hand down and your fingers become tentacles.
class Octopus extends Character {
  constructor() {
    super('Chef Ink');
    const m = felt(COLORS.octopus);
    this.head = new Ball(m);
    this.tentacles = [...FINGERS, THUMB].map(() => [new Limb(m), new Limb(m), new Limb(m)]);
    this.tentacles.forEach((segs) => this.add(...segs));
    this.eyes = [new Eye(), new Eye()];
    this.hatBand = new Limb(felt(COLORS.white));
    this.hatPuffs = [new Ball(felt(COLORS.white)), new Ball(felt(COLORS.white)), new Ball(felt(COLORS.white))];
    this.add(this.head, ...this.eyes, this.hatBand, ...this.hatPuffs);
  }
  update(ctx) {
    const { p, L, viewer, t, talk } = ctx;
    const K = V(avg([p[INDEX[0]], p[MIDDLE[0]], p[RING[0]], p[PINKY[0]]]));
    const look = toward(K, viewer);
    const center = p[WRIST].clone().lerp(K, 0.55).addScaledVector(look, 0.25 * L);
    const r = (0.78 + 0.08 * talk) * L;
    this.head.set(center, r);
    [...FINGERS, THUMB].forEach((finger, i) => {
      const segs = this.tentacles[i];
      for (let s = 0; s < 3; s++) {
        segs[s].set(p[finger[s]], p[finger[s + 1]], (0.2 - s * 0.05) * L, (0.15 - s * 0.04) * L);
      }
    });
    const side = new THREE.Vector3().crossVectors(UP, look).normalize();
    const eyeBase = center.clone().addScaledVector(look, r * 0.82).addScaledVector(UP, 0.12 * L);
    this.eyes[0].set(eyeBase.clone().addScaledVector(side, 0.26 * L), 0.18 * L, look, t);
    this.eyes[1].set(eyeBase.clone().addScaledVector(side, -0.26 * L), 0.18 * L, look, t);
    // Chef hat sits on top of the head, whichever way the hand is tilted.
    const top = center.clone().addScaledVector(UP, r * 0.95);
    this.hatBand.set(top.clone().addScaledVector(side, -0.35 * L), top.clone().addScaledVector(side, 0.35 * L), 0.16 * L);
    const puffY = top.clone().addScaledVector(UP, (0.3 + 0.05 * talk) * L);
    this.hatPuffs[0].set(puffY.clone().addScaledVector(side, -0.3 * L), 0.26 * L);
    this.hatPuffs[1].set(puffY.clone().addScaledVector(UP, 0.12 * L), 0.32 * L);
    this.hatPuffs[2].set(puffY.clone().addScaledVector(side, 0.3 * L), 0.26 * L);
  }
}

// Courier Crab: index and middle finger walk, the thumb is the claw.
class Crab extends Character {
  constructor() {
    super('Courier Crab');
    const m = felt(COLORS.crab), d = felt(COLORS.crabDark);
    this.shell = new Ball(m);
    this.legs = [INDEX, MIDDLE, RING, PINKY].map(() => [new Limb(d), new Limb(d), new Limb(d)]);
    this.legs.forEach((segs) => this.add(...segs));
    this.arm = new Limb(d);
    this.claw = [new Ball(m), new Spike(m), new Spike(m)];
    this.letter = new THREE.Mesh(new THREE.BoxGeometry(1, 0.66, 0.08), plain(COLORS.white));
    this.stalks = [new Limb(d), new Limb(d)];
    this.eyes = [new Eye(), new Eye()];
    this.bag = new Ball(felt(COLORS.teal));
    this.add(this.shell, this.arm, ...this.claw, this.letter, ...this.stalks, ...this.eyes, this.bag);
  }
  update(ctx) {
    const { p, L, viewer, t, talk } = ctx;
    const K = V(avg([p[INDEX[0]], p[MIDDLE[0]], p[RING[0]], p[PINKY[0]]]));
    const look = toward(K, viewer);
    const center = p[WRIST].clone().lerp(K, 0.6).addScaledVector(look, 0.2 * L);
    this.shell.set(center, 0.72 * L, 0.7);
    [INDEX, MIDDLE, RING, PINKY].forEach((finger, i) => {
      const segs = this.legs[i];
      const r = i < 2 ? 0.13 : 0.1;
      for (let s = 0; s < 3; s++) segs[s].set(p[finger[s]], p[finger[s + 1]], r * L, (r - 0.02) * L);
    });
    // Claw at the thumb tip; it snaps open and shut while you talk.
    this.arm.set(p[THUMB[1]], p[THUMB[3]], 0.13 * L, 0.11 * L);
    const tip = p[THUMB[3]];
    const thumbDir = new THREE.Vector3().subVectors(tip, p[THUMB[2]]).normalize();
    const side = new THREE.Vector3().crossVectors(thumbDir, look).normalize();
    const snap = 0.25 + 0.5 * talk;
    this.claw[0].set(tip, 0.2 * L);
    this.claw[1].set(tip, thumbDir.clone().addScaledVector(side, snap), 0.09 * L, 0.38 * L);
    this.claw[2].set(tip, thumbDir.clone().addScaledVector(side, -snap), 0.09 * L, 0.38 * L);
    this.letter.position.copy(tip).addScaledVector(thumbDir, 0.45 * L);
    this.letter.lookAt(viewer);
    this.letter.scale.setScalar(0.55 * L);
    // Eye stalks always point up.
    const sideways = new THREE.Vector3().crossVectors(UP, look).normalize();
    [1, -1].forEach((sgn, i) => {
      const base = center.clone().addScaledVector(sideways, sgn * 0.25 * L).addScaledVector(UP, 0.3 * L);
      const top = base.clone().addScaledVector(UP, 0.45 * L);
      this.stalks[i].set(base, top, 0.05 * L);
      this.eyes[i].set(top, 0.15 * L, look, t);
    });
    this.bag.set(center.clone().addScaledVector(look, 0.45 * L).addScaledVector(UP, -0.15 * L), 0.22 * L, 0.8);
  }
}

// The Five: a tiny band member on every fingertip. Your real hand stays visible.
class Five extends Character {
  constructor() {
    super('The Five');
    const colors = [COLORS.crab, COLORS.dragon, COLORS.octopus, COLORS.teal, COLORS.gold];
    this.members = colors.map((c, i) => {
      const m = { head: new Ball(felt(c)), eyes: [new Eye(), new Eye()], hat: i % 2 ? new Spike(felt(COLORS.mouth)) : new Limb(felt('#2a1f35')) };
      this.add(m.head, ...m.eyes, m.hat);
      return m;
    });
    this.lastTips = null;
  }
  update(ctx, dt) {
    const { p, L, viewer, t, talk } = ctx;
    const fingers = [THUMB, INDEX, MIDDLE, RING, PINKY];
    // Whoever's finger moves most is the one singing.
    const tips = fingers.map((f) => p[f[3]].clone());
    const moves = this.lastTips ? tips.map((q, i) => q.distanceTo(this.lastTips[i]) / Math.max(dt, 1e-3)) : tips.map(() => 0);
    this.lastTips = tips;
    const singer = moves.indexOf(Math.max(...moves));
    fingers.forEach((f, i) => {
      const m = this.members[i];
      const dir = new THREE.Vector3().subVectors(p[f[3]], p[f[2]]).normalize();
      const look = toward(p[f[3]], viewer);
      const bounce = i === singer ? 1 + 0.25 * talk + 0.1 * Math.min(moves[i] / (L * 4), 1) : 1;
      const r = 0.22 * L * bounce;
      const c = p[f[3]].clone().addScaledVector(dir, 0.12 * L);
      m.head.set(c, r);
      const side = new THREE.Vector3().crossVectors(dir, look).normalize();
      const eyeBase = c.clone().addScaledVector(look, r * 0.85);
      m.eyes[0].set(eyeBase.clone().addScaledVector(side, 0.08 * L), 0.07 * L, look, t);
      m.eyes[1].set(eyeBase.clone().addScaledVector(side, -0.08 * L), 0.07 * L, look, t);
      const top = c.clone().addScaledVector(dir, r * 0.9);
      if (m.hat instanceof Spike) m.hat.set(top, dir, 0.15 * L, 0.3 * L);
      else m.hat.set(top, top.clone().addScaledVector(dir, 0.18 * L), 0.15 * L);
    });
  }
  center(ctx) { return ctx.p[MIDDLE[3]].clone(); }
}

// Fist pose: the current character curls up into a ball and the show pauses.
class Hiding extends Character {
  constructor() {
    super('Paused');
    this.ball = new Ball(felt(COLORS.dragon));
    this.eyes = [new Eye(), new Eye()];
    this.add(this.ball, ...this.eyes);
  }
  setColor(color) { this.ball.material = felt(color); }
  update(ctx) {
    const { p, L, viewer, t } = ctx;
    const c = V(avg([p[WRIST], p[INDEX[0]], p[PINKY[0]], p[MIDDLE[1]]]));
    const look = toward(c, viewer);
    const r = 0.75 * L * (1 + 0.04 * Math.sin(t * 2.5)); // slow sleepy breathing
    this.ball.set(c, r);
    const side = new THREE.Vector3().crossVectors(UP, look).normalize();
    const base = c.clone().addScaledVector(look, r * 0.9);
    this.eyes[0].set(base.clone().addScaledVector(side, 0.2 * L), 0.12 * L, look, t, true);
    this.eyes[1].set(base.clone().addScaledVector(side, -0.2 * L), 0.12 * L, look, t, true);
  }
}

const BODY_COLOR = { dragon: COLORS.dragon, octopus: COLORS.octopus, crab: COLORS.crab, five: COLORS.gold };

// One puppet per tracked hand. Owns all characters and swaps between them.
export class Puppet {
  constructor(scene) {
    this.scene = scene;
    this.chars = { dragon: new Dragon(), octopus: new Octopus(), crab: new Crab(), five: new Five(), fist: new Hiding() };
    Object.values(this.chars).forEach((c) => scene.add(c));
    this.current = null;
    this.lastCharacter = 'dragon';
    this.poofs = [];
  }
  hide() {
    Object.values(this.chars).forEach((c) => { c.visible = false; });
    this.current = null;
  }
  // points: array of 21 {x,y,z}; pose from PoseTracker; open = mouth measure.
  update(points, pose, { open, talk, viewer, t, dt }) {
    const p = points.map(V);
    const L = dist(points[WRIST], points[MIDDLE[0]]);
    const ctx = { p, L, open: THREE.MathUtils.clamp((open - 0.35) / 0.9, 0, 1), talk, viewer, t };
    if (pose === 'fist') this.chars.fist.setColor(BODY_COLOR[this.lastCharacter]);
    else this.lastCharacter = pose;
    const next = this.chars[pose];
    if (this.current !== next) {
      Object.values(this.chars).forEach((c) => { c.visible = c === next; });
      if (this.current) this.poof(next.center(ctx), L);
      this.current = next;
    }
    next.update(ctx, dt, this.scene);
    this.updatePoofs(dt);
  }
  // Little burst of felt fluff when the character changes.
  poof(at, L) {
    for (let i = 0; i < 10; i++) {
      const m = new Ball(new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      m.userData = { life: 0, pos: at.clone(), dir, L };
      this.scene.add(m);
      this.poofs.push(m);
    }
  }
  updatePoofs(dt) {
    this.poofs = this.poofs.filter((m) => {
      const d = m.userData;
      d.life += dt;
      if (d.life > 0.45) { this.scene.remove(m); m.material.dispose(); return false; }
      d.pos.addScaledVector(d.dir, dt * 2.2 * d.L);
      m.set(d.pos, 0.15 * d.L * (1 - d.life / 0.45));
      m.material.opacity = 0.9 * (1 - d.life / 0.45);
      return true;
    });
  }
}

export const NAMES = { dragon: 'Grumble', octopus: 'Chef Ink', crab: 'Courier Crab', five: 'The Five', fist: 'Paused' };
