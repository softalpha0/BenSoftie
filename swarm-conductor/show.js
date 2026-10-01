// The light show: each act is a shape made of glowing slots. Fly the swarm
// through the slots and drones lock in one by one. When the shape is full it
// lights up, spins, and fireworks go off. Then the next act begins.
import * as THREE from 'three';
import { GLOW, glowSprite } from './drones.js';

// ---------- shapes (in a -1..1 square, y up) ----------

// Evenly spaced points along a polyline.
function sample(poly, n, closed) {
  const pts = closed ? [...poly, poly[0]] : poly;
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push(l);
    total += l;
  }
  const out = [];
  const count = closed ? n : Math.max(1, n - 1);
  for (let k = 0; k < n; k++) {
    let d = (k / count) * total, i = 0;
    while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const f = seg[i] ? d / seg[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]);
  }
  return out;
}
const curve = (fn, steps = 200, from = 0, to = Math.PI * 2) => Array.from({ length: steps }, (_, i) => fn(from + (to - from) * (i / (steps - 1))));

export const ACTS = [
  {
    name: 'Star', color: '#ffd166',
    parts: [{ closed: true, n: 15, poly: Array.from({ length: 10 }, (_, i) => {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1;
      return [Math.cos(a) * r, Math.sin(a) * r - 0.05];
    }) }],
  },
  {
    name: 'Heart', color: '#ff5fa2',
    parts: [{ closed: true, n: 16, poly: curve((t) => [Math.pow(Math.sin(t), 3), (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 + 0.1]) }],
  },
  {
    name: 'Infinity', color: '#4cd6ff',
    parts: [{ closed: true, n: 18, poly: curve((t) => { const s = 1 + Math.sin(t) ** 2; return [Math.cos(t) / s, (Math.sin(t) * Math.cos(t)) / s * 1.2]; }) }],
  },
  {
    name: 'Smile', color: '#9dff6b',
    parts: [
      { closed: true, n: 14, poly: curve((t) => [Math.cos(t), Math.sin(t)]) },
      { closed: false, n: 1, poly: [[-0.35, 0.3], [-0.35, 0.3]] },
      { closed: false, n: 1, poly: [[0.35, 0.3], [0.35, 0.3]] },
      { closed: false, n: 5, poly: curve((t) => [Math.cos(t) * 0.55, Math.sin(t) * 0.55 - 0.05], 40, Math.PI * 1.15, Math.PI * 1.85) },
    ],
  },
  {
    name: 'Galaxy', color: '#b28cff',
    parts: [0, Math.PI].map((off) => ({ closed: false, n: 10, poly: curve((t) => [Math.cos(t + off) * (0.12 + t * 0.16), Math.sin(t + off) * (0.12 + t * 0.16) * 0.8], 120, 0, 5.4) })),
  },
];

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'white';
  g.lineWidth = 5;
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}
const RING = ringTexture();

// ---------- the show ----------

export class Show {
  // opts: { center: Vector3, size: half-width in metres, snap: lock-in distance, sound }
  constructor(scene, opts) {
    this.scene = scene;
    this.o = opts;
    this.act = -1;
    this.state = 'intro';
    this.timer = 0;
    this.slots = [];
    this.lines = [];
    this.sparks = [];
    this.spin = 0;
    this.times = [];
    this.actTime = 0;
    this.listeners = [];
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, data) { this.listeners.forEach((fn) => fn(type, data)); }

  get current() { return ACTS[this.act]; }
  get filled() { return this.slots.filter((s) => s.drone).length; }

  start() { this.nextAct(); }

  nextAct() {
    this.clearAct();
    this.act = (this.act + 1) % ACTS.length;
    const act = this.current;
    const { center, size } = this.o;
    const color = new THREE.Color(act.color);
    for (const part of act.parts) {
      const pts = sample(part.poly, part.n, part.closed);
      const linePts = (part.n > 1 ? part.poly.concat(part.closed ? [part.poly[0]] : []) : [])
        .map(([x, y]) => new THREE.Vector3(center.x + x * size, center.y + y * size, center.z));
      if (linePts.length > 1) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.scene.add(line);
        this.lines.push(line);
      }
      for (const [x, y] of pts) {
        const home = new THREE.Vector3(x * size, y * size, 0);
        const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: RING, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.scale.setScalar(this.o.snap * 1.6);
        this.scene.add(ring);
        this.slots.push({ home, ring, drone: null, pos: new THREE.Vector3() });
      }
    }
    this.placeSlots(0);
    this.state = 'playing';
    this.actTime = 0;
    this.emit('act', { index: this.act, name: act.name, color: act.color, slots: this.slots.length });
  }

  clearAct() {
    for (const s of this.slots) {
      this.scene.remove(s.ring);
      s.ring.material.dispose();
      if (s.drone) s.drone.locked = null;
    }
    for (const l of this.lines) { this.scene.remove(l); l.geometry.dispose(); l.material.dispose(); }
    this.slots = [];
    this.lines = [];
    this.spin = 0;
  }

  // World position of each slot, including the finale spin.
  placeSlots(spin) {
    const { center } = this.o;
    for (const s of this.slots) {
      s.pos.set(s.home.x * Math.cos(spin), s.home.y, s.home.x * Math.sin(spin)).add(center);
      s.ring.position.copy(s.pos);
    }
  }

  // paint: whether the current command can lock drones into slots.
  update(dt, t, swarm, paint = true) {
    this.updateSparks(dt);
    if (this.state === 'playing') {
      this.actTime += dt;
      // Any free drone that flies close to an empty slot locks into it.
      for (const s of this.slots) {
        s.ring.material.opacity = s.drone ? 0 : 0.35 + 0.25 * Math.sin(t * 4 + s.home.x * 20);
        if (s.drone || !paint) continue;
        let best = null, bestD = this.o.snap;
        for (const d of swarm.drones) {
          if (d.locked) continue;
          const dd = d.position.distanceTo(s.pos);
          if (dd < bestD) { best = d; bestD = dd; }
        }
        if (best) {
          best.locked = s;
          s.drone = best;
          best.setColor(new THREE.Color(this.current.color), 1);
          this.burst(s.pos, this.current.color, 8, 0.25);
          this.emit('lock', { filled: this.filled, total: this.slots.length });
        }
      }
      if (this.filled === this.slots.length) {
        this.state = 'finale';
        this.timer = 0;
        this.times[this.act] = this.actTime;
        this.lines.forEach((l) => { l.material.opacity = 0.9; });
        this.emit('complete', { index: this.act, name: this.current.name, seconds: this.actTime });
      }
    } else if (this.state === 'finale') {
      this.timer += dt;
      // Spin the finished shape a full turn, with fireworks.
      const k = Math.min(this.timer / 3.2, 1);
      this.spin = (1 - Math.cos(k * Math.PI)) * Math.PI;
      this.placeSlots(this.spin);
      this.lines.forEach((l) => { l.rotation.y = 0; l.material.opacity = 0.9 * (1 - k); });
      for (const s of this.slots) if (s.drone) s.drone.setColor(new THREE.Color(this.current.color).offsetHSL(0, 0, 0.15 * Math.sin(t * 10 + s.home.x * 30)), 1);
      if (Math.floor(this.timer * 2.5) !== Math.floor((this.timer - dt) * 2.5) && this.timer < 3) {
        const { center, size } = this.o;
        const at = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * size * 3, size * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * size));
        const palette = ['#ffd166', '#ff5fa2', '#4cd6ff', '#9dff6b', '#b28cff'];
        this.burst(at, palette[Math.floor(Math.random() * palette.length)], 36, 1);
        this.emit('firework', {});
      }
      if (this.timer > 4.2) {
        // Release the drones with a little outward push, then the next act.
        for (const s of this.slots) if (s.drone) s.drone.vel.add(s.drone.position.clone().sub(this.o.center).setLength(0.4));
        this.nextAct();
      }
    }
  }

  // Goal for each parked drone.
  lockedGoals(goals) {
    for (const s of this.slots) if (s.drone) goals.set(s.drone, s.pos);
    return goals;
  }

  burst(at, color, count, power) {
    for (let i = 0; i < count; i++) {
      const s = glowSprite(color, 0.012 + Math.random() * 0.01);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      s.position.copy(at);
      s.userData = { vel: dir.multiplyScalar((0.2 + Math.random() * 0.3) * power), life: 0, max: 0.6 + Math.random() * 0.8 * power };
      this.scene.add(s);
      this.sparks.push(s);
    }
  }
  updateSparks(dt) {
    this.sparks = this.sparks.filter((s) => {
      const d = s.userData;
      d.life += dt;
      if (d.life >= d.max) { this.scene.remove(s); s.material.dispose(); return false; }
      d.vel.y -= 0.25 * dt;
      d.vel.multiplyScalar(1 - dt * 1.5);
      s.position.addScaledVector(d.vel, dt);
      s.material.opacity = 1 - d.life / d.max;
      return true;
    });
  }
}

export { GLOW };
