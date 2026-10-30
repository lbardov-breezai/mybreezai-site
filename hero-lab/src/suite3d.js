// Suite section: the three product pieces as real 3D puzzle pieces.
// Each piece is an extruded shape with a knob on the right and a matching
// notch on the left, so when they slide together the knobs seat in the
// notches. They float apart at their own tilts until the set scrolls to the
// middle of the screen, then snap together; once the set is fully off-screen
// they come apart again, so every pass replays it. Click toggles. Falls back
// to the existing CSS pieces when WebGL isn't available.
import {
  CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, NoToneMapping, PerspectiveCamera, PlaneGeometry,
  Scene, Shape, SRGBColorSpace, WebGLRenderer
} from 'three';

const PIECES = [
  { color: '#F4B642', icon: '/content/icon-ai-meal-planner-white.svg', tilt: -5 },
  { color: '#61C5E5', icon: '/content/icon-chat-and-click-white.svg', tilt: 3 },
  { color: '#178FAE', icon: '/content/icon-smart-store-white.svg', tilt: -3 }
];
const W = 1.2;          // piece body width
const H = 0.9;          // piece body height
const R = 0.14;         // corner radius
const K = 0.17;         // knob radius
const GAP = 0.34;       // space between pieces at rest
const DEPTH = 0.16;
const PX_PER_UNIT = 115; // on-screen scale of the pieces
const BEVEL = 0.05;

// Body with a knob sticking out on the right and a notch cut in on the left.
// The bevel grows every outline by BEVEL, so neighbors sit W + 2*BEVEL apart
// and the notch is centered 2*BEVEL left of the edge, right where the
// neighbor's knob lands, with a hair of clearance.
const PITCH = W + 2 * BEVEL;
const pieceShape = () => {
  const off = 2 * BEVEL;
  const notchR = K + 2 * BEVEL + 0.012;
  const dy = Math.sqrt(notchR * notchR - off * off);
  const a0 = Math.atan2(dy, off);
  const s = new Shape();
  const cy = H / 2;
  s.moveTo(R, 0);
  s.lineTo(W - R, 0);
  s.quadraticCurveTo(W, 0, W, R);
  s.lineTo(W, cy - K);
  s.absarc(W, cy, K, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(W, H - R);
  s.quadraticCurveTo(W, H, W - R, H);
  s.lineTo(R, H);
  s.quadraticCurveTo(0, H, 0, H - R);
  s.lineTo(0, cy + dy);
  s.absarc(-off, cy, notchR, a0, -a0, true);
  s.lineTo(0, R);
  s.quadraticCurveTo(0, 0, R, 0);
  return s;
};

const shadowTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(16,42,80,0.32)');
  grad.addColorStop(0.5, 'rgba(16,42,80,0.12)');
  grad.addColorStop(1, 'rgba(16,42,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
};

const iconTexture = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    c.getContext('2d').drawImage(img, 0, 0, 256, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    resolve(t);
  };
  img.onerror = () => resolve(null);
  img.src = src;
});

const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export async function mountSuite3D(float) {
  const visual = float.querySelector('.suite-visual');
  const canvas = document.createElement('canvas');
  canvas.className = 'suite-3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0xE2E5EA, 1.5));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-2, 4, 5);
  scene.add(key);

  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 9);

  const rig = new Group();        // cursor tilt + resting tilt of the set
  rig.position.y = 0.12;
  scene.add(rig);

  const shadowTex = shadowTexture();
  const shadowGeo = new PlaneGeometry(1, 1);
  const geoBody = new ExtrudeGeometry(pieceShape(), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL,
    bevelSegments: 6, curveSegments: 40
  });
  // center the body (not the knob) on the origin so pieces line up by W
  geoBody.translate(-W / 2, -H / 2, -DEPTH / 2);
  const iconGeo = new PlaneGeometry(0.5, 0.5);
  const icons = await Promise.all(PIECES.map((p) => iconTexture(p.icon)));

  const pieces = PIECES.map((p, i) => {
    const holder = new Group();
    const body = new Mesh(geoBody, new MeshPhysicalMaterial({
      color: new Color(p.color), roughness: 0.5, metalness: 0,
      clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.07
    }));
    holder.add(body);
    if (icons[i]) {
      const icon = new Mesh(iconGeo, new MeshBasicMaterial({ map: icons[i], transparent: true, depthWrite: false, toneMapped: false }));
      icon.position.z = DEPTH / 2 + BEVEL + 0.002;
      holder.add(icon);
    }
    const shadow = new Mesh(shadowGeo, new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.renderOrder = -1;
    rig.add(shadow);
    rig.add(holder);
    return { ...p, i, holder, shadow, phase: i * 2.1 };
  });

  // Swap the CSS pieces for the canvas
  float.classList.add('suite-3d');
  float.insertBefore(canvas, visual);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Hold a fixed scale (px per unit) so the pieces stay the same size as
    // the canvas height changes; back off on narrow frames so the resting
    // set (about 5.4 units wide) still fits.
    const span = 2 * Math.tan((camera.fov * Math.PI) / 360);
    camera.position.z = Math.max(h / (PX_PER_UNIT * span), 5.4 / (span * camera.aspect));
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  // ---- State -------------------------------------------------------------
  let merged = false;
  let mergeK = 0;          // 0 = apart, 1 = locked together
  let snapAt = -1;
  let entered = -1;        // time the entrance started
  let tx = 0, ty = 0, cx = 0, cy = 0;

  const setMerged = (on) => {
    if (merged === on) return;
    merged = on;
    if (on) snapAt = -1;
  };
  canvas.addEventListener('click', () => setMerged(!merged));

  // Snap together when the set reaches the middle of the screen: its center
  // within the middle 30% of the viewport, or crossing the midline between
  // two frames on a fast scroll
  let lastSide = 0;
  const checkMiddle = () => {
    if (merged) return;
    const r = canvas.getBoundingClientRect();
    const vh = window.innerHeight;
    const offset = r.top + r.height / 2 - vh / 2;
    const side = Math.sign(offset);
    if (Math.abs(offset) < vh * 0.15 || (lastSide && side && side !== lastSide)) setMerged(true);
    lastSide = side;
  };
  // Fully off-screen: pull the pieces apart again, out of sight, for the
  // next pass
  const resetIo = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) return;
    merged = false;
    mergeK = 0;
    lastSide = 0;
  });
  resetIo.observe(canvas);
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  canvas.addEventListener('pointerleave', () => { tx = 0; ty = 0; });

  let inView = false;
  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView && entered < 0) entered = performance.now();
  }, { threshold: 0.2 });
  io.observe(canvas);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Frame ---------------------------------------------------------------
  let prev = 0;
  const frame = (now) => {
    const dt = prev ? Math.min(50, now - prev) / 1000 : 0.016;
    prev = now;
    const t = now / 1000;

    checkMiddle();
    // ease toward the target state; a soft spring on the way in
    const target = merged ? 1 : 0;
    mergeK += (target - mergeK) * (1 - Math.exp(-dt * 7));
    if (merged && mergeK > 0.985 && snapAt < 0) snapAt = now;
    const snap = snapAt > 0 ? Math.max(0, 1 - (now - snapAt) / 380) : 0;

    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    rig.rotation.set(-0.24 + cy * 0.18, -0.12 + cx * 0.32, -0.17);

    const ent = reduceMotion ? 1 : entered < 0 ? 0 : clamp01((now - entered) / 1100);
    pieces.forEach((p) => {
      const local = reduceMotion ? 1 : clamp01((ent * 1100 - p.i * 140) / 900);
      const e = easeOutBack(local);
      const m = mergeK;
      const apartX = (p.i - 1) * (PITCH + GAP);
      const togetherX = (p.i - 1) * PITCH;
      const bob = reduceMotion ? 0 : Math.sin(t * 1.3 + p.phase) * 0.06 * (1 - m) + Math.sin(t * 1.1) * 0.05 * m;
      const x = apartX + (togetherX - apartX) * m;
      const y = bob - (1 - e) * 0.35;
      const tilt = (p.tilt * Math.PI) / 180;
      p.holder.position.set(x, y, (1 - e) * -2);
      p.holder.rotation.set(
        (1 - m) * Math.sin(t * 0.9 + p.phase) * 0.06 + (1 - e) * 0.9,
        (1 - m) * Math.cos(t * 0.8 + p.phase) * 0.08 + (1 - e) * -0.6,
        tilt * (1 - m)
      );
      const s = (0.7 + 0.3 * e) * (1 + snap * 0.035);
      p.holder.scale.setScalar(s);

      // soft contact shadow behind and below, fading with lift
      const lift = 0.3 + bob;
      p.shadow.position.set(x + 0.1, y - 0.28 - lift * 0.3, -0.55);
      p.shadow.scale.set(W * 1.55 * s, H * 1.45 * s, 1);
      p.shadow.material.opacity = local * (0.95 - lift * 0.6);
    });
    renderer.render(scene, camera);
  };

  let raf = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!inView || document.hidden) { prev = 0; return; }
    frame(now);
  };
  raf = requestAnimationFrame(loop);
  frame(performance.now());

  return {
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      resetIo.disconnect();
      window.removeEventListener('resize', resize);
      renderer.dispose();
      canvas.remove();
      float.classList.remove('suite-3d');
    }
  };
}
