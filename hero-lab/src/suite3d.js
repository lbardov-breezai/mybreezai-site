// Suite section: the four product pieces as real 3D puzzle pieces, in a 2x2.
// Each piece is an extruded shape with knobs on the sides that face a
// neighbor to its right or below, and matching notches on the sides that face
// a neighbor to its left or above, so when they slide together the knobs seat
// in the notches. They float apart at their own tilts until the set scrolls to the
// middle of the screen, then snap together; once the set is fully off-screen
// they come apart again, so every pass replays it. Click toggles. Falls back
// to the existing CSS pieces when WebGL isn't available.
import {
  CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, NoToneMapping, PerspectiveCamera, PlaneGeometry,
  Scene, Shape, SRGBColorSpace, WebGLRenderer
} from 'three';

// col/row in the 2x2 (row 0 on top); reading order matches the cards below
const PIECES = [
  { color: '#F4B642', icon: '/content/icon-ai-meal-planner-white.svg', tilt: -5, col: 0, row: 0 },
  { color: '#102A50', icon: '/content/icon-proactive-white.svg', tilt: 4, col: 1, row: 0 },
  { color: '#61C5E5', icon: '/content/icon-chat-and-click-white.svg', tilt: 3, col: 0, row: 1 },
  { color: '#178FAE', icon: '/content/icon-smart-store-white.svg', tilt: -3, col: 1, row: 1 }
];
const COLS = 2, ROWS = 2;
const W = 1.2;          // piece body width
const H = 0.9;          // piece body height
const R = 0.14;         // corner radius
const K = 0.17;         // knob radius
const GAP = 0.34;       // space between pieces at rest
const DEPTH = 0.16;
const PX_PER_UNIT = 135; // on-screen scale of the pieces
const BEVEL = 0.05;

// Body with a knob or notch on each side that meets a neighbor. The bevel
// grows every outline by BEVEL, so neighbors sit W + 2*BEVEL (or H + 2*BEVEL)
// apart and a notch is centered 2*BEVEL outside its edge, right where the
// neighbor's knob lands, with a hair of clearance.
const PITCH_X = W + 2 * BEVEL;
const PITCH_Y = H + 2 * BEVEL;
// resting set size, in units (pieces apart, plus room for knobs, tilt and bob)
const REST_W = COLS * (PITCH_X + GAP) + 0.5;

// edges: { bottom, right, top, left } -> 'knob' | 'notch' | undefined (flat)
const edgesFor = ({ col, row }) => ({
  right: col < COLS - 1 ? 'knob' : undefined,
  left: col > 0 ? 'notch' : undefined,
  bottom: row < ROWS - 1 ? 'knob' : undefined,
  top: row > 0 ? 'notch' : undefined
});

const pieceShape = (edges) => {
  const off = 2 * BEVEL;
  const notchR = K + 2 * BEVEL + 0.012;
  const dy = Math.sqrt(notchR * notchR - off * off);
  // corners counterclockwise from bottom-left; each edge runs corner i -> i+1
  // with its outward normal n (interior on the left, outside on the right)
  const P = [[0, 0], [W, 0], [W, H], [0, H]];
  const sides = [
    { kind: edges.bottom, n: [0, -1] },
    { kind: edges.right, n: [1, 0] },
    { kind: edges.top, n: [0, 1] },
    { kind: edges.left, n: [-1, 0] }
  ];
  const dir = (i) => {
    const a = P[i], b = P[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };
  const ang = (v) => Math.atan2(v[1], v[0]);

  const s = new Shape();
  const d0 = dir(0);
  s.moveTo(P[0][0] + d0[0] * R, P[0][1] + d0[1] * R);
  sides.forEach(({ kind, n }, i) => {
    const a = P[i], b = P[(i + 1) % 4];
    const d = dir(i), dn = dir((i + 1) % 4);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (kind === 'knob') {
      s.lineTo(m[0] - d[0] * K, m[1] - d[1] * K);
      // half circle bulging out along n, from -d round to +d
      s.absarc(m[0], m[1], K, ang([-d[0], -d[1]]), ang([-d[0], -d[1]]) + Math.PI, false);
    } else if (kind === 'notch') {
      const c = [m[0] + n[0] * off, m[1] + n[1] * off];
      s.lineTo(m[0] - d[0] * dy, m[1] - d[1] * dy);
      // arc of the circle around c that dips into the body, edge to edge
      s.absarc(c[0], c[1], notchR,
        ang([-n[0] * off - d[0] * dy, -n[1] * off - d[1] * dy]),
        ang([-n[0] * off + d[0] * dy, -n[1] * off + d[1] * dy]), true);
    }
    s.lineTo(b[0] - d[0] * R, b[1] - d[1] * R);
    s.quadraticCurveTo(b[0], b[1], b[0] + dn[0] * R, b[1] + dn[1] * R);
  });
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
  const bodyGeo = (p) => {
    const g = new ExtrudeGeometry(pieceShape(edgesFor(p)), {
      depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL,
      bevelSegments: 6, curveSegments: 40
    });
    // center the body (not the knobs) on the origin so pieces line up by pitch
    g.translate(-W / 2, -H / 2, -DEPTH / 2);
    return g;
  };
  const iconGeo = new PlaneGeometry(0.5, 0.5);
  const icons = await Promise.all(PIECES.map((p) => iconTexture(p.icon)));

  const pieces = PIECES.map((p, i) => {
    const holder = new Group();
    const body = new Mesh(bodyGeo(p), new MeshPhysicalMaterial({
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
    // set (REST_W units wide) still fits.
    const span = 2 * Math.tan((camera.fov * Math.PI) / 360);
    camera.position.z = Math.max(h / (PX_PER_UNIT * span), REST_W / (span * camera.aspect));
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
      const gx = p.col - (COLS - 1) / 2;
      const gy = (ROWS - 1) / 2 - p.row;
      const apartX = gx * (PITCH_X + GAP);
      const togetherX = gx * PITCH_X;
      const apartY = gy * (PITCH_Y + GAP);
      const togetherY = gy * PITCH_Y;
      const bob = reduceMotion ? 0 : Math.sin(t * 1.3 + p.phase) * 0.06 * (1 - m) + Math.sin(t * 1.1) * 0.05 * m;
      const x = apartX + (togetherX - apartX) * m;
      const y = apartY + (togetherY - apartY) * m + bob - (1 - e) * 0.35;
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
