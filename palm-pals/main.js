import * as THREE from 'three';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { measure, classify, PoseTracker, smooth, XR_JOINTS } from './hands.js';
import { Puppet, NAMES } from './puppets.js';

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const $ = (id) => document.getElementById(id);
const ui = {
  landing: $('landing'), stage: $('stage'), video: $('video'), status: $('status'),
  webcamBtn: $('start-webcam'), xrBtn: $('start-xr'), voiceBtn: $('voice'), xrNote: $('xr-note'),
  hud: $('hud'), names: $('names'), guide: $('guide'), debug: $('debug'), paused: $('paused'), back: $('back'),
};

// ---------- shared three.js setup ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.domElement.id = 'gl';
ui.stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa8, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(0.6, 1, 1.2);
scene.add(sun);

const clock = new THREE.Clock();

// Each tracked hand gets its own puppet, pose tracker and smoothed points.
const slots = new Map();
function slotFor(key) {
  if (!slots.has(key)) slots.set(key, { puppet: new Puppet(scene), tracker: new PoseTracker(5), points: null });
  return slots.get(key);
}

// ---------- voice (optional) ----------

let analyser = null, samples = null, talk = 0;
ui.voiceBtn.addEventListener('click', async () => {
  if (analyser) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audio = new AudioContext();
    analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    samples = new Float32Array(analyser.fftSize);
    audio.createMediaStreamSource(stream).connect(analyser);
    ui.voiceBtn.textContent = 'Voice on';
    ui.voiceBtn.setAttribute('aria-pressed', 'true');
  } catch (err) {
    setStatus(`Couldn't turn on the microphone (${err.message}). The puppets still work without it.`);
  }
});
function readVoice() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const s of samples) sum += s * s;
  const level = THREE.MathUtils.clamp((Math.sqrt(sum / samples.length) - 0.01) * 14, 0, 1);
  talk += (level - talk) * 0.35;
  return talk;
}

// ---------- per-frame puppet update (both modes) ----------

let showDebug = false;
window.addEventListener('keydown', (e) => { if (e.key === 'd') { showDebug = !showDebug; ui.debug.hidden = !showDebug; } });

function updateHands(hands, viewer, dt) {
  const t = clock.elapsedTime;
  const voice = readVoice();
  const seen = new Set();
  const labels = [];
  const debugLines = [];
  for (const { key, points } of hands) {
    seen.add(key);
    const slot = slotFor(key);
    slot.points = smooth(slot.points, points, 0.55);
    const m = measure(slot.points);
    const pose = slot.tracker.update(classify(m));
    slot.puppet.update(slot.points, pose, { open: m.mouth, talk: voice, viewer, t, dt });
    labels.push({ key, pose });
    debugLines.push(`${key}: straight fingers ${m.count} · pointing ${m.pointing.y.toFixed(2)} · spread ${m.spread.toFixed(2)} · mouth ${m.mouth.toFixed(2)} → ${classify(m) ?? 'between poses'}`);
  }
  for (const [key, slot] of slots) {
    if (!seen.has(key)) { slot.puppet.hide(); slot.points = null; }
  }
  renderHud(labels, debugLines);
}

function renderHud(labels, debugLines) {
  ui.names.textContent = labels.length
    ? labels.map((l) => `${l.key} hand: ${NAMES[l.pose]}`).join('   ·   ')
    : 'Hold a hand up to the camera';
  const active = new Set(labels.map((l) => l.pose));
  for (const chip of ui.guide.querySelectorAll('[data-pose]')) chip.classList.toggle('on', active.has(chip.dataset.pose));
  ui.paused.hidden = !(labels.length && labels.every((l) => l.pose === 'fist'));
  if (showDebug) ui.debug.textContent = debugLines.join('\n') || 'no hands';
}

function setStatus(msg) { ui.status.textContent = msg; ui.status.hidden = !msg; }

// ---------- webcam mode ----------

let landmarker = null;
const webcamCam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.01, 100);
webcamCam.position.set(0, 0, 10);
const webcamViewer = new THREE.Vector3(0, 0, 10);
let aspect = 16 / 9;

async function loadLandmarker() {
  const files = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const options = (delegate) => ({ baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
  try { return await HandLandmarker.createFromOptions(files, options('GPU')); }
  catch { return await HandLandmarker.createFromOptions(files, options('CPU')); }
}

function fitStage() {
  const vw = ui.video.videoWidth || 1280, vh = ui.video.videoHeight || 720;
  aspect = vw / vh;
  const k = Math.min(window.innerWidth / vw, window.innerHeight / vh);
  const w = Math.round(vw * k), h = Math.round(vh * k);
  for (const el of [ui.video, renderer.domElement]) {
    Object.assign(el.style, { width: `${w}px`, height: `${h}px`, left: `${(window.innerWidth - w) / 2}px`, top: `${(window.innerHeight - h) / 2}px` });
  }
  renderer.setSize(w, h, false);
  webcamCam.left = -aspect / 2; webcamCam.right = aspect / 2;
  webcamCam.updateProjectionMatrix();
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
    ui.landing.hidden = true;
    ui.stage.hidden = false;
    ui.hud.hidden = false;
    fitStage();
    window.addEventListener('resize', fitStage);
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
      // The preview is mirrored like a selfie, so flip x to match.
      // MediaPipe's z uses roughly the same scale as x.
      const points = lm.map((q) => ({ x: (0.5 - q.x) * aspect, y: 0.5 - q.y, z: -q.z * aspect }));
      // MediaPipe labels hands as if the image were mirrored; ours is not, so swap.
      const label = res.handedness[i]?.[0]?.categoryName;
      const key = label === 'Left' ? 'Right' : label === 'Right' ? 'Left' : `Hand ${i + 1}`;
      return { key, points };
    });
    // Two hands with the same label (rare): keep them apart.
    if (hands.length === 2 && hands[0].key === hands[1].key) hands[1].key += ' 2';
    updateHands(hands, webcamViewer, dt);
  }
  renderer.render(scene, webcamCam);
}

ui.back.addEventListener('click', () => location.reload());

// ---------- Quest mode (WebXR passthrough) ----------

const xrCam = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
let xrHands = [];

function guidePanel() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 560;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(42,31,53,0.88)';
  g.beginPath(); g.roundRect(0, 0, 1024, 560, 48); g.fill();
  g.fillStyle = '#e8a417';
  g.font = '700 64px system-ui, sans-serif';
  g.fillText('Palm Pals', 56, 100);
  g.fillStyle = '#f1eaf7';
  g.font = '40px system-ui, sans-serif';
  const rows = [
    ['Sock puppet, thumb below fingers', 'Grumble'],
    ['Hand hanging down, fingers loose', 'Chef Ink'],
    ['Two fingers out, like legs', 'Courier Crab'],
    ['Fingers spread, pointing up', 'The Five'],
    ['Make a fist', 'Pause'],
  ];
  rows.forEach(([pose, who], i) => {
    g.fillStyle = '#f1eaf7'; g.fillText(pose, 56, 190 + i * 76);
    g.fillStyle = '#4cc1b8'; g.fillText(who, 760, 190 + i * 76);
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5 * 560 / 1024),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }),
  );
  mesh.position.set(0, -0.15, -0.75);
  mesh.rotation.x = -0.25;
  return mesh;
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
    ui.xrNote.textContent = 'Open this page in the Meta Quest browser to try it in passthrough.';
    return;
  }
  ui.xrBtn.dataset.mode = mode;
  ui.xrNote.textContent = mode === 'immersive-ar' ? 'Passthrough AR with hand tracking.' : 'This device has VR but no passthrough, so it opens in VR.';
});

ui.xrBtn.addEventListener('click', async () => {
  const mode = ui.xrBtn.dataset.mode;
  try {
    const session = await navigator.xr.requestSession(mode, { requiredFeatures: ['hand-tracking'], optionalFeatures: ['local-floor'] });
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    const panel = guidePanel();
    scene.add(panel);
    if (mode === 'immersive-vr') scene.background = new THREE.Color('#2a1f35');
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
function xrFrame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const viewer = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
  const hands = [];
  for (const hand of xrHands) {
    const joints = hand.joints;
    if (!joints || !joints.wrist || !joints.wrist.visible) continue;
    const points = XR_JOINTS.map((name) => {
      const j = joints[name];
      j.getWorldPosition(tmp);
      return { x: tmp.x, y: tmp.y, z: tmp.z };
    });
    const h = hand.userData.handedness;
    hands.push({ key: h === 'left' ? 'Left' : h === 'right' ? 'Right' : 'Hand', points });
  }
  updateHands(hands, viewer, dt);
  renderer.render(scene, xrCam);
}
