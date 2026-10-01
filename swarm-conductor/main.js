import * as THREE from 'three';
import { PoseTracker, smooth, XR_JOINTS } from '../palm-pals/hands.js';
import { readGesture, COMMANDS } from './gestures.js';
import { SwarmGame } from './swarm.js';
import { DEMO_GESTURES, placeTip } from './demo-gestures.js';

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const $ = (id) => document.getElementById(id);
const ui = {
  landing: $('landing'), stage: $('stage'), video: $('video'), status: $('status'),
  webcamBtn: $('start-webcam'), xrBtn: $('start-xr'), demoBtn: $('start-demo'), xrNote: $('xr-note'),
  hud: $('hud'), command: $('command'), score: $('score'), time: $('time'), best: $('best'),
  guide: $('guide'), over: $('over'), overScore: $('over-score'), back: $('back'),
};

// ---------- shared three.js setup ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.domElement.id = 'gl';
ui.stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(0.5, 1, 1);
scene.add(sun);
const clock = new THREE.Clock();

let game = null;
const tracker = new PoseTracker(4);
tracker.pose = 'gather';
let smoothed = null;

// Picks the hand that conducts: the right hand if there are two.
function conduct(hands, dt) {
  const t = clock.elapsedTime;
  const hand = hands.find((h) => h.key === 'Right') ?? hands[0];
  let reading = null;
  if (hand) {
    smoothed = smooth(smoothed, hand.points, 0.6);
    reading = readGesture(smoothed);
    tracker.update(reading.gesture);
  } else {
    smoothed = null;
  }
  game.update(tracker.pose, reading, t, dt);
  renderHud(Boolean(hand));
}

function renderHud(handVisible) {
  const cmd = COMMANDS[tracker.pose];
  ui.command.textContent = handVisible ? cmd.label : 'Show your hand';
  ui.command.style.color = handVisible ? cmd.color : '';
  ui.score.textContent = game.score;
  ui.time.textContent = Math.ceil(game.timeLeft);
  ui.best.textContent = game.best;
  for (const chip of ui.guide.querySelectorAll('[data-cmd]')) chip.classList.toggle('on', handVisible && chip.dataset.cmd === tracker.pose);
  ui.over.hidden = !game.over;
  ui.overScore.textContent = game.score;
}

function setStatus(msg) { ui.status.textContent = msg; ui.status.hidden = !msg; }
ui.back.addEventListener('click', () => { location.href = location.pathname; });

// ---------- flat screen modes (webcam and demo) ----------

const flatCam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.01, 100);
flatCam.position.set(0, 0, 10);
let aspect = 16 / 9;

function fitStage(vw, vh) {
  aspect = vw / vh;
  const k = Math.min(window.innerWidth / vw, window.innerHeight / vh);
  const w = Math.round(vw * k), h = Math.round(vh * k);
  for (const el of [ui.video, renderer.domElement]) {
    Object.assign(el.style, { width: `${w}px`, height: `${h}px`, left: `${(window.innerWidth - w) / 2}px`, top: `${(window.innerHeight - h) / 2}px` });
  }
  renderer.setSize(w, h, false);
  flatCam.left = -aspect / 2; flatCam.right = aspect / 2;
  flatCam.updateProjectionMatrix();
}

function startFlatGame() {
  game = new SwarmGame(scene, {
    unit: 0.0105, flat: true, reach: 3, orbitAxis: new THREE.Vector3(0, 0, 1),
    arena: { min: new THREE.Vector3(-aspect / 2 + 0.1, -0.3, 0), max: new THREE.Vector3(aspect / 2 - 0.1, 0.27, 0) },
  });
  ui.landing.hidden = true;
  ui.stage.hidden = false;
  ui.hud.hidden = false;
}

let landmarker = null;
async function loadLandmarker() {
  const { HandLandmarker, FilesetResolver } = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  const options = (delegate) => ({ baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
  try { return await HandLandmarker.createFromOptions(files, options('GPU')); }
  catch { return await HandLandmarker.createFromOptions(files, options('CPU')); }
}

ui.webcamBtn.addEventListener('click', async () => {
  ui.webcamBtn.disabled = true;
  try {
    setStatus('Asking for your camera…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
    ui.video.srcObject = stream;
    await ui.video.play();
    setStatus('Loading hand tracking (first time takes a few seconds)…');
    landmarker ??= await loadLandmarker();
    setStatus('');
    const fit = () => fitStage(ui.video.videoWidth, ui.video.videoHeight);
    fit();
    window.addEventListener('resize', fit);
    startFlatGame();
    renderer.setAnimationLoop(webcamFrame);
  } catch (err) {
    setStatus(err.name === 'NotAllowedError'
      ? 'Camera access was blocked. Allow the camera for this site and try again.'
      : `Couldn't start: ${err.message}`);
    ui.webcamBtn.disabled = false;
  }
});

let lastVideoTime = -1;
function webcamFrame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (ui.video.currentTime !== lastVideoTime) {
    lastVideoTime = ui.video.currentTime;
    const res = landmarker.detectForVideo(ui.video, performance.now());
    const hands = res.landmarks.map((lm, i) => {
      // Mirrored like a selfie; MediaPipe's z is on roughly the same scale as x.
      const points = lm.map((q) => ({ x: (0.5 - q.x) * aspect, y: 0.5 - q.y, z: -q.z * aspect }));
      // MediaPipe's labels assume a mirrored image; ours isn't, so swap them.
      const label = res.handedness[i]?.[0]?.categoryName;
      return { key: label === 'Left' ? 'Right' : 'Left', points };
    });
    conduct(hands, dt);
  }
  renderer.render(scene, flatCam);
}

// ---------- demo mode: a scripted hand, no camera needed ----------

const skeleton = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#e3c2a6', transparent: true, opacity: 0.8 }));
const BONES = [0, 1, 1, 2, 2, 3, 3, 4, 0, 5, 5, 6, 6, 7, 7, 8, 5, 9, 9, 10, 10, 11, 11, 12, 9, 13, 13, 14, 14, 15, 15, 16, 13, 17, 17, 18, 18, 19, 19, 20, 0, 17];

function demoHand(t) {
  const size = 0.12;
  const phase = t % 18;
  const bottom = { x: 0.15 * Math.sin(t * 0.7), y: -0.4, z: 0 };
  if (phase < 3) return DEMO_GESTURES.gather({ size, origin: bottom });
  if (phase < 10) {
    // Point at the nearest beacon so the demo actually scores.
    const goal = game.beacons.reduce((a, b) => (a.charge >= b.charge ? a : b)).position;
    const from = { x: 0, y: -0.45 };
    const direction = Math.atan2(goal.y - from.y, goal.x - from.x);
    const pts = DEMO_GESTURES.point({ size, direction });
    const aim = { x: Math.cos(direction), y: Math.sin(direction) };
    const reachDist = 3 * size * 0.95;
    return placeTip(pts, { x: goal.x - aim.x * reachDist, y: goal.y - aim.y * reachDist, z: 0 });
  }
  if (phase < 13) return DEMO_GESTURES.orbit({ size, origin: { x: -0.2, y: -0.35, z: 0 } });
  if (phase < 16) return DEMO_GESTURES.carry({ size, origin: { x: 0.3 * Math.cos(t), y: -0.3 + 0.08 * Math.sin(t * 2), z: 0 } });
  return DEMO_GESTURES.hold({ size, origin: bottom });
}

function startDemo() {
  ui.video.hidden = true;
  const fit = () => fitStage(16, 9);
  fit();
  window.addEventListener('resize', fit);
  startFlatGame();
  scene.add(skeleton);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const pts = demoHand(clock.elapsedTime);
    skeleton.geometry.setFromPoints(BONES.map((i) => new THREE.Vector3(pts[i].x, pts[i].y, 0.01)));
    conduct([{ key: 'Right', points: pts }], dt);
    renderer.render(scene, flatCam);
  });
}
ui.demoBtn.addEventListener('click', startDemo);
if (new URLSearchParams(location.search).has('demo')) startDemo();

// ---------- Quest mode (WebXR passthrough) ----------

const xrCam = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
let xrHands = [];
let panel = null;

// Floating scoreboard and gesture list, up and to the left of the play area.
function makePanel() {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 640;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.36 * 640 / 768),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }),
  );
  mesh.position.set(-0.55, 0.05, -0.75);
  mesh.lookAt(0, 0, 0);
  mesh.userData.canvas = c;
  return mesh;
}
function drawPanel() {
  const c = panel.userData.canvas, g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(20,24,34,0.85)';
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, 40); g.fill();
  g.fillStyle = '#f2b53a'; g.font = '700 56px system-ui, sans-serif';
  g.fillText(game.over ? `Round over: ${game.score}` : `Beacons ${game.score}`, 40, 84);
  g.fillStyle = '#e8ecf5'; g.font = '40px system-ui, sans-serif';
  g.fillText(game.over ? 'Next round in a moment' : `Time ${Math.ceil(game.timeLeft)}s   Best ${game.best}`, 40, 150);
  Object.entries(COMMANDS).forEach(([key, cmd], i) => {
    const on = key === tracker.pose;
    g.fillStyle = on ? cmd.color : '#9aa3b5';
    g.font = `${on ? '700 ' : ''}40px system-ui, sans-serif`;
    g.fillText(`${cmd.how}`, 40, 240 + i * 80);
    g.fillText(cmd.label, 420, 240 + i * 80);
  });
  panel.material.map.needsUpdate = true;
}

async function pickXrMode() {
  if (!navigator.xr) return null;
  if (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) return 'immersive-ar';
  if (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) return 'immersive-vr';
  return null;
}
pickXrMode().then((mode) => {
  if (!mode) {
    ui.xrBtn.disabled = true;
    ui.xrNote.textContent = 'Open this page in the Meta Quest browser to play in passthrough.';
    return;
  }
  ui.xrBtn.dataset.mode = mode;
  ui.xrNote.textContent = mode === 'immersive-ar' ? 'Passthrough with hand tracking.' : 'No passthrough on this device, so it opens in VR.';
});

ui.xrBtn.addEventListener('click', async () => {
  const mode = ui.xrBtn.dataset.mode;
  try {
    const session = await navigator.xr.requestSession(mode, { requiredFeatures: ['hand-tracking'], optionalFeatures: ['local-floor'] });
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    if (mode === 'immersive-vr') scene.background = new THREE.Color('#141822');
    // Play area: in front of where your head was when you started, within reach.
    game = new SwarmGame(scene, {
      unit: 0.01, flat: false, reach: 5, orbitAxis: new THREE.Vector3(0, 1, 0),
      arena: { min: new THREE.Vector3(-0.45, -0.4, -0.85), max: new THREE.Vector3(0.45, 0.1, -0.35) },
    });
    panel = makePanel();
    scene.add(panel);
    xrHands = [0, 1].map((i) => {
      const hand = renderer.xr.getHand(i);
      hand.addEventListener('connected', (e) => { hand.userData.handedness = e.data.handedness; });
      scene.add(hand);
      return hand;
    });
    session.addEventListener('end', () => location.reload());
    renderer.setAnimationLoop(xrFrame);
  } catch (err) {
    setStatus(`Couldn't start the headset session: ${err.message}. Hand tracking must be turned on in the Quest settings.`);
  }
});

const tmp = new THREE.Vector3();
let panelTimer = 0;
function xrFrame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const hands = [];
  for (const hand of xrHands) {
    const joints = hand.joints;
    if (!joints?.wrist?.visible) continue;
    const points = XR_JOINTS.map((name) => { joints[name].getWorldPosition(tmp); return { x: tmp.x, y: tmp.y, z: tmp.z }; });
    hands.push({ key: hand.userData.handedness === 'right' ? 'Right' : 'Left', points });
  }
  conduct(hands, dt);
  panelTimer -= dt;
  if (panelTimer <= 0) { drawPanel(); panelTimer = 0.2; }
  renderer.render(scene, xrCam);
}
