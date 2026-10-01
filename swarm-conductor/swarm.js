// Drones, beacons and the round timer. Works in two spaces:
//  - webcam: a flat screen, height 1, drones stay at z = 0 (flat: true)
//  - headset: metres, in front of where the player's head started
import * as THREE from 'three';
import { COMMANDS } from './gestures.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (q) => new THREE.Vector3(q.x, q.y, q.z);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
const glow = (color, size) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
};

// ---------- drone ----------

const BODY = new THREE.SphereGeometry(1, 20, 12);
const ARM = new THREE.BoxGeometry(1, 0.12, 0.12);
const ROTOR = new THREE.CylinderGeometry(1, 1, 0.05, 20);
const bodyMat = new THREE.MeshStandardMaterial({ color: '#2b2f3a', metalness: 0.6, roughness: 0.35 });
const armMat = new THREE.MeshStandardMaterial({ color: '#5b6070', metalness: 0.4, roughness: 0.5 });
const rotorMat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.35, depthWrite: false });

class Drone extends THREE.Group {
  constructor(unit, flat) {
    super();
    this.frame = new THREE.Group();
    // On a flat webcam view, tip the drone toward the camera so the rotors read.
    if (flat) this.frame.rotation.x = 0.55;
    const body = new THREE.Mesh(BODY, bodyMat);
    body.scale.set(unit, unit * 0.45, unit);
    this.frame.add(body);
    this.rotors = [];
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(ARM, armMat);
      arm.scale.set(unit * 3.2, unit, unit);
      arm.rotation.y = Math.PI / 4 + i * Math.PI / 2;
      this.frame.add(arm);
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const r = new THREE.Mesh(ROTOR, rotorMat);
      r.scale.set(unit * 0.75, unit, unit * 0.75);
      r.position.set(Math.cos(a) * unit * 1.6, unit * 0.35, Math.sin(a) * unit * 1.6);
      this.rotors.push(r);
      this.frame.add(r);
    }
    this.light = glow('#ffffff', unit * 5);
    this.light.position.y = -unit * 0.3;
    this.frame.add(this.light);
    this.add(this.frame);
    this.vel = new THREE.Vector3();
    this.seed = Math.random() * 100;
  }
}

// ---------- beacons ----------

const RING = new THREE.TorusGeometry(1, 0.08, 10, 40);
const CORE = new THREE.SphereGeometry(1, 20, 12);

class Beacon extends THREE.Group {
  constructor(unit, flat) {
    super();
    this.radius = unit * 5;
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#8d86a0', transparent: true, opacity: 0.9 });
    this.ring = new THREE.Mesh(RING, this.ringMat);
    this.ring.scale.setScalar(this.radius);
    if (!flat) this.ring.rotation.x = Math.PI / 2; // lies flat in the room
    this.coreMat = new THREE.MeshStandardMaterial({ color: '#3a3448', emissive: '#f2b53a', emissiveIntensity: 0 });
    this.core = new THREE.Mesh(CORE, this.coreMat);
    this.core.scale.setScalar(unit * 1.2);
    this.halo = glow('#f2b53a', this.radius * 2.5);
    this.halo.material.opacity = 0;
    this.add(this.ring, this.core, this.halo);
    this.charge = 0;
  }
  show(charge, t) {
    this.charge = charge;
    this.ringMat.color.set('#8d86a0').lerp(new THREE.Color('#f2b53a'), charge);
    this.coreMat.emissiveIntensity = 0.3 + charge * 2;
    this.halo.material.opacity = charge * 0.9;
    this.ring.rotation.z = t * (0.5 + charge * 4);
    this.core.position.y = Math.sin(t * 2 + this.slot) * this.radius * 0.1;
  }
}

// ---------- the swarm game ----------

export class SwarmGame {
  // opts: { unit, arena: {min, max} (Vector3), flat, orbitAxis, reach (palm lengths), drones, beacons, roundSeconds }
  constructor(scene, opts) {
    this.scene = scene;
    this.o = { drones: 12, beacons: 3, roundSeconds: 90, ...opts };
    const { unit, flat } = this.o;
    this.drones = Array.from({ length: this.o.drones }, (_, i) => {
      const d = new Drone(unit, flat);
      d.position.copy(this.randomSpot());
      d.index = i;
      scene.add(d);
      return d;
    });
    this.beacons = Array.from({ length: this.o.beacons }, (_, i) => {
      const b = new Beacon(unit, flat);
      b.slot = i;
      scene.add(b);
      return b;
    });
    this.beacons.forEach((b) => b.position.copy(this.beaconSpot(b)));
    this.marker = glow('#ffffff', unit * 8);
    this.marker.visible = false;
    scene.add(this.marker);
    this.bursts = [];
    this.command = null;
    this.holdSpots = null;
    this.score = 0;
    this.best = Number(safeGet('swarm-best') || 0);
    this.timeLeft = this.o.roundSeconds;
    this.over = false;
    this.overTimer = 0;
  }

  randomSpot() {
    const { min, max } = this.o.arena;
    return new THREE.Vector3(
      THREE.MathUtils.lerp(min.x, max.x, Math.random()),
      THREE.MathUtils.lerp(min.y, max.y, Math.random()),
      THREE.MathUtils.lerp(min.z, max.z, Math.random()),
    );
  }
  // New beacon spot, not too close to the others.
  beaconSpot(self) {
    let best = null, bestGap = -1;
    for (let i = 0; i < 12; i++) {
      const p = this.randomSpot();
      const gap = Math.min(...this.beacons.filter((b) => b !== self).map((b) => b.position.distanceTo(p)), Infinity);
      if (gap > bestGap) { best = p; bestGap = gap; }
    }
    return best;
  }

  clamp(v) {
    const { min, max } = this.o.arena;
    const pad = this.o.unit * 3;
    v.x = THREE.MathUtils.clamp(v.x, min.x - pad, max.x + pad);
    v.y = THREE.MathUtils.clamp(v.y, min.y - pad, max.y + pad);
    v.z = THREE.MathUtils.clamp(v.z, min.z - pad, max.z + pad);
    if (this.o.flat) v.z = 0;
    return v;
  }

  // Where each drone should be for the current command.
  targets(cmd, hand, t) {
    const n = this.drones.length;
    const L = hand?.palm ?? this.o.unit * 10;
    const ring = (center, radius, axis, spin) => this.drones.map((d, i) => {
      const a = spin + (i / n) * Math.PI * 2;
      const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      const w = new THREE.Vector3().crossVectors(axis, u).normalize();
      return center.clone().addScaledVector(u, Math.cos(a) * radius).addScaledVector(w, Math.sin(a) * radius);
    });
    const ball = (center, radius) => this.drones.map((d, i) => {
      // Spread drones evenly over a small sphere (golden-angle spiral).
      const y = 1 - (i + 0.5) * (2 / n);
      const r = Math.sqrt(1 - y * y), a = i * 2.39996;
      const off = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(radius);
      if (this.o.flat) off.z = 0;
      return center.clone().add(off);
    });
    switch (cmd) {
      case 'gather': return ring(V(hand.palmCenter).addScaledVector(UP, 1.6 * L), 1.1 * L, this.o.flat ? new THREE.Vector3(0, 0, 1) : UP, t * 0.8);
      case 'point': {
        const target = this.clamp(V(hand.tip).addScaledVector(V(hand.aim), this.o.reach * L));
        this.marker.position.copy(target);
        return ball(target, 0.6 * L);
      }
      case 'orbit': return ring(V(hand.orbitCenter), 1.4 * L, this.o.orbitAxis, t * 3);
      case 'carry': return ball(V(hand.pinchAt), 0.45 * L);
      case 'hold':
      default:
        if (!this.holdSpots) this.holdSpots = this.drones.map((d) => d.position.clone());
        return this.holdSpots;
    }
  }

  // hand: result of readGesture (or null when no hand is visible).
  update(command, hand, t, dt) {
    // With no hand in view the swarm hovers where it is.
    const effective = hand ? command : 'hold';
    if (effective !== this.command) this.holdSpots = null;
    this.command = effective;
    const goals = this.targets(effective, hand, t);
    this.marker.visible = Boolean(hand) && command === 'point';
    const color = new THREE.Color(hand ? COMMANDS[command].color : '#ffffff');
    if (this.marker.visible) this.marker.material.color.copy(color);

    const { unit } = this.o;
    const maxSpeed = unit * 110;
    for (const d of this.drones) {
      const goal = goals[d.index].clone();
      // A little hover wobble so they feel alive.
      goal.x += Math.sin(t * 2.1 + d.seed) * unit * 0.6;
      goal.y += Math.sin(t * 2.7 + d.seed * 1.3) * unit * 0.6;
      const want = goal.sub(d.position).multiplyScalar(6);
      if (want.length() > maxSpeed) want.setLength(maxSpeed);
      const acc = want.sub(d.vel).multiplyScalar(5);
      // Keep a little personal space.
      for (const e of this.drones) {
        if (e === d) continue;
        const away = new THREE.Vector3().subVectors(d.position, e.position);
        const gap = away.length();
        if (gap > 0 && gap < unit * 3.5) acc.addScaledVector(away.normalize(), (unit * 3.5 - gap) * 400);
      }
      if (this.o.flat) acc.z = 0;
      d.vel.addScaledVector(acc, dt);
      d.position.addScaledVector(d.vel, dt);
      // Bank into the direction of travel, like a real quadcopter.
      const tilt = new THREE.Vector3().copy(acc).multiplyScalar(0.01 / unit).add(new THREE.Vector3(0, 9.8, 0)).normalize();
      d.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(UP, tilt), 0.25);
      d.rotors.forEach((r, i) => { r.rotation.y += dt * 60 * (i % 2 ? 1 : -1); });
      d.light.material.color.lerp(color, 0.15);
    }

    this.updateRound(dt, t);
    this.updateBursts(dt);
  }

  updateRound(dt, t) {
    if (this.over) {
      this.overTimer -= dt;
      if (this.overTimer <= 0) { this.over = false; this.score = 0; this.timeLeft = this.o.roundSeconds; }
      this.beacons.forEach((b) => b.show(0, t));
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.over = true;
      this.overTimer = 6;
      if (this.score > this.best) { this.best = this.score; safeSet('swarm-best', String(this.best)); }
      return;
    }
    // A beacon charges while 4 or more drones are inside its ring.
    for (const b of this.beacons) {
      const inside = this.drones.filter((d) => d.position.distanceTo(b.position) < b.radius * 1.4).length;
      let c = b.charge + (inside >= 4 ? dt / 0.8 : -dt * 0.3);
      if (c >= 1) {
        this.score += 1;
        this.burst(b.position.clone());
        b.position.copy(this.beaconSpot(b));
        c = 0;
      }
      b.show(THREE.MathUtils.clamp(c, 0, 1), t);
    }
  }

  burst(at) {
    for (let i = 0; i < 16; i++) {
      const s = glow('#f2b53a', this.o.unit * 3);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, this.o.flat ? 0 : Math.random() - 0.5).normalize();
      s.position.copy(at);
      s.userData = { dir, life: 0 };
      this.scene.add(s);
      this.bursts.push(s);
    }
  }
  updateBursts(dt) {
    this.bursts = this.bursts.filter((s) => {
      s.userData.life += dt;
      const k = s.userData.life / 0.7;
      if (k >= 1) { this.scene.remove(s); s.material.dispose(); return false; }
      s.position.addScaledVector(s.userData.dir, dt * this.o.unit * 40);
      s.material.opacity = 1 - k;
      return true;
    });
  }
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } }
