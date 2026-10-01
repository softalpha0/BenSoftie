// Scenery for the screen version: a night sky over a miniature city.
// In the headset the real room (passthrough) replaces all of this.
import * as THREE from 'three';
import { glowSprite } from './drones.js';

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  const warm = ['#ffcf7a', '#ffe2a8', '#9fd8ff', '#ffb36b'];
  for (let y = 4; y < 128; y += 8) {
    for (let x = 4; x < 64; x += 8) {
      if (Math.random() < 0.22) { g.fillStyle = warm[Math.floor(Math.random() * warm.length)]; g.fillRect(x, y, 4, 4); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color('#05070f');
  scene.fog = new THREE.FogExp2('#060918', 0.28);

  // Stars on a big dome.
  const starGeo = new THREE.BufferGeometry();
  const n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.random() * 0.9 + 0.05;
    const r = 25;
    pos.set([Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r - 2, Math.sin(u) * Math.cos(v) * r], i * 3);
    const b = 0.5 + Math.random() * 0.5;
    col.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, fog: false, transparent: true, depthWrite: false }));
  scene.add(stars);

  const moon = glowSprite('#dfe8ff', 2.2, 0.6);
  moon.material.fog = false;
  moon.position.set(-11, 6.5, -18);
  const moonCore = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshBasicMaterial({ color: '#f4f1e6', fog: false }));
  moonCore.position.copy(moon.position);
  scene.add(moon, moonCore);

  // The ground: a dark plane with a faint neon grid.
  const groundY = -0.42;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: '#0a0d18', roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  scene.add(ground);
  const grid = new THREE.GridHelper(12, 120, '#2b3a6b', '#151d38');
  grid.position.y = groundY + 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  scene.add(grid);

  // A miniature city behind and around the show.
  const windows = windowTexture();
  const buildingMat = new THREE.MeshStandardMaterial({ color: '#141a2c', roughness: 0.6, metalness: 0.2, emissive: '#ffffff', emissiveMap: windows, emissiveIntensity: 0.55 });
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const count = 260;
  const city = new THREE.InstancedMesh(box, buildingMat, count);
  const m = new THREE.Matrix4();
  let placed = 0;
  while (placed < count) {
    const x = (Math.random() - 0.5) * 5.5;
    const z = -1.5 - Math.random() * 3.2;
    // Keep a clear stage in front of the camera.
    if (Math.abs(x) < 0.7 && z > -2.0) continue;
    const w = 0.05 + Math.random() * 0.09, d = 0.05 + Math.random() * 0.09;
    const h = 0.04 + Math.pow(Math.random(), 2.4) * (0.4 + Math.abs(x) * 0.2);
    m.compose(new THREE.Vector3(x, groundY, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    city.setMatrixAt(placed++, m);
  }
  scene.add(city);

  // Rooftop aircraft-warning lights on the tallest towers.
  const blinkers = [];
  for (let i = 0; i < 14; i++) {
    const s = glowSprite('#ff4d4d', 0.05);
    s.position.set((Math.random() - 0.5) * 4, groundY + 0.25 + Math.random() * 0.4, -1.4 - Math.random() * 2);
    s.userData.phase = Math.random() * 6;
    scene.add(s);
    blinkers.push(s);
  }

  // A glowing launch pad under the stage.
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.13, 64), new THREE.MeshBasicMaterial({ color: '#4cd6ff', transparent: true, opacity: 0.5 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, groundY + 0.002, -0.7);
  scene.add(pad);

  scene.add(new THREE.HemisphereLight('#7f9cff', '#0b0e1a', 0.9));
  const key = new THREE.DirectionalLight('#cdd9ff', 1.4);
  key.position.set(-2, 3, 2);
  scene.add(key);

  return {
    update(t) {
      blinkers.forEach((s) => { s.material.opacity = Math.sin(t * 2 + s.userData.phase) > 0.6 ? 1 : 0.1; });
      stars.rotation.y = t * 0.004;
    },
  };
}

// Lights only, for the headset where passthrough shows the real room.
export function buildPassthroughLights(scene) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#445066', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 1.2);
  key.position.set(0.5, 1, 1);
  scene.add(key);
}

// A see-through glowing copy of your hand, shown on screen so you can see
// what the drones are following.
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export class HoloHand extends THREE.Group {
  constructor() {
    super();
    const mat = new THREE.MeshBasicMaterial({ color: '#57c7ff', transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false });
    const jointMat = new THREE.MeshBasicMaterial({ color: '#a8e6ff', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const sph = new THREE.SphereGeometry(1, 12, 8);
    this.bones = BONES.map(() => { const m = new THREE.Mesh(cyl, mat); this.add(m); return m; });
    this.joints = Array.from({ length: 21 }, () => { const m = new THREE.Mesh(sph, jointMat); this.add(m); return m; });
    this.tips = [4, 8, 12, 16, 20].map(() => { const s = glowSprite('#7fd8ff', 0.03, 0.35); this.add(s); return s; });
    // A palm "web" so it reads as a hand, not a skeleton.
    this.palmGeo = new THREE.BufferGeometry();
    this.palmGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
    this.palmGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
    this.add(new THREE.Mesh(this.palmGeo, new THREE.MeshBasicMaterial({ color: '#57c7ff', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    this.visible = false;
  }
  set(points) {
    this.visible = true;
    const P = points.map((q) => new THREE.Vector3(q.x, q.y, q.z));
    const L = P[0].distanceTo(P[9]);
    const UP = new THREE.Vector3(0, 1, 0);
    BONES.forEach(([a, b], i) => {
      const d = new THREE.Vector3().subVectors(P[b], P[a]);
      const m = this.bones[i];
      m.position.copy(P[a]).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
      m.scale.set(L * 0.09, d.length(), L * 0.09);
    });
    P.forEach((p, i) => { this.joints[i].position.copy(p); this.joints[i].scale.setScalar(L * 0.06); });
    [4, 8, 12, 16, 20].forEach((j, i) => { this.tips[i].position.copy(P[j]); this.tips[i].scale.setScalar(L * 0.45); });
    const arr = this.palmGeo.attributes.position.array;
    [0, 1, 5, 9, 13, 17].forEach((j, i) => arr.set([P[j].x, P[j].y, P[j].z], i * 3));
    this.palmGeo.attributes.position.needsUpdate = true;
    this.palmGeo.computeBoundingSphere();
  }
}
