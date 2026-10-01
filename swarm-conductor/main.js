import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PoseTracker, smooth, XR_JOINTS } from '../palm-pals/hands.js';
import { readGesture, COMMANDS } from './gestures.js';
import { DEMO_GESTURES, placeTip } from './demo-gestures.js';
import { Swarm } from './drones.js';
import { Show } from './show.js';
import { Sound } from './sound.js';
import { buildWorld, buildPassthroughLights, HoloHand } from './world.js';

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const $ = (id) => document.getElementById(id);
const ui = {
  landing: $('landing'), status: $('status'), video: $('video'),
  demoBtn: $('watch'), webcamBtn: $('webcam'), xrBtn: $('xr'), xrNote: $('xr-note'),
  hud: $('hud'), act: $('act'), progress: $('progress'), bar: $('bar'), clock: $('clock'),
  command: $('command'), guide: $('guide'), title: $('title'), titleName: $('title-name'), titleSub: $('title-sub'),
  toast: $('toast'), menu: $('menu'), soundBtn: $('sound'),
};

// ---------- renderer, camera, effects ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
renderer.domElement.id = 'gl';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 60);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.5, 0.32);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

const sound = new Sound();
let soundOn = false;
const clock = new THREE.Clock();

// ---------- layouts: the same game on a screen or in a headset ----------

const SCREEN = {
  center: new THREE.Vector3(0, 0.07, -0.7), size: 0.2, reach: 2.6,
  bounds: { min: new THREE.Vector3(-0.62, -0.36, -0.8), max: new THREE.Vector3(0.62, 0.33, -0.6) }, plane: -0.7,
};
// In the headset: in front of where your head started, within arm's reach.
const HEADSET = {
  center: new THREE.Vector3(0, -0.08, -0.62), size: 0.2, reach: 4,
  bounds: { min: new THREE.Vector3(-0.5, -0.45, -1.0), max: new THREE.Vector3(0.5, 0.25, -0.3) }, plane: null,
};

let root = null, swarm = null, show = null, layout = SCREEN;
const holo = new HoloHand();
scene.add(holo);
const pointer = new THREE.Mesh(new THREE.RingGeometry(0.016, 0.02, 40), new THREE.MeshBasicMaterial({ color: '#4cd6ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
scene.add(pointer);

function newGame(l) {
  if (root) scene.remove(root);
  layout = l;
  root = new THREE.Group();
  scene.add(root);
  swarm = new Swarm(root, { count: 24, unit: 0.008, bounds: l.bounds, plane: l.plane, reach: l.reach });
  show = new Show(root, { center: l.center, size: l.size, snap: 0.03 });
  show.on(onShowEvent);
  show.start();
}

let world = buildWorld(scene);

// ---------- show events: titles, toasts and sound ----------

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
let toastTimer = 0, titleTimer = 0;
function onShowEvent(type, d) {
  if (type === 'act') {
    ui.titleName.textContent = d.name;
    ui.titleSub.textContent = `Act ${ROMAN[d.index]} · ${d.slots} drones`;
    ui.title.style.setProperty('--c', d.color);
    ui.title.hidden = false;
    ui.title.classList.remove('show');
    void ui.title.offsetWidth;
    ui.title.classList.add('show');
    titleTimer = 2.6;
    if (soundOn) sound.whoosh();
  } else if (type === 'lock') {
    if (soundOn) sound.lock(d.filled - 1);
  } else if (type === 'complete') {
    ui.toast.textContent = `${d.name} complete in ${d.seconds.toFixed(1)}s`;
    ui.toast.hidden = false;
    toastTimer = 3.5;
    if (soundOn) sound.complete(d.index);
  } else if (type === 'firework') {
    if (soundOn) sound.firework();
  }
}

// ---------- the conductor: hand in, drones out ----------

// Calling the swarm home or freezing it doesn't paint; aiming it does.
const PAINTS = new Set(['point', 'carry', 'orbit']);
const tracker = new PoseTracker(4);
tracker.pose = 'gather';
let smoothed = null;

function conduct(hands, dt, t) {
  const hand = hands.find((h) => h.key === 'Right') ?? hands[0];
  let reading = null;
  if (hand) {
    smoothed = smooth(smoothed, hand.points, 0.6);
    reading = readGesture(smoothed);
    tracker.update(reading.gesture);
    if (inputMode !== 'xr') holo.set(smoothed); else holo.visible = false;
  } else {
    smoothed = null;
    holo.visible = false;
  }
  const command = reading ? tracker.pose : 'hold';
  const goals = new Map();
  const free = swarm.free;
  swarm.commandGoals(command, reading, t).forEach((g, i) => goals.set(free[i], g));
  show.lockedGoals(goals);
  show.update(dt, t, swarm, PAINTS.has(command));
  const color = new THREE.Color(COMMANDS[command].color);
  const speed = swarm.update(goals, dt, t, color);
  if (soundOn) sound.swarm(speed);

  pointer.visible = Boolean(swarm.pointTarget);
  if (swarm.pointTarget) {
    pointer.position.copy(swarm.pointTarget);
    pointer.lookAt(inputMode === 'xr' ? renderer.xr.getCamera().position : camera.position);
    pointer.scale.setScalar(1 + 0.15 * Math.sin(t * 8));
  }
  renderHud(Boolean(hand), command, dt);
}

function renderHud(handVisible, command, dt) {
  const act = show.current;
  ui.act.textContent = `Act ${ROMAN[show.act]} · ${act.name}`;
  ui.act.style.color = act.color;
  ui.progress.textContent = `${show.filled} / ${show.slots.length}`;
  ui.bar.style.width = `${(100 * show.filled) / Math.max(1, show.slots.length)}%`;
  ui.bar.style.background = act.color;
  ui.clock.textContent = `${show.actTime.toFixed(1)}s`;
  const cmd = COMMANDS[command];
  ui.command.textContent = handVisible ? cmd.label : 'Show your hand';
  ui.command.style.color = handVisible ? cmd.color : '';
  for (const chip of ui.guide.querySelectorAll('[data-cmd]')) chip.classList.toggle('on', handVisible && chip.dataset.cmd === command);
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) ui.toast.hidden = true;
  if (titleTimer > 0 && (titleTimer -= dt) <= 0) ui.title.hidden = true;
}

// ---------- input: scripted demo hand ----------

let demoAim = null;
function demoHands(t, dt) {
  const size = 0.1, z = layout.plane;
  const lift = (pts) => pts.map((q) => ({ x: q.x, y: q.y, z: q.z + z }));
  const rest = { x: 0.06 * Math.sin(t * 0.8), y: -0.4, z: 0 };
  const next = show.slots.find((s) => !s.drone);
  if (show.state !== 'playing' || show.actTime < 1.4 || !next) {
    demoAim = null;
    return lift(DEMO_GESTURES.gather({ size, origin: rest, spread: 0.22 }));
  }
  demoAim = demoAim ? demoAim.lerp(next.pos, Math.min(1, dt * 5)) : next.pos.clone();
  // Act III shows off the pinch: drag the swarm along the curve.
  if (show.act === 2) return lift(placeTip(DEMO_GESTURES.carry({ size }), { x: demoAim.x, y: demoAim.y - 0.01, z: 0 }));
  const pivot = { x: 0.05 * Math.sin(t * 0.5), y: -0.42 };
  const direction = Math.atan2(demoAim.y - pivot.y, demoAim.x - pivot.x);
  const pts = DEMO_GESTURES.point({ size, direction });
  const reach = layout.reach * size;
  return lift(placeTip(pts, { x: demoAim.x - Math.cos(direction) * reach, y: demoAim.y - Math.sin(direction) * reach, z: 0 }));
}

// ---------- input: webcam ----------

let landmarker = null, lastVideoTime = -1, lastHands = [];
async function loadLandmarker() {
  const { HandLandmarker, FilesetResolver } = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  const options = (delegate) => ({ baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
  try { return await HandLandmarker.createFromOptions(files, options('GPU')); }
  catch { return await HandLandmarker.createFromOptions(files, options('CPU')); }
}
function webcamHands() {
  if (ui.video.currentTime === lastVideoTime) return lastHands;
  lastVideoTime = ui.video.currentTime;
  const res = landmarker.detectForVideo(ui.video, performance.now());
  // Your hand is placed on the stage plane, mirrored like a selfie.
  const H = 2 * Math.abs(layout.plane) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const va = ui.video.videoWidth / ui.video.videoHeight;
  lastHands = res.landmarks.map((lm, i) => ({
    key: res.handedness[i]?.[0]?.categoryName === 'Left' ? 'Right' : 'Left',
    points: lm.map((q) => ({ x: (0.5 - q.x) * H * va, y: (0.5 - q.y) * H, z: layout.plane - q.z * H * va })),
  }));
  return lastHands;
}

// ---------- main loop (screen) ----------

let inputMode = 'demo';
function frame(dtOverride) {
  const dt = dtOverride ?? Math.min(clock.getDelta(), 0.05);
  const t = (frame.t = (frame.t ?? 0) + dt);
  const hands = inputMode === 'webcam' && landmarker ? webcamHands()
    : inputMode === 'demo' ? [{ key: 'Right', points: demoHands(t, dt) }] : [];
  conduct(hands, dt, t);
  world.update(t);
  // Slow cinematic drift of the camera.
  camera.position.set(0.05 * Math.sin(t * 0.21), 0.025 * Math.sin(t * 0.17), 0);
  camera.lookAt(0, layout.center.y * 0.5, layout.center.z);
  composer.render(dt);
}

newGame(SCREEN);
if (CAPTURE) {
  ui.landing.hidden = true;
  ui.hud.hidden = false;
  window.__step = (dt) => frame(dt);
} else {
  renderer.setAnimationLoop(() => frame());
  if (params.has('demo')) enterShow();
}

function enterShow() {
  ui.landing.hidden = true;
  ui.hud.hidden = false;
}
function enableSound() {
  sound.start();
  soundOn = true;
  ui.soundBtn.textContent = 'Sound on';
  ui.soundBtn.setAttribute('aria-pressed', 'true');
}
function setStatus(msg) { ui.status.textContent = msg; ui.status.hidden = !msg; }

ui.demoBtn.addEventListener('click', () => { enableSound(); enterShow(); });
ui.menu.addEventListener('click', () => { ui.landing.hidden = false; ui.hud.hidden = true; });
ui.soundBtn.addEventListener('click', () => {
  if (soundOn) { soundOn = false; sound.ctx?.suspend(); ui.soundBtn.textContent = 'Sound off'; ui.soundBtn.setAttribute('aria-pressed', 'false'); }
  else enableSound();
});

ui.webcamBtn.addEventListener('click', async () => {
  enableSound();
  ui.webcamBtn.disabled = true;
  try {
    setStatus('Asking for your camera…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
    ui.video.srcObject = stream;
    await ui.video.play();
    setStatus('Loading hand tracking (the first time takes a few seconds)…');
    landmarker ??= await loadLandmarker();
    setStatus('');
    ui.video.hidden = false;
    inputMode = 'webcam';
    newGame(SCREEN);
    enterShow();
  } catch (err) {
    setStatus(err.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this site and try again.' : `Couldn't start: ${err.message}`);
  } finally {
    ui.webcamBtn.disabled = false;
  }
});

// ---------- headset (WebXR passthrough) ----------

async function pickXrMode() {
  if (!navigator.xr) return null;
  if (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) return 'immersive-ar';
  if (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) return 'immersive-vr';
  return null;
}
pickXrMode().then((mode) => {
  if (!mode) { ui.xrBtn.disabled = true; ui.xrNote.textContent = 'To play in your room, open this page in the Meta Quest browser.'; return; }
  ui.xrBtn.dataset.mode = mode;
  ui.xrNote.textContent = mode === 'immersive-ar' ? 'Passthrough: the show happens in your real room.' : 'No passthrough on this device, so it opens in VR.';
});

const xrHands = [];
const tmp = new THREE.Vector3();
ui.xrBtn.addEventListener('click', async () => {
  enableSound();
  const mode = ui.xrBtn.dataset.mode;
  try {
    const session = await navigator.xr.requestSession(mode, { requiredFeatures: ['hand-tracking'], optionalFeatures: ['local-floor'] });
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    inputMode = 'xr';
    // Passthrough replaces the night city.
    scene.clear();
    scene.background = mode === 'immersive-vr' ? new THREE.Color('#05070f') : null;
    scene.fog = null;
    buildPassthroughLights(scene);
    scene.add(holo, pointer);
    world = { update() {} };
    newGame(HEADSET);
    board = makeBoard();
    scene.add(board);
    for (const i of [0, 1]) {
      const hand = renderer.xr.getHand(i);
      hand.addEventListener('connected', (e) => { hand.userData.handedness = e.data.handedness; });
      scene.add(hand);
      xrHands.push(hand);
    }
    session.addEventListener('end', () => location.reload());
    renderer.setAnimationLoop(xrFrame);
  } catch (err) {
    setStatus(`Couldn't start the headset session: ${err.message}. Turn on hand tracking in the Quest settings.`);
  }
});

// In the headset the page HUD isn't visible, so the act and progress
// float on a small board above the stage.
let board = null, boardTimer = 0;
function makeBoard() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.position.copy(HEADSET.center).add(new THREE.Vector3(0, HEADSET.size + 0.12, 0));
  mesh.userData.canvas = c;
  return mesh;
}
function drawBoard() {
  const c = board.userData.canvas, g = c.getContext('2d'), act = show.current;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(10,13,26,0.6)';
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, 48); g.fill();
  g.fillStyle = act.color;
  g.font = '700 64px system-ui, sans-serif';
  g.fillText(`Act ${ROMAN[show.act]} · ${act.name}`, 48, 96);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(48, 140, 928, 20);
  g.fillStyle = act.color;
  g.fillRect(48, 140, (928 * show.filled) / Math.max(1, show.slots.length), 20);
  g.fillStyle = '#eef2fb';
  g.font = '44px system-ui, sans-serif';
  const cmd = COMMANDS[tracker.pose];
  g.fillText(`${show.filled} / ${show.slots.length}   ·   ${smoothed ? cmd.label : 'Show your hand'}`, 48, 222);
  board.material.map.needsUpdate = true;
}

let xrT = 0;
function xrFrame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  xrT += dt;
  const hands = [];
  for (const hand of xrHands) {
    const j = hand.joints;
    if (!j?.wrist?.visible) continue;
    hands.push({
      key: hand.userData.handedness === 'right' ? 'Right' : 'Left',
      points: XR_JOINTS.map((name) => { j[name].getWorldPosition(tmp); return { x: tmp.x, y: tmp.y, z: tmp.z }; }),
    });
  }
  conduct(hands, dt, xrT);
  if ((boardTimer -= dt) <= 0) { drawBoard(); boardTimer = 0.15; }
  renderer.render(scene, camera);
}
