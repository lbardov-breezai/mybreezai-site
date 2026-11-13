// Products page, AI Chat to Shop: the two app screens on real 3D phones.
// Each phone is a bevelled rounded slab with a metal frame (lit by a studio
// environment map), a black glass front, the screenshot as its screen, a
// side buttons and a faint glass sheen. The pair is tilted and
// turned toward each other, floats out of sync, leans toward the pointer and
// rises in the first time it scrolls into view. Renders only while on screen.
// Returns null without WebGL so the CSS phones stay in place.
import {
  ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  Scene, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, WebGLRenderer
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const SCREEN_ASPECT = 760 / 1516;   // width / height of the screenshots
const BEZEL = 0.045;
const SCREEN_W = 1.0;
const SCREEN_H = SCREEN_W / SCREEN_ASPECT;
const W = SCREEN_W + 2 * BEZEL;      // body outline (before bevel)
const H = SCREEN_H + 2 * BEZEL;
const R = 0.17;                      // body corner radius
const DEPTH = 0.07;
const BEVEL = 0.035;
const FRONT_Z = DEPTH / 2 + BEVEL;   // front face of the body

// Resting pose of each phone: turned toward the other, left one higher
const POSES = [
  { x: -0.7, y: -0.06, z: 0, rx: -0.06, ry: 0.42, rz: -0.07, phase: 0 },
  { x: 0.7, y: -0.34, z: -0.2, rx: -0.06, ry: -0.42, rz: 0.07, phase: Math.PI }
];
const VISIBLE_H = 2.55;              // world units shown top to bottom (phones bleed off the bottom)
const MIN_VISIBLE_W = 3.1;           // keep both phones in frame on narrow panels

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);

const roundedRect = (w, h, r) => {
  const s = new Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
};

// Flat rounded rectangle with 0..1 UVs across its bounds (ShapeGeometry uses raw x/y)
const roundedPlane = (w, h, r) => {
  const g = new ShapeGeometry(roundedRect(w, h, r), 32);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  }
  uv.needsUpdate = true;
  return g;
};

const canvasTexture = (w, h, paint) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

// Diagonal glass sheen: brighter top-left, fading out by the middle
const sheenTexture = () => canvasTexture(256, 512, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.20)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.36, 'rgba(255,255,255,0.0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const shadowTexture = () => canvasTexture(256, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0,20,40,0.38)');
  g.addColorStop(0.55, 'rgba(0,20,40,0.14)');
  g.addColorStop(1, 'rgba(0,20,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

export async function mountPhones3D(visual, screens) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pf-phones-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xcfe9ff, 0.8);
  rim.position.set(4, 1, -2);
  scene.add(rim);

  const camera = new PerspectiveCamera(28, 1, 0.1, 50);

  const loader = new TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const load = (src) => new Promise((resolve, reject) => loader.load(src, (t) => {
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = maxAniso;
    resolve(t);
  }, undefined, reject));
  let textures;
  try {
    textures = await Promise.all(screens.map(load));
  } catch (e) {
    renderer.dispose();
    return null;
  }

  // Shared geometry and materials
  const bodyGeo = new ExtrudeGeometry(roundedRect(W, H, R), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL,
    bevelSegments: 10, curveSegments: 48
  });
  bodyGeo.translate(0, 0, -DEPTH / 2);
  const frameMat = new MeshPhysicalMaterial({
    color: new Color('#3B4352'), metalness: 0.85, roughness: 0.28,
    clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.1
  });
  const glassGeo = roundedPlane(W + BEVEL * 1.2, H + BEVEL * 1.2, R + BEVEL * 0.6);
  const glassMat = new MeshPhysicalMaterial({
    color: new Color('#05070B'), metalness: 0, roughness: 0.12,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9
  });
  const screenGeo = roundedPlane(SCREEN_W, SCREEN_H, R - BEZEL * 0.8);
  const sheenMat = new MeshBasicMaterial({ map: sheenTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const buttonMat = frameMat;
  const shadowMat = new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
  const shadowGeo = new PlaneGeometry(1, 1);

  const rig = new Group();          // pointer lean for the pair
  scene.add(rig);

  const phones = POSES.map((pose, i) => {
    const holder = new Group();     // float + entrance
    const phone = new Group();      // resting pose

    phone.add(new Mesh(bodyGeo, frameMat));
    const glass = new Mesh(glassGeo, glassMat);
    glass.position.z = FRONT_Z + 0.001;
    phone.add(glass);
    const screen = new Mesh(screenGeo, new MeshBasicMaterial({ map: textures[i], toneMapped: false }));
    screen.position.z = FRONT_Z + 0.002;
    phone.add(screen);
    const sheen = new Mesh(screenGeo, sheenMat);
    sheen.position.z = FRONT_Z + 0.004;
    phone.add(sheen);

    // Side buttons: action + volume on the left, power on the right
    const sideX = W / 2 + BEVEL;
    [[-1, 0.62, 0.12], [-1, 0.38, 0.22], [-1, 0.1, 0.22], [1, 0.42, 0.34]].forEach(([side, y, len]) => {
      const b = new Mesh(new RoundedBoxGeometry(0.03, len, 0.045, 2, 0.012), buttonMat);
      b.position.set(side * (sideX + 0.008), y, 0);
      phone.add(b);
    });

    phone.rotation.set(pose.rx, pose.ry, pose.rz);
    holder.add(phone);
    holder.position.set(pose.x, pose.y, pose.z);

    const shadow = new Mesh(shadowGeo, shadowMat.clone());
    shadow.scale.set(W * 2.1, H * 1.5, 1);
    shadow.position.set(pose.x + 0.12, pose.y - 0.2, pose.z - 0.55);
    shadow.renderOrder = -1;
    rig.add(shadow);
    rig.add(holder);
    return { pose, holder, shadow };
  });

  visual.classList.add('is-3d');
  visual.appendChild(canvas);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const span = 2 * Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, 0, Math.max(VISIBLE_H / span, MIN_VISIBLE_W / (span * camera.aspect)));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  if (finePointer && !reduceMotion) {
    visual.addEventListener('pointermove', (e) => {
      const r = visual.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    visual.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  }

  let entered = reduceMotion ? 0 : -1;
  let running = false;
  const frame = (now) => {
    if (!running) return;
    const t = now / 1000;
    if (entered < 0) entered = now;
    cx += (tx - cx) * 0.07;
    cy += (ty - cy) * 0.07;
    rig.rotation.set(-0.05 + cy * 0.16, cx * 0.32, 0);

    phones.forEach(({ pose, holder, shadow }, i) => {
      const k = reduceMotion ? 1 : easeOutCubic(clamp01((now - entered - i * 180) / 1100));
      const bob = reduceMotion ? 0 : Math.sin(t * 1.05 + pose.phase) * 0.045;
      holder.position.y = pose.y + bob - (1 - k) * 0.9;
      holder.rotation.x = reduceMotion ? 0 : Math.sin(t * 0.8 + pose.phase) * 0.025;
      holder.rotation.y = reduceMotion ? 0 : Math.cos(t * 0.7 + pose.phase) * 0.03;
      shadow.material.opacity = k;
      shadow.position.y = pose.y - 0.2 + bob * 0.4 - (1 - k) * 0.9;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };

  const io = new IntersectionObserver(([entry]) => {
    const wasRunning = running;
    running = entry.isIntersecting;
    if (running && !wasRunning) requestAnimationFrame(frame);
  }, { threshold: 0.05 });
  io.observe(canvas);

  return { canvas };
}
