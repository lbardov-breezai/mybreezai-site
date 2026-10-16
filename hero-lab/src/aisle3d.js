// G · Aisle, 3D: a grocery aisle in three.js behind the hero copy.
// Products are generated in code (boxes, cans, bottles, jars, bags) with
// painted label textures, drawn as instanced meshes so a full aisle costs a
// few dozen draw calls. The world is periodic: one SEG-long stretch is laid
// out once and repeated, and sliding the world toward the camera modulo SEG
// gives an endless walk. Build: `npm run build` in hero-lab/.
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, Fog,
  Group, HemisphereLight, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshLambertMaterial,
  MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, RepeatWrapping,
  Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, NoToneMapping
} from 'three';

const CREAM = '#FAF9F5';
const SEG = 8;             // length of one repeating stretch of aisle (m)
const COPIES = 3;
const FRONT = 1.1;         // shelf front, distance from aisle center
const SHELF_D = 0.45;      // shelf depth
const BOARDS = [0.12, 0.52, 0.92, 1.32, 1.72]; // shelf tops, bottom up
const TOP = 2.12;
const EYE = 1.42;

// Brand tints: light packs, small hits of color
const BASES = ['#FFFFFF', '#FAF9F5', '#F8F9FA', '#F1F2F5', '#EBF5F5', '#EBF3F4', '#FAF3E5'];
const ACCENTS = ['#178FAE', '#61C5E5', '#F4B642', '#ABD4DC', '#F8E2B6', '#C4E7EF', '#EC9C13', '#52A7C3'];
const VARIANTS = 6;

// Shelf rows (bottom up) and what tends to sit on them
const ROW_TYPES = [
  [['bag', 0.45], ['box', 0.35], ['jar', 0.2]],
  [['can', 0.45], ['jar', 0.3], ['box', 0.25]],
  [['box', 0.5], ['bottle', 0.3], ['can', 0.2]],
  [['box', 0.4], ['bottle', 0.45], ['bag', 0.15]]
];
// Footprint along the shelf (w), height range, depth (d)
const DIMS = {
  box: { w: 0.19, h: [0.24, 0.33], d: 0.07 },
  can: { w: 0.085, h: [0.115, 0.115], d: 0.085 },
  bottle: { w: 0.085, h: [0.27, 0.33], d: 0.085 },
  jar: { w: 0.1, h: [0.13, 0.16], d: 0.1 },
  bag: { w: 0.22, h: [0.25, 0.31], d: 0.09 }
};

// Deterministic randomness so the layout is stable
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------------
// Label textures, painted on a 2D canvas
// ---------------------------------------------------------------------------
const paint = (w, h, fn) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};
const textLines = (g, x, y, w, n, color = 'rgba(112,127,150,.55)') => {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(x, y + i * 14, w * (1 - i * 0.22), 6);
};

const LABELS = {
  box: (base, a1, a2, r) => paint(256, 384, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    if (r < 0.5) {
      g.fillStyle = a1; g.fillRect(0, H * 0.14, W, H * 0.36);
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(W / 2, H * 0.32, W * 0.3, H * 0.1, 0, 0, 7); g.fill();
      g.fillStyle = a2; g.beginPath(); g.ellipse(W / 2, H * 0.32, W * 0.14, H * 0.05, 0, 0, 7); g.fill();
    } else {
      g.fillStyle = a1; g.fillRect(0, 0, W, H * 0.12);
      g.fillStyle = a2; g.beginPath(); g.ellipse(W / 2, H * 0.42, W * 0.34, H * 0.2, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(W * 0.42, H * 0.36, W * 0.1, H * 0.05, -0.5, 0, 7); g.fill();
    }
    textLines(g, W * 0.16, H * 0.66, W * 0.68, 3);
    g.fillStyle = a2; g.fillRect(0, H * 0.88, W, H * 0.05);
  }),
  // Cylinder side wraps all the way around, so bands run horizontally
  can: (base, a1, a2, r) => paint(512, 256, (g, W, H) => {
    g.fillStyle = '#E2E5EA'; g.fillRect(0, 0, W, H);
    g.fillStyle = r < 0.6 ? a1 : base; g.fillRect(0, H * 0.1, W, H * 0.8);
    g.fillStyle = '#fff'; g.fillRect(0, H * 0.4, W, H * 0.22);
    g.fillStyle = a2; g.beginPath(); g.ellipse(W * 0.25, H * 0.51, 40, 22, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(W * 0.75, H * 0.51, 40, 22, 0, 0, 7); g.fill();
  }),
  // Lathe UVs: v runs bottom (0) to top (1); canvas top is the bottle top
  bottle: (base, a1, a2) => paint(512, 512, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = a1; g.fillRect(0, H * 0.32, W, H * 0.3);
    g.fillStyle = '#fff'; g.fillRect(0, H * 0.38, W, H * 0.16);
    g.fillStyle = a2; g.fillRect(W * 0.2, H * 0.43, W * 0.1, H * 0.06); g.fillRect(W * 0.7, H * 0.43, W * 0.1, H * 0.06);
  }),
  jar: (base, a1, a2) => paint(512, 256, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.fillRect(0, H * 0.25, W, H * 0.45);
    g.fillStyle = a1; g.fillRect(0, H * 0.25, W, H * 0.1);
    textLines(g, W * 0.1, H * 0.45, W * 0.3, 2);
    textLines(g, W * 0.6, H * 0.45, W * 0.3, 2);
  }),
  bag: (base, a1, a2, r) => paint(256, 320, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = a1; g.fillRect(0, H * 0.08, W, H * 0.26);
    g.fillStyle = r < 0.5 ? '#F8E2B6' : a2;
    g.beginPath(); g.ellipse(W / 2, H * 0.62, W * 0.3, H * 0.17, 0, 0, 7); g.fill();
    textLines(g, W * 0.2, H * 0.86, W * 0.6, 1);
    // crimp at the top
    g.fillStyle = 'rgba(16,42,80,.06)';
    for (let x = 0; x < W; x += 12) g.fillRect(x, 0, 6, H * 0.05);
  })
};

// ---------------------------------------------------------------------------
// Geometry: unit sized, base at y=0, front facing +z
// ---------------------------------------------------------------------------
const lathe = (profile) => {
  const pts = profile.map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(pts, 28);
};

const GEOMETRY = {
  box: () => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  can: () => new CylinderGeometry(0.5, 0.5, 1, 28).translate(0, 0.5, 0),
  bottle: () => lathe([
    [0.001, 0], [0.42, 0.005], [0.48, 0.03], [0.5, 0.08], [0.5, 0.6], [0.46, 0.68],
    [0.3, 0.76], [0.19, 0.82], [0.17, 0.9], [0.17, 0.93], [0.001, 0.93]
  ]),
  bottleCap: () => new CylinderGeometry(0.19, 0.19, 0.08, 18).translate(0, 0.96, 0),
  jar: () => lathe([
    [0.001, 0], [0.44, 0.005], [0.5, 0.05], [0.5, 0.78], [0.46, 0.84], [0.42, 0.86], [0.001, 0.86]
  ]),
  jarLid: () => new CylinderGeometry(0.45, 0.45, 0.14, 28).translate(0, 0.93, 0),
  // A pillow: a box whose faces bulge in the middle
  bag: () => {
    const geo = new BoxGeometry(1, 1, 1, 6, 8, 2).translate(0, 0.5, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const bulge = (1 - (2 * x) ** 2) * (1 - (2 * y - 1) ** 4);
      p.setZ(i, z * (0.55 + 0.75 * bulge));
      if (y > 0.97) p.setZ(i, z * 0.12);
    }
    geo.computeVertexNormals();
    return geo;
  }
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export function mountAisle3D({ bg, hero, reduceMotion }) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  bg.append(canvas);

  // Keep the copy clear and blend the edges into the page
  const veil = document.createElement('div');
  veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:' +
    'radial-gradient(ellipse 52% 46% at 50% 52%, rgba(250,249,245,1) 0%, rgba(250,249,245,.95) 55%, rgba(250,249,245,0) 100%),' +
    'linear-gradient(to bottom, rgba(250,249,245,1) 70px, rgba(250,249,245,0) 200px),' +
    'linear-gradient(to top, rgba(250,249,245,1) 0%, rgba(250,249,245,0) 30%),' +
    // overall wash so the aisle stays a backdrop to the copy
    'linear-gradient(rgba(250,249,245,.45), rgba(250,249,245,.45))';
  bg.append(veil);

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    canvas.remove(); veil.remove();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.fog = new Fog(new Color(CREAM), 1.8, 11.5);
  const camera = new PerspectiveCamera(50, 1, 0.05, 30);
  camera.position.set(0, EYE, 0);

  scene.add(new HemisphereLight(0xffffff, 0xE2E5EA, 2.1));
  const sun = new DirectionalLight(0xffffff, 0.9);
  sun.position.set(0, 6, 3);
  scene.add(sun);
  // Fill lights that hit each wall's product fronts from across the aisle
  for (const side of [-1, 1]) {
    const fill = new DirectionalLight(0xffffff, 0.75);
    fill.position.set(-side * 3, 2.4, 1);
    fill.target.position.set(side * 2, 1, -2);
    scene.add(fill, fill.target);
  }

  const world = new Group();
  scene.add(world);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const mat = (opts) => keep(new MeshStandardMaterial({ roughness: 0.75, metalness: 0, ...opts }));

  // ---- Fixtures --------------------------------------------------------
  const LEN = SEG * COPIES;
  const fixtureMat = mat({ color: '#FFFFFF', roughness: 0.6 });
  const backMat = mat({ color: '#EDEFF2', roughness: 0.9 });
  const lipMat = mat({ color: '#FFFFFF', roughness: 0.4 });

  const floorTex = paint(256, 256, (g, W, H) => {
    g.fillStyle = '#F3F2EE'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#E2E5EA'; g.lineWidth = 3; g.strokeRect(0, 0, W, H);
  });
  floorTex.wrapS = floorTex.wrapT = RepeatWrapping;
  floorTex.repeat.set(2 * FRONT / 0.55, LEN / 0.55);
  const floor = new Mesh(keep(new PlaneGeometry(2 * FRONT, LEN)), keep(new MeshLambertMaterial({ map: keep(floorTex) })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -LEN / 2 + SEG);
  world.add(floor);

  const ceiling = new Mesh(keep(new PlaneGeometry(2 * FRONT + 1, LEN)), mat({ color: '#F6F7F8' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3, -LEN / 2 + SEG);
  world.add(ceiling);

  const lightMat = keep(new MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 1 }));
  const lightGeo = keep(new PlaneGeometry(0.5, 1.4));
  const nLights = Math.round(LEN / 2);
  const lights = new InstancedMesh(lightGeo, lightMat, nLights);
  const tmp = new Object3D();
  for (let i = 0; i < nLights; i++) {
    tmp.position.set(0, 2.99, SEG - i * 2);
    tmp.rotation.set(Math.PI / 2, 0, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    lights.setMatrixAt(i, tmp.matrix);
  }
  world.add(lights);

  const boxGeo = keep(new BoxGeometry(1, 1, 1));
  for (const side of [-1, 1]) {
    const back = new Mesh(keep(new PlaneGeometry(LEN, TOP)), backMat);
    back.rotation.y = -side * Math.PI / 2;
    back.position.set(side * (FRONT + SHELF_D), TOP / 2, -LEN / 2 + SEG);
    world.add(back);

    for (const y of [...BOARDS, TOP]) {
      const board = new Mesh(boxGeo, fixtureMat);
      board.scale.set(SHELF_D, 0.03, LEN);
      board.position.set(side * (FRONT + SHELF_D / 2), y - 0.015, -LEN / 2 + SEG);
      world.add(board);
      const lip = new Mesh(boxGeo, lipMat);
      lip.scale.set(0.012, 0.05, LEN);
      lip.position.set(side * FRONT, y - 0.04, -LEN / 2 + SEG);
      world.add(lip);
    }
    const kick = new Mesh(boxGeo, backMat);
    kick.scale.set(0.02, BOARDS[0], LEN);
    kick.position.set(side * FRONT, BOARDS[0] / 2, -LEN / 2 + SEG);
    world.add(kick);

    const nPosts = Math.round(LEN / 1.6);
    const posts = new InstancedMesh(boxGeo, fixtureMat, nPosts);
    for (let i = 0; i < nPosts; i++) {
      tmp.position.set(side * (FRONT + SHELF_D / 2), TOP / 2, SEG - i * 1.6);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(SHELF_D, TOP, 0.035);
      tmp.updateMatrix();
      posts.setMatrixAt(i, tmp.matrix);
    }
    world.add(posts);
  }

  // ---- Products --------------------------------------------------------
  // One InstancedMesh per (type, variant). Layout for one SEG, repeated.
  const r = rng(7);
  const slots = {};   // `${type}:${v}` -> array of matrices
  const tagSlots = []; // { m: Matrix4 }
  const pickable = []; // { key, index, tag }
  const add = (key, m) => { (slots[key] = slots[key] || []).push(m); return slots[key].length - 1; };

  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    const rot = q.clone().setFromAxisAngle(up, -side * Math.PI / 2);
    for (let row = 0; row < BOARDS.length - 1; row++) {
      let z = 0;
      while (z < SEG - 0.3) {
        // choose a run: product type, variant, size, count
        let pickT = r(), acc = 0, type = 'box';
        for (const [t, w] of ROW_TYPES[row]) { acc += w; if (pickT <= acc) { type = t; break; } }
        const v = Math.floor(r() * VARIANTS);
        const dim = DIMS[type];
        const h = dim.h[0] + (dim.h[1] - dim.h[0]) * r();
        const n = 2 + Math.floor(r() * 4);
        const stack = type === 'can' ? (r() < 0.55 ? 2 : 1) : 1;
        if (r() < 0.06) { z += dim.w * n * 0.6; continue; } // a gap on the shelf
        const room = BOARDS[row + 1] - BOARDS[row] - 0.05;
        if (h * stack > room) continue;
        for (let c = 0; c < n && z + dim.w < SEG; c++) {
          const zc = z + dim.w / 2;
          const x = side * (FRONT + 0.02 + dim.d / 2);
          for (let s = 0; s < stack; s++) {
            for (let copy = 0; copy < COPIES; copy++) {
              const pos = new Vector3(x, BOARDS[row] + s * h, SEG - zc - copy * SEG);
              const m = new Matrix4().compose(pos, rot, new Vector3(dim.w * 0.94, h, dim.d));
              const index = add(type + ':' + v, m);
              if (c === 0 && s === 0) {
                const tm = new Matrix4().compose(
                  new Vector3(side * (FRONT - 0.008), BOARDS[row] - 0.04, SEG - zc - copy * SEG),
                  rot, new Vector3(Math.min(0.09, dim.w * 0.9), 0.032, 0.006));
                tagSlots.push(tm);
                pickable.push({ key: type + ':' + v, index, tag: tagSlots.length - 1, z: SEG - zc - copy * SEG });
              }
            }
          }
          z += dim.w;
        }
        z += 0.01;
      }
    }
  }

  const meshes = {};
  for (const key in slots) {
    const [type, vs] = key.split(':');
    const v = Number(vs);
    const rr = rng(100 + v * 31 + type.length * 7);
    const base = BASES[Math.floor(rr() * BASES.length)];
    const a1 = ACCENTS[Math.floor(rr() * ACCENTS.length)];
    let a2 = ACCENTS[Math.floor(rr() * ACCENTS.length)];
    if (a2 === a1) a2 = ACCENTS[(ACCENTS.indexOf(a1) + 3) % ACCENTS.length];
    const label = keep(LABELS[type](base, a1, a2, rr()));
    const geo = keep(GEOMETRY[type]());
    let material;
    if (type === 'box') {
      const side = mat({ color: base });
      side.color.multiplyScalar(0.96);
      const front = mat({ map: label, roughness: 0.55 });
      material = [side, side, mat({ color: base }), side, front, side];
    } else if (type === 'can') {
      material = [mat({ map: label, roughness: 0.35, metalness: 0.15 }), mat({ color: '#D7DBE1', roughness: 0.3, metalness: 0.5 }), mat({ color: '#D7DBE1' })];
    } else if (type === 'bottle' || type === 'jar') {
      material = mat({ map: label, roughness: 0.25, metalness: 0.05 });
    } else {
      material = mat({ map: label, roughness: 0.45 });
    }
    const list = slots[key];
    const mesh = new InstancedMesh(geo, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    world.add(mesh);
    meshes[key] = mesh;

    // caps and lids share the product's instance matrices
    if (type === 'bottle' || type === 'jar') {
      const capGeo = keep(type === 'bottle' ? GEOMETRY.bottleCap() : GEOMETRY.jarLid());
      const cap = new InstancedMesh(capGeo, mat({ color: a2, roughness: 0.4 }), list.length);
      list.forEach((m, i) => cap.setMatrixAt(i, m));
      world.add(cap);
      mesh.userData.cap = cap;
    }
  }

  const tags = new InstancedMesh(boxGeo, mat({ color: '#FFFFFF', roughness: 0.5 }), tagSlots.length);
  const white = new Color('#FFFFFF');
  tagSlots.forEach((m, i) => { tags.setMatrixAt(i, m); tags.setColorAt(i, white); });
  world.add(tags);

  // ---- Picks: a product lifts forward and its shelf tag lights up -------
  const TEAL = new Color('#178FAE');
  const GOLD = new Color('#F4B642');
  const active = [];
  let pickCount = 0;
  const pick = () => {
    const camZ = -world.position.z;
    // products 1.4 to 3.2 m ahead are big enough to notice
    const near = pickable.filter((p) => p.z - camZ < -1.4 && p.z - camZ > -3.2 && !active.some((a) => a.p === p));
    if (!near.length) return;
    const p = near[Math.floor(Math.random() * near.length)];
    const mesh = meshes[p.key];
    const base = new Matrix4();
    mesh.getMatrixAt(p.index, base);
    active.push({ p, mesh, base, t0: performance.now(), color: ++pickCount % 6 === 0 ? GOLD : TEAL });
  };

  const pos = new Vector3(), quat = new Quaternion(), scl = new Vector3(), m4 = new Matrix4(), c = new Color();
  const updatePicks = (now) => {
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      const age = now - a.t0;
      const k = age < 400 ? 1 - (1 - age / 400) ** 3 : age > 2800 ? Math.max(0, 1 - (age - 2800) / 500) : 1;
      a.base.decompose(pos, quat, scl);
      pos.y += 0.03 * k;
      pos.x -= Math.sign(pos.x) * 0.05 * k;
      m4.compose(pos, quat, scl);
      a.mesh.setMatrixAt(a.p.index, m4);
      a.mesh.instanceMatrix.needsUpdate = true;
      if (a.mesh.userData.cap) {
        a.mesh.userData.cap.setMatrixAt(a.p.index, m4);
        a.mesh.userData.cap.instanceMatrix.needsUpdate = true;
      }
      tags.setColorAt(a.p.tag, c.copy(white).lerp(a.color, k));
      tags.instanceColor.needsUpdate = true;
      if (age > 3300) {
        a.mesh.setMatrixAt(a.p.index, a.base);
        if (a.mesh.userData.cap) a.mesh.userData.cap.setMatrixAt(a.p.index, a.base);
        tags.setColorAt(a.p.tag, white);
        active.splice(i, 1);
      }
    }
  };

  // ---- Sizing, input, loop --------------------------------------------
  const resize = () => {
    const w = bg.clientWidth, h = bg.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: widen the view so both walls stay in frame
    camera.fov = w / h < 1 ? 70 : 50;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  let travel = 0;
  let lastScroll = window.scrollY;
  const onScroll = () => { travel += Math.abs(window.scrollY - lastScroll) * 0.004; lastScroll = window.scrollY; };
  window.addEventListener('scroll', onScroll, { passive: true });
  let tx = 0, ty = 0, mx = 0, my = 0;
  const onMove = (e) => {
    const rect = bg.getBoundingClientRect();
    tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  hero.addEventListener('pointermove', onMove);

  let inView = true;
  const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; });
  io.observe(hero);

  const lookAt = new Vector3();
  const render = (now) => {
    mx += (tx - mx) * 0.05;
    my += (ty - my) * 0.05;
    camera.position.set(mx * 0.12, EYE - my * 0.06, 0);
    lookAt.set(mx * 0.04, EYE - 0.02, -10);
    camera.lookAt(lookAt);
    world.position.z = travel % SEG;
    updatePicks(now);
    renderer.render(scene, camera);
  };

  let raf = 0;
  let prev = 0;
  let nextPick = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!inView || document.hidden) { prev = 0; return; }
    const dt = prev ? Math.min(64, now - prev) : 16;
    prev = now;
    travel += dt * 0.00035;
    if (now > nextPick) { pick(); nextPick = now + 700 + Math.random() * 600; }
    render(now);
  };

  return {
    start() {
      if (reduceMotion) render(performance.now());
      else raf = requestAnimationFrame(loop);
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      hero.removeEventListener('pointermove', onMove);
      world.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      disposables.forEach((d) => d.dispose && d.dispose());
      renderer.dispose();
      canvas.remove();
      veil.remove();
    }
  };
}
