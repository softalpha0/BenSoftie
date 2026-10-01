// Quadcopter models, flight behaviour and light trails.
// All sizes are in metres so the same numbers work on a screen and in a headset.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (q) => new THREE.Vector3(q.x, q.y, q.z);

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export const GLOW = glowTexture();
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

// ---------- model ----------

function frameGeometry(u) {
  const parts = [];
  const body = new THREE.SphereGeometry(1, 20, 12);
  body.scale(1.1 * u, 0.42 * u, 1.45 * u);
  parts.push(body);
  const battery = new THREE.BoxGeometry(0.9 * u, 0.3 * u, 1.2 * u);
  battery.translate(0, 0.32 * u, -0.1 * u);
  parts.push(battery);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const arm = new THREE.CylinderGeometry(0.12 * u, 0.12 * u, 2.1 * u, 8);
    arm.rotateZ(Math.PI / 2);
    arm.rotateY(-a);
    arm.translate(Math.cos(a) * 1.05 * u, 0, Math.sin(a) * 1.05 * u);
    parts.push(arm);
    const motor = new THREE.CylinderGeometry(0.22 * u, 0.26 * u, 0.4 * u, 12);
    motor.translate(Math.cos(a) * 2.05 * u, 0.12 * u, Math.sin(a) * 2.05 * u);
    parts.push(motor);
  }
  // Two little legs.
  for (const x of [-0.6, 0.6]) {
    const leg = new THREE.BoxGeometry(0.1 * u, 0.5 * u, 1.6 * u);
    leg.translate(x * u, -0.45 * u, 0);
    parts.push(leg);
  }
  return mergeGeometries(parts);
}

function guardGeometry(u) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const ring = new THREE.TorusGeometry(0.95 * u, 0.07 * u, 6, 28);
    ring.rotateX(Math.PI / 2);
    ring.translate(Math.cos(a) * 2.05 * u, 0.3 * u, Math.sin(a) * 2.05 * u);
    parts.push(ring);
  }
  return mergeGeometries(parts);
}

const frameMat = new THREE.MeshStandardMaterial({ color: '#1d2230', metalness: 0.75, roughness: 0.32 });
const bladeMat = new THREE.MeshBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });

class Drone extends THREE.Group {
  constructor(u, geo) {
    super();
    this.add(new THREE.Mesh(geo.frame, frameMat));
    this.guardMat = new THREE.MeshStandardMaterial({ color: '#0d1018', emissive: '#4cd6ff', emissiveIntensity: 1.6, roughness: 0.4 });
    this.add(new THREE.Mesh(geo.guards, this.guardMat));
    // Spinning rotor discs (a motion-blurred blade reads better than a thin propeller).
    this.blades = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const b = new THREE.Mesh(geo.blade, bladeMat);
      b.position.set(Math.cos(a) * 2.05 * u, 0.36 * u, Math.sin(a) * 2.05 * u);
      this.blades.push(b);
      this.add(b);
    }
    // Underside LED: a bright core for the bloom plus a soft halo.
    this.ledMat = new THREE.MeshBasicMaterial({ color: '#4cd6ff' });
    const led = new THREE.Mesh(geo.led, this.ledMat);
    led.position.y = -0.3 * u;
    this.add(led);
    this.halo = glowSprite('#4cd6ff', 6 * u, 0.85);
    this.halo.position.y = -0.3 * u;
    this.add(this.halo);
    this.vel = new THREE.Vector3();
    this.seed = Math.random() * 100;
    this.locked = null; // slot this drone is parked in, if any
    this.color = new THREE.Color('#4cd6ff');
  }
  setColor(c, k) {
    this.color.lerp(c, k);
    this.guardMat.emissive.copy(this.color);
    this.ledMat.color.copy(this.color);
    this.halo.material.color.copy(this.color);
  }
}

// ---------- trails ----------

const TRAIL = 16;
class Trail extends THREE.Line {
  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    super(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.frustumCulled = false;
    this.primed = false;
  }
  push(p, color) {
    const pos = this.geometry.attributes.position.array;
    const col = this.geometry.attributes.color.array;
    if (!this.primed) { for (let i = 0; i < TRAIL; i++) pos.set([p.x, p.y, p.z], i * 3); this.primed = true; }
    pos.copyWithin(3, 0, (TRAIL - 1) * 3);
    pos.set([p.x, p.y, p.z], 0);
    for (let i = 0; i < TRAIL; i++) {
      const k = Math.pow(1 - i / TRAIL, 1.6) * 0.9;
      col.set([color.r * k, color.g * k, color.b * k], i * 3);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------- the swarm ----------

export class Swarm {
  // opts: { count, unit, bounds: {min, max}, plane: z to keep drones near (flat screen) or null }
  constructor(scene, opts) {
    this.o = opts;
    const u = opts.unit;
    const geo = {
      frame: frameGeometry(u), guards: guardGeometry(u),
      blade: new THREE.CircleGeometry(0.9 * u, 20).rotateX(-Math.PI / 2),
      led: new THREE.SphereGeometry(0.28 * u, 10, 8),
    };
    this.drones = Array.from({ length: opts.count }, (_, i) => {
      const d = new Drone(u, geo);
      d.index = i;
      d.trail = new Trail();
      // Start in a neat hangar row along the bottom.
      const { min, max } = opts.bounds;
      d.position.set(THREE.MathUtils.lerp(min.x * 0.7, max.x * 0.7, i / (opts.count - 1)), min.y + 0.02, opts.plane ?? (min.z + max.z) / 2);
      scene.add(d, d.trail);
      return d;
    });
    this.holdSpots = null;
    this.mode = null;
  }

  get free() { return this.drones.filter((d) => !d.locked); }

  // Goals for the free drones, from the current command.
  commandGoals(cmd, hand, t) {
    const free = this.free;
    const n = free.length || 1;
    const L = hand?.palm ?? 0.09;
    const plane = this.o.plane;
    const ring = (center, radius, axis, spin) => {
      const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      const w = new THREE.Vector3().crossVectors(axis, u).normalize();
      return free.map((d, i) => {
        const a = spin + (i / n) * Math.PI * 2;
        return center.clone().addScaledVector(u, Math.cos(a) * radius).addScaledVector(w, Math.sin(a) * radius);
      });
    };
    const ball = (center, radius) => free.map((d, i) => {
      const y = 1 - (i + 0.5) * (2 / n);
      const r = Math.sqrt(1 - y * y), a = i * 2.39996;
      return center.clone().add(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(radius));
    });
    const flatAxis = new THREE.Vector3(0, 0, 1);
    if (cmd !== 'hold' || this.mode !== 'hold') this.holdSpots = null;
    this.mode = cmd;
    this.pointTarget = null;
    switch (cmd) {
      case 'gather': return ring(V(hand.palmCenter).addScaledVector(UP, 1.7 * L), 1.25 * L, plane != null ? flatAxis : UP, t * 0.9);
      case 'point': {
        const target = this.clamp(V(hand.tip).addScaledVector(V(hand.aim), this.o.reach * L));
        this.pointTarget = target;
        return ball(target, 0.45 * L);
      }
      case 'orbit': return ring(V(hand.orbitCenter), 1.5 * L, plane != null ? flatAxis : UP, t * 3.2);
      case 'carry': return ball(V(hand.pinchAt), 0.4 * L);
      default:
        this.holdSpots ??= new Map(free.map((d) => [d, d.position.clone()]));
        return free.map((d) => this.holdSpots.get(d) ?? d.position.clone());
    }
  }

  clamp(v) {
    const { min, max } = this.o.bounds;
    v.x = THREE.MathUtils.clamp(v.x, min.x, max.x);
    v.y = THREE.MathUtils.clamp(v.y, min.y, max.y);
    v.z = THREE.MathUtils.clamp(v.z, min.z, max.z);
    return v;
  }

  // goals: Map drone -> target position. color: colour for free drones.
  update(goals, dt, t, color) {
    const u = this.o.unit;
    let speedSum = 0;
    for (const d of this.drones) {
      const goal = (goals.get(d) ?? d.position).clone();
      const wobble = d.locked ? 0.25 : 0.7;
      goal.x += Math.sin(t * 2.1 + d.seed) * u * wobble;
      goal.y += Math.sin(t * 2.7 + d.seed * 1.3) * u * wobble;
      const maxSpeed = d.locked ? 0.9 : 0.75;
      const want = goal.sub(d.position).multiplyScalar(d.locked ? 9 : 5.5);
      if (want.length() > maxSpeed) want.setLength(maxSpeed);
      const acc = want.sub(d.vel).multiplyScalar(5);
      // Personal space between free drones.
      if (!d.locked) {
        for (const e of this.drones) {
          if (e === d || e.locked) continue;
          const away = new THREE.Vector3().subVectors(d.position, e.position);
          const gap = away.length();
          if (gap > 0 && gap < u * 5) acc.addScaledVector(away.normalize(), (u * 5 - gap) * 300);
        }
      }
      if (this.o.plane != null && !d.locked) acc.z += (this.o.plane - d.position.z) * 20;
      d.vel.addScaledVector(acc, dt);
      d.position.addScaledVector(d.vel, dt);
      speedSum += d.vel.length();
      // Bank into the turn like a real quadcopter.
      const tilt = acc.clone().multiplyScalar(0.06).add(new THREE.Vector3(0, 9.8, 0)).normalize();
      const yaw = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(d.vel.x, d.vel.z) * 0.3);
      const target = new THREE.Quaternion().setFromUnitVectors(UP, tilt).multiply(yaw);
      d.quaternion.slerp(target, Math.min(1, dt * 8));
      d.blades.forEach((b, i) => { b.rotation.y += dt * 70 * (i % 2 ? 1 : -1); });
      if (!d.locked) d.setColor(color, Math.min(1, dt * 6));
      d.trail.push(d.position, d.color);
    }
    return speedSum / this.drones.length;
  }
}
