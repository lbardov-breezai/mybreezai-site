// Hero lab: experimental homepage hero variants.
// ?hero=<key> picks a variant; the switcher (bottom-left) shows on localhost
// on Vercel previews, or whenever ?hero= is in the URL. Variants mount and unmount live, so
// switching doesn't replay the intro. Without ?hero= nothing here runs.
(() => {
  const params = new URLSearchParams(location.search);
  // Localhost and Vercel preview deployments get the lab; the production
  // domain only gets it with an explicit ?hero=
  const isLab = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$|\.vercel\.app$/.test(location.hostname);
  if (!isLab && !params.has('hero')) return;

  const hero = document.getElementById('hero');
  const content = hero && hero.querySelector('.hero-content');
  const title = document.getElementById('heroTitle');
  if (!hero || !content || !title) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const originalTitle = title.innerHTML;

  const el = (tag, className, html) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  };
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  // Resolves once the intro has revealed the hero text
  const whenRevealed = () => new Promise((resolve) => {
    if (title.classList.contains('visible')) return resolve();
    const mo = new MutationObserver(() => {
      if (title.classList.contains('visible')) { mo.disconnect(); resolve(); }
    });
    mo.observe(title, { attributes: true, attributeFilter: ['class'] });
  });

  // Each mount gets a scope: timers and listeners registered through it are
  // torn down on switch.
  const makeScope = () => {
    const cleanups = [];
    let alive = true;
    return {
      get alive() { return alive; },
      wait: (ms) => new Promise((resolve) => {
        const id = setTimeout(resolve, ms);
        cleanups.push(() => clearTimeout(id));
      }),
      on: (target, type, fn, opts) => {
        target.addEventListener(type, fn, opts);
        cleanups.push(() => target.removeEventListener(type, fn, opts));
      },
      frame: (fn) => {
        let id = 0;
        const tick = (t) => { fn(t); id = requestAnimationFrame(tick); };
        id = requestAnimationFrame(tick);
        cleanups.push(() => cancelAnimationFrame(id));
      },
      add: (fn) => cleanups.push(fn),
      dispose: () => { alive = false; cleanups.splice(0).forEach((fn) => fn()); }
    };
  };

  const addBg = (scope, className) => {
    const bg = el('div', 'hl-bg ' + className);
    bg.setAttribute('aria-hidden', 'true');
    hero.prepend(bg);
    scope.add(() => bg.remove());
    return bg;
  };

  // ---------------------------------------------------------------
  // A · PATH: a shopper's route curls around the copy, with a gold dot
  // travelling it and the moments of the trip popping up along the way.
  // ---------------------------------------------------------------
  const pathVariant = async (scope) => {
    const bg = addBg(scope, 'hl-path');
    const svg = svgEl('svg', { viewBox: '0 0 1440 800', preserveAspectRatio: 'xMidYMid slice' });
    const d = 'M -40 330 C 110 330 190 420 200 560 C 210 690 330 742 560 742 L 880 742 C 1110 742 1220 700 1240 560 C 1258 430 1290 300 1410 210';
    const track = svgEl('path', { d, class: 'hl-path-track' });
    const line = svgEl('path', { d, class: 'hl-path-line' });
    const arrow = svgEl('path', { class: 'hl-path-arrow' });
    const halo = svgEl('circle', { r: 14, class: 'hl-path-halo', cx: -99, cy: -99 });
    const dot = svgEl('circle', { r: 6, class: 'hl-path-dot', cx: -99, cy: -99 });
    svg.append(track, line, arrow, halo, dot);
    bg.append(svg);

    const L = line.getTotalLength();
    const end = line.getPointAtLength(L);
    const before = line.getPointAtLength(L - 1);
    const ang = Math.atan2(end.y - before.y, end.x - before.x);
    const head = (a) => `${end.x + 16 * Math.cos(ang + a)} ${end.y + 16 * Math.sin(ang + a)}`;
    arrow.setAttribute('d', `M ${head(Math.PI * 0.8)} L ${end.x} ${end.y} L ${head(-Math.PI * 0.8)}`);

    const STOPS = [
      { t: 0.2, n: '1', text: 'Meal plan for 4, no shellfish' },
      { t: 0.44, n: '2', text: 'Coupon matched' },
      { t: 0.64, n: '3', text: 'Salmon, in stock' },
      { t: 0.86, n: '4', text: 'Added to basket' }
    ];
    const stops = STOPS.map((s) => {
      const pin = el('span', 'hl-stop-pin');
      const tag = el('span', 'hl-stop', `<i>${s.n}</i>${s.text}`);
      bg.append(pin, tag);
      return { ...s, pin, tag, hideAt: 0 };
    });

    const toPx = (len) => {
      const p = line.getPointAtLength(len);
      const m = svg.getScreenCTM();
      const r = bg.getBoundingClientRect();
      return { x: p.x * m.a + m.e - r.left, y: p.y * m.d + m.f - r.top };
    };
    const place = () => stops.forEach((s) => {
      const { x, y } = toPx(s.t * L);
      s.pin.style.left = s.tag.style.left = x + 'px';
      s.pin.style.top = s.tag.style.top = y + 'px';
    });
    place();
    scope.on(window, 'resize', place);

    line.style.strokeDasharray = L;
    line.style.strokeDashoffset = L;
    await whenRevealed();
    if (!scope.alive) return;

    if (reduceMotion) {
      line.style.strokeDashoffset = 0;
      bg.classList.add('is-drawn');
      stops.forEach((s) => s.tag.classList.add('is-on'));
      return;
    }

    const DRAW_MS = 2400;
    const LOOP_MS = 9000;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    let start = 0;
    let lastK = 0;
    scope.frame((now) => {
      if (!start) start = now;
      const elapsed = now - start;
      let k;
      if (elapsed < DRAW_MS) {
        k = ease(elapsed / DRAW_MS);
        line.style.strokeDashoffset = L * (1 - k);
      } else {
        if (!bg.classList.contains('is-drawn')) {
          line.style.strokeDashoffset = 0;
          bg.classList.add('is-drawn');
        }
        k = ((elapsed - DRAW_MS) % LOOP_MS) / LOOP_MS;
      }
      const p = line.getPointAtLength(k * L);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y);
      halo.setAttribute('r', 12 + 4 * Math.sin(now / 300));
      stops.forEach((s) => {
        const passed = lastK < s.t && k >= s.t;
        if (passed) { s.tag.classList.add('is-on'); s.hideAt = now + 2800; }
        if (s.hideAt && now > s.hideAt) { s.tag.classList.remove('is-on'); s.hideAt = 0; }
      });
      lastK = k;
    });
  };

  // ---------------------------------------------------------------
  // B · ASSISTANT: split layout, the copy on the left, a shopping
  // conversation playing on the right with real-looking basket moments.
  // ---------------------------------------------------------------
  const CONVERSATIONS = [
    {
      ask: 'What pairs well with salmon tonight?',
      reply: 'A lemon-dill glaze with roasted asparagus. Everything is in stock at your store:',
      items: [
        ['Atlantic salmon fillet', '1 lb', '$9.99'],
        ['Asparagus', '1 bunch', '$3.49'],
        ['Fresh dill', '0.75 oz', '$1.99']
      ],
      coupon: 'Coupon applied: $0.50 off asparagus'
    },
    {
      ask: 'Dinner for 4 under $25. No dairy, please.',
      reply: 'Sheet-pan chicken fajitas, dairy-free and about $18 for four:',
      items: [
        ['Chicken thighs', '3 lb', '$7.47'],
        ['Bell peppers', '3 ct', '$3.99'],
        ['Flour tortillas', '10 ct', '$2.79']
      ],
      coupon: 'Coupon applied: $1.00 off tortillas'
    },
    {
      ask: "We're out of breakfast stuff. What's on my usual list?",
      reply: 'Here are the items you buy most weeks:',
      items: [
        ['Large eggs', '12 ct', '$3.29'],
        ['Rolled oats', '42 oz', '$4.49'],
        ['Blueberries', '1 pint', '$3.99']
      ],
      coupon: 'Coupon applied: $0.75 off blueberries'
    }
  ];

  const assistantVariant = async (scope) => {
    addBg(scope, 'hl-assistant-bg');
    const chat = el('div', 'hl-chat hl-side', `
      <div class="hl-chat-head">
        <span>Shopping assistant</span>
        <span class="hl-chat-basket">Basket <b>0</b></span>
      </div>
      <div class="hl-chat-body"></div>`);
    chat.setAttribute('aria-hidden', 'true');
    content.append(chat);
    scope.add(() => chat.remove());
    window.dispatchEvent(new Event('resize'));

    const body = chat.querySelector('.hl-chat-body');
    const count = chat.querySelector('.hl-chat-basket b');
    let basket = 0;

    await whenRevealed();
    if (!scope.alive) return;
    await scope.wait(500);
    chat.classList.add('is-in');

    const typeInto = async (node, text) => {
      for (let i = 1; i <= text.length && scope.alive; i++) {
        node.textContent = text.slice(0, i);
        await scope.wait(reduceMotion ? 0 : 28);
      }
    };

    for (let round = 0; scope.alive; round++) {
      const c = CONVERSATIONS[round % CONVERSATIONS.length];
      body.classList.remove('is-clearing');
      body.replaceChildren();

      const me = el('div', 'hl-msg hl-msg--me');
      body.append(me);
      await typeInto(me, c.ask);
      await scope.wait(500);

      const typing = el('div', 'hl-typing', '<span></span><span></span><span></span>');
      body.append(typing);
      await scope.wait(1300);
      typing.remove();
      body.append(el('div', 'hl-msg hl-msg--ai', c.reply));
      await scope.wait(500);

      const list = el('div', 'hl-items', c.items.map(([name, size, price]) =>
        `<div class="hl-item"><span class="hl-item-name">${name}<small>${size}</small></span>` +
        `<span class="hl-item-price">${price}</span><span class="hl-item-add">+</span></div>`).join(''));
      body.append(list);
      await scope.wait(900);

      for (const add of list.querySelectorAll('.hl-item-add')) {
        if (!scope.alive) return;
        add.classList.add('is-added');
        add.textContent = '✓';
        count.textContent = ++basket;
        count.classList.add('is-bump');
        await scope.wait(220);
        count.classList.remove('is-bump');
        await scope.wait(380);
      }
      await scope.wait(300);
      body.append(el('div', 'hl-coupon', c.coupon));
      await scope.wait(3800);
      body.classList.add('is-clearing');
      await scope.wait(500);
    }
  };

  // ---------------------------------------------------------------
  // C · KINETIC: one oversized line, the last word cycles through what
  // the grocer gets to keep.
  // ---------------------------------------------------------------
  const kineticVariant = async (scope) => {
    addBg(scope, 'hl-kinetic-bg');
    const WORDS = ['shop', 'basket', 'loyalty', 'data', 'relationship'];
    title.innerHTML =
      '<span class="hero-line">Own the <span class="hl-rot-wrap"><span class="hl-rot">' +
      WORDS.map((w, i) => `<span class="hl-rot-word${i ? ' is-below' : ''}">${w}</span>`).join('') +
      '</span><svg class="hl-underline" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M3 13 C 50 5, 130 4, 197 10"/></svg></span></span>';
    title.setAttribute('aria-label', 'Own the shop');
    scope.add(() => { title.innerHTML = originalTitle; title.removeAttribute('aria-label'); });

    const rot = title.querySelector('.hl-rot');
    const words = [...rot.children];
    const underline = title.querySelector('.hl-underline path');
    let current = 0;
    const uLen = underline.getTotalLength();
    underline.style.strokeDasharray = uLen;
    underline.style.strokeDashoffset = uLen;

    const wordWidth = (w) => {
      const r = document.createRange();
      r.selectNodeContents(w);
      return r.getBoundingClientRect().width;
    };
    const fit = (i) => { rot.style.width = wordWidth(words[i]) + 'px'; };
    fit(0);
    scope.on(window, 'resize', () => fit(current));
    if (document.fonts) document.fonts.ready.then(() => scope.alive && fit(current));
    window.dispatchEvent(new Event('resize'));

    const drawUnderline = () => {
      underline.style.transition = 'none';
      underline.style.strokeDashoffset = uLen;
      underline.getBoundingClientRect();
      underline.style.transition = 'stroke-dashoffset .8s cubic-bezier(.65,0,.35,1)';
      underline.style.strokeDashoffset = 0;
    };

    await whenRevealed();
    if (!scope.alive) return;
    await scope.wait(700);
    drawUnderline();
    if (reduceMotion) return;

    while (scope.alive) {
      await scope.wait(2600);
      if (!scope.alive) return;
      if (document.hidden) continue;
      const next = (current + 1) % WORDS.length;
      words[current].classList.add('is-above');
      words[next].classList.remove('is-below', 'is-above');
      fit(next);
      const prev = current;
      current = next;
      drawUnderline();
      await scope.wait(750);
      words[prev].classList.remove('is-above');
      words[prev].classList.add('is-below');
    }
  };

  // ---------------------------------------------------------------
  // D · SHELVES: a hairline grid around the copy that keeps tuning
  // itself to a shopper, cell by cell, and lights up under the cursor.
  // ---------------------------------------------------------------
  const CHIPS = [
    ['No shellfish'], ['Family of 4'], ['$0.50 off', 'gold'], ['Gluten-free'], ['In stock'],
    ['Weekly budget $150'], ['Back on your list'], ['Picked for you'], ['Low sodium'],
    ['$1.00 off', 'gold'], ['Added to basket'], ['Taco night'], ['Kid friendly'], ['Ready in 20 min']
  ];

  const shelvesVariant = async (scope) => {
    const bg = addBg(scope, 'hl-shelves');
    const grid = el('div', 'hl-shelves-grid');
    const glow = el('div', 'hl-shelves-glow');
    const layer = el('div');
    bg.append(glow, grid, layer);

    let cell = 88;
    let W = 0;
    let H = 0;
    let ox = 0;
    let oy = 0;
    const measure = () => {
      cell = parseFloat(getComputedStyle(bg).getPropertyValue('--cell')) || 88;
      W = bg.clientWidth;
      H = bg.clientHeight;
      ox = (W / 2) % cell;
      oy = (H / 2) % cell;
      grid.style.setProperty('--ox', ox + 'px');
      grid.style.setProperty('--oy', oy + 'px');
    };
    measure();
    scope.on(window, 'resize', measure);

    scope.on(hero, 'pointermove', (e) => {
      const r = bg.getBoundingClientRect();
      glow.style.setProperty('--mx', e.clientX - r.left + 'px');
      glow.style.setProperty('--my', e.clientY - r.top + 'px');
    });
    scope.on(hero, 'pointerleave', () => {
      glow.style.setProperty('--mx', '-999px');
      glow.style.setProperty('--my', '-999px');
    });

    // A cell is usable when it sits clearly outside the clear ellipse
    // around the copy, below the navbar and above the fade.
    const mobile = () => W <= 760;
    const usable = (cx, cy) => {
      const rx = W * (mobile() ? 0.6 : 0.46) * 0.78;
      const ry = H * (mobile() ? 0.4 : 0.44) * 0.78;
      const nx = (cx - W / 2) / rx;
      const ny = (cy - H * 0.52) / ry;
      return nx * nx + ny * ny > 1 && cy > 220 && cy < H * 0.78 && cx > cell * 0.6 && cx < W - cell * 0.6;
    };
    const busy = new Set();
    let chipIndex = 0;

    const spawn = async () => {
      for (let tries = 0; tries < 40; tries++) {
        const col = Math.floor(Math.random() * Math.ceil(W / cell));
        const row = Math.floor(Math.random() * Math.ceil(H / cell));
        const key = col + ':' + row;
        const x = ox + col * cell;
        const y = oy + row * cell;
        const cx = x + cell / 2;
        const cy = y + cell / 2;
        if (busy.has(key) || !usable(cx, cy)) continue;
        busy.add(key);
        const [text, tone] = CHIPS[chipIndex++ % CHIPS.length];
        const flash = el('div', 'hl-cell-flash');
        flash.style.left = x + 1 + 'px';
        flash.style.top = y + 1 + 'px';
        flash.style.width = flash.style.height = cell - 1 + 'px';
        const chip = el('span', 'hl-chip' + (tone ? ' hl-chip--' + tone : ''), text);
        chip.style.left = cx + 'px';
        chip.style.top = cy + 'px';
        layer.append(flash, chip);
        requestAnimationFrame(() => { flash.classList.add('is-on'); chip.classList.add('is-on'); });
        await scope.wait(2600 + Math.random() * 1200);
        flash.classList.remove('is-on');
        chip.classList.remove('is-on');
        await scope.wait(600);
        flash.remove();
        chip.remove();
        busy.delete(key);
        return;
      }
    };

    await whenRevealed();
    if (!scope.alive) return;
    if (reduceMotion) { for (let i = 0; i < 5; i++) spawn(); return; }
    while (scope.alive) {
      if (!document.hidden && busy.size < (mobile() ? 3 : 6)) spawn();
      await scope.wait(650 + Math.random() * 500);
    }
  };

  // ---------------------------------------------------------------
  // E · SHOPPERS: the same store, a different shelf for every shopper.
  // A deck of personalized storefront cards deals itself on a loop.
  // ---------------------------------------------------------------
  const SHOPPERS = [
    {
      hello: 'Good evening, Joe', tags: ['Family of 4', 'Taco Tuesday'],
      items: [['Ground beef', '1 lb', '$4.99'], ['Taco shells', '12 ct', '$2.29'], ['Avocados', '3 ct', '$3.99']],
      coupon: '$1.00 off taco shells'
    },
    {
      hello: 'Hi Maria', tags: ['Gluten-free', 'Cooks for 2'],
      items: [['Gluten-free penne', '12 oz', '$3.49'], ['Cherry tomatoes', '1 pint', '$2.99'], ['Fresh basil', '0.75 oz', '$1.99']],
      coupon: '$0.50 off gluten-free pasta'
    },
    {
      hello: 'Morning, Sam', tags: ['$80 weekly budget', 'Meal prep'],
      items: [['Chicken thighs', '3 lb', '$7.47'], ['Brown rice', '2 lb', '$2.19'], ['Broccoli crowns', '1 lb', '$1.79']],
      coupon: '$0.75 off chicken thighs'
    }
  ];

  const shoppersVariant = async (scope) => {
    addBg(scope, 'hl-shoppers-bg');
    const deck = el('div', 'hl-deck hl-side');
    deck.setAttribute('aria-hidden', 'true');
    const cards = SHOPPERS.map((sh, i) => {
      const card = el('div', 'hl-card', `
        <div class="hl-card-store"><span>Your store</span><span>Picked for you</span></div>
        <div class="hl-card-body">
          <div class="hl-card-hello">${sh.hello}</div>
          <div class="hl-card-tags">${sh.tags.map((t) => `<span>${t}</span>`).join('')}</div>
          <div class="hl-card-label">This week's picks</div>
          <div class="hl-items">${sh.items.map(([name, size, price]) =>
            `<div class="hl-item"><span class="hl-item-name">${name}<small>${size}</small></span>` +
            `<span class="hl-item-price">${price}</span><span class="hl-item-add">+</span></div>`).join('')}</div>
          <div class="hl-coupon">${sh.coupon}</div>
        </div>`);
      card.dataset.pos = i;
      deck.append(card);
      return card;
    });
    content.append(deck);
    scope.add(() => deck.remove());
    window.dispatchEvent(new Event('resize'));

    await whenRevealed();
    if (!scope.alive) return;
    await scope.wait(500);
    deck.classList.add('is-in');
    if (reduceMotion) return;

    while (scope.alive) {
      await scope.wait(4200);
      if (!scope.alive) return;
      if (document.hidden) continue;
      const front = cards.find((c) => c.dataset.pos === '0');
      front.classList.add('is-leaving');
      await scope.wait(450);
      cards.forEach((c) => { if (c !== front) c.dataset.pos = Number(c.dataset.pos) - 1; });
      front.dataset.pos = cards.length - 1;
      front.classList.remove('is-leaving');
    }
  };

  // ---------------------------------------------------------------
  // F · AISLE: a hairline grocery aisle in perspective, vanishing behind
  // the headline. You drift down it (faster as you scroll), and shelf
  // items light up as they get picked for a shopper.
  // ---------------------------------------------------------------
  const aisleVariant = async (scope) => {
    const bg = addBg(scope, 'hl-aisle');
    const canvas = el('canvas');
    bg.append(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = bg.clientWidth;
      H = bg.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    };
    size();
    scope.on(window, 'resize', size);

    const SLOT = 0.13;
    const Z_NEAR = 0.45;
    const Z_FAR = 5;
    const SHELVES = [-0.62, -0.31, 0, 0.31, 0.62];
    const hash = (a, b, c) => {
      let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };

    let travel = 0;
    let lastScroll = window.scrollY;
    let mx = 0, my = 0, tx = 0, ty = 0;
    scope.on(window, 'scroll', () => {
      travel += Math.abs(window.scrollY - lastScroll) * 0.002;
      lastScroll = window.scrollY;
    }, { passive: true });
    scope.on(hero, 'pointermove', (e) => {
      const r = bg.getBoundingClientRect();
      tx = ((e.clientX - r.left) / W - 0.5) * -60;
      ty = ((e.clientY - r.top) / H - 0.5) * -30;
    });

    // Items currently lit up for a shopper: key -> { t0, gold }
    const lit = new Map();

    const draw = (now) => {
      mx += (tx - mx) * 0.06;
      my += (ty - my) * 0.06;
      const f = Math.max(W * 0.3, 260);
      const vx = W / 2 + mx;
      const vy = H * 0.5 + my;
      const P = (x, y, z) => [vx + (x * f) / z, vy + (y * f * 0.85) / z];
      const fade = (z) => Math.max(0, Math.min(1, (Z_FAR - z) / (Z_FAR * 0.7))) * Math.max(0, Math.min(1, (z - Z_NEAR) * 6));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;

      // Shelf edges and floor/ceiling lines, both walls
      for (const side of [-1, 1]) {
        for (const y of [-0.85, ...SHELVES, 0.85]) {
          const [x1, y1] = P(side, y, Z_NEAR);
          const [x2, y2] = P(side, y, Z_FAR);
          const g = ctx.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, 'rgba(207,212,220,1)');
          g.addColorStop(1, 'rgba(207,212,220,0)');
          ctx.strokeStyle = g;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }

      const first = Math.ceil((travel + Z_NEAR) / SLOT);
      const last = Math.floor((travel + Z_FAR) / SLOT);
      // Far to near so nearer items paint over farther ones
      for (let i = last; i >= first; i--) {
        const z = i * SLOT - travel;
        const a = fade(z);
        if (a <= 0.01) continue;
        // Upright every 4 slots, moving with you
        if (i % 9 === 0) {
          for (const side of [-1, 1]) {
            const [x1, y1] = P(side, -0.85, z);
            const [, y2] = P(side, 0.85, z);
            ctx.strokeStyle = `rgba(207,212,220,${a})`;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); ctx.stroke();
          }
        }
        for (const side of [-1, 1]) {
          for (let row = 1; row < SHELVES.length; row++) {
            const r = hash(i, row, side + 2);
            if (r < 0.1) continue; // gaps on the shelf
            const depth = SLOT * (0.72 + 0.2 * hash(i, row, side + 7));
            const height = 0.31 * (0.4 + 0.45 * hash(i, row, side + 11));
            const yb = SHELVES[row] - 0.012;
            const z2 = z + depth;
            const [ax, ay] = P(side, yb, z);
            const [bx, by] = P(side, yb, z2);
            const [cx, cy] = P(side, yb - height, z2);
            const [dx, dy] = P(side, yb - height, z);
            const key = side + ':' + row + ':' + i;
            const l = lit.get(key);
            let k = 0;
            if (l) {
              const age = now - l.t0;
              k = age < 400 ? age / 400 : age > 2600 ? Math.max(0, 1 - (age - 2600) / 500) : 1;
              if (age > 3100) lit.delete(key);
            }
            const fill = l && l.gold ? [250, 243, 229] : [235, 243, 244];
            const stroke = l && l.gold ? [244, 182, 66] : [23, 143, 174];
            const base = 241;
            ctx.fillStyle = `rgba(${base + (fill[0] - base) * k},${242 + (fill[1] - 242) * k},${245 + (fill[2] - 245) * k},${a})`;
            ctx.strokeStyle = k > 0
              ? `rgba(${stroke[0]},${stroke[1]},${stroke[2]},${a * (0.25 + 0.75 * k)})`
              : `rgba(207,212,220,${a})`;
            ctx.beginPath();
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath();
            ctx.fill(); ctx.stroke();
          }
        }
      }

      // Keep the copy clear: a soft cream ellipse around the vanishing point
      ctx.save();
      ctx.translate(W / 2, H * 0.5);
      ctx.scale(Math.max(1.4, W / H * 0.9), 1);
      const rr = H * 0.36;
      const clear = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      clear.addColorStop(0, 'rgba(250,249,245,1)');
      clear.addColorStop(0.55, 'rgba(250,249,245,0.92)');
      clear.addColorStop(1, 'rgba(250,249,245,0)');
      ctx.fillStyle = clear;
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ctx.restore();

      // Fade into the page at the bottom
      const bottom = ctx.createLinearGradient(0, H * 0.72, 0, H);
      bottom.addColorStop(0, 'rgba(250,249,245,0)');
      bottom.addColorStop(1, 'rgba(250,249,245,1)');
      ctx.fillStyle = bottom;
      ctx.fillRect(0, H * 0.72, W, H * 0.28);
    };

    // Pick a visible shelf item (mid-depth, so it's readable) to light up
    let picks = 0;
    const pick = () => {
      const zMin = 0.7, zMax = 1.1;
      const i = Math.floor((travel + zMin + Math.random() * (zMax - zMin)) / SLOT);
      const side = Math.random() < 0.5 ? -1 : 1;
      const row = 1 + Math.floor(Math.random() * (SHELVES.length - 1));
      if (hash(i, row, side + 2) < 0.1) return;
      lit.set(side + ':' + row + ':' + i, { t0: performance.now(), gold: ++picks % 7 === 0 });
    };

    await whenRevealed();
    if (!scope.alive) return;
    if (reduceMotion) { draw(0); return; }
    let prev = 0;
    scope.frame((now) => {
      const dt = prev ? Math.min(64, now - prev) : 16;
      prev = now;
      travel += dt * 0.00012;
      draw(now);
    });
    while (scope.alive) {
      await scope.wait(500 + Math.random() * 500);
      if (!document.hidden) pick();
    }
  };

  // ---------------------------------------------------------------
  // G · AISLE, REALISTIC: same idea as F, built like a real aisle.
  // Shelves with front lips and uprights, products as boxes with depth
  // and labels, runs of identical facings, a tiled floor and ceiling
  // lights. Picked items get a teal shelf tag.
  // ---------------------------------------------------------------
  const aisleCanvasVariant = async (scope) => {
    const bg = addBg(scope, 'hl-aisle');
    const canvas = el('canvas');
    bg.append(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = bg.clientWidth;
      H = bg.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    };
    size();
    scope.on(window, 'resize', size);

    const SLOT = 0.12;
    const Z_NEAR = 0.42;
    const Z_FAR = 5.5;
    const BOARDS = [0.92, 0.5, 0.08, -0.34, -0.76]; // shelf tops, floor up
    const SHELF_FRONT = 0.8;  // lip plane (distance from aisle center)
    const BACK = 1.0;         // back of the shelving
    const FLOOR = 1.0;
    const CEIL = -1.25;
    const CREAM = [250, 249, 245];
    // Brand tints for packaging, weighted toward neutrals
    const PACK = [
      [226, 229, 234], [207, 212, 220], [241, 242, 245], [255, 255, 255],
      [226, 229, 234], [207, 212, 220], [241, 242, 245], [255, 255, 255],
      [235, 243, 244], [171, 212, 220], [235, 245, 245], [196, 231, 239],
      [179, 187, 199], [250, 243, 229]
    ];
    const WASH = 0.72; // overall strength, so the aisle stays a backdrop

    const hash = (a, b, c) => {
      let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    // Mix a color toward the cream page by (1 - a): distance fog
    const fog = (c, a, shade = 1) => {
      a *= WASH;
      const m = (i) => Math.round(CREAM[i] + (Math.min(255, c[i] * shade) - CREAM[i]) * a);
      return `rgb(${m(0)},${m(1)},${m(2)})`;
    };

    let travel = 0;
    let lastScroll = window.scrollY;
    let mx = 0, my = 0, tx = 0, ty = 0;
    scope.on(window, 'scroll', () => {
      travel += Math.abs(window.scrollY - lastScroll) * 0.002;
      lastScroll = window.scrollY;
    }, { passive: true });
    scope.on(hero, 'pointermove', (e) => {
      const r = bg.getBoundingClientRect();
      tx = ((e.clientX - r.left) / W - 0.5) * -50;
      ty = ((e.clientY - r.top) / H - 0.5) * -24;
    });

    // ---- Packaging -------------------------------------------------
    // Light packs with small hits of brand color, like a real shelf seen
    // from a few steps away.
    const BASES = [
      [255, 255, 255], [250, 249, 245], [248, 249, 250], [241, 242, 245],
      [235, 245, 245], [235, 243, 244], [250, 243, 229], [226, 229, 234]
    ];
    const ACCENTS = [
      [23, 143, 174], [97, 197, 229], [244, 182, 66], [171, 212, 220],
      [171, 212, 220], [248, 226, 182], [196, 231, 239], [236, 156, 19]
    ];
    const TYPES = [
      [['bag', 0.4], ['box', 0.4], ['jar', 0.2]],
      [['can', 0.45], ['jar', 0.3], ['box', 0.25]],
      [['box', 0.5], ['bottle', 0.3], ['can', 0.2]],
      [['box', 0.4], ['bottle', 0.4], ['bag', 0.2]]
    ];
    const DEPTH = { box: 0.88, can: 0.7, bottle: 0.58, jar: 0.78, bag: 0.92 };
    const packCache = new Map();
    const packFor = (run, row, side, room) => {
      const key = run + ':' + row + ':' + side;
      let p = packCache.get(key);
      if (p) return p;
      const r = (n) => hash(run, row * 13 + n, side + 40);
      let acc = 0;
      const pickT = r(1);
      let type = 'box';
      for (const [t, w] of TYPES[row]) { acc += w; if (pickT <= acc) { type = t; break; } }
      const hFrac = { box: 0.62 + 0.28 * r(2), can: r(2) < 0.5 ? 0.9 : 0.46, bottle: 0.8 + 0.12 * r(2),
        jar: 0.45 + 0.12 * r(2), bag: 0.6 + 0.2 * r(2) }[type];
      p = {
        type,
        h: room * hFrac,
        d: SLOT * DEPTH[type],
        stack: type === 'can' && hFrac > 0.8 ? 2 : 1,
        base: BASES[Math.floor(r(3) * BASES.length)],
        accent: ACCENTS[Math.floor(r(4) * ACCENTS.length)],
        accent2: ACCENTS[Math.floor(r(5) * ACCENTS.length)],
        variant: r(6)
      };
      if (packCache.size > 4000) packCache.clear();
      packCache.set(key, p);
      return p;
    };

    // Map the unit square (u along the shelf, v top to bottom) onto a
    // pack's front face, so shapes can be drawn flat and land in 3D.
    const toFace = (q) => {
      const [tl, tr, , bl] = q;
      ctx.setTransform(dpr * (tr[0] - tl[0]), dpr * (tr[1] - tl[1]),
        dpr * (bl[0] - tl[0]), dpr * (bl[1] - tl[1]), dpr * tl[0], dpr * tl[1]);
    };
    const toScreen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rect = (u1, v1, u2, v2, fill) => { ctx.fillStyle = fill; ctx.fillRect(u1, v1, u2 - u1, v2 - v1); };
    const ellipse = (cu, cv, ru, rv, fill) => {
      ctx.beginPath(); ctx.ellipse(cu, cv, ru, rv, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    };
    const cylinder = (c, a, u1, u2) => {
      const g = ctx.createLinearGradient(u1, 0, u2, 0);
      g.addColorStop(0, fog(c, a, 0.86));
      g.addColorStop(0.35, fog(c, a, 1.06));
      g.addColorStop(1, fog(c, a, 0.84));
      return g;
    };
    const textBars = (u1, v, a, n = 2) => {
      for (let t = 0; t < n; t++) rect(u1, v + t * 0.06, 1 - u1 - t * 0.12, v + t * 0.06 + 0.025, `rgba(145,157,175,${0.4 * a})`);
    };

    // Each shape builds its outline path in face space; fills happen there
    // too, then the outline is stroked in screen space at 1px.
    const SHAPES = {
      box(s, a) {
        const path = () => { ctx.beginPath(); ctx.rect(0, 0, 1, 1); };
        path(); ctx.fillStyle = fog(s.base, a); ctx.fill();
        if (s.variant < 0.5) {
          rect(0, 0.16, 1, 0.5, fog(s.accent, a));
          ellipse(0.5, 0.33, 0.26, 0.11, fog([255, 255, 255], a));
        } else {
          rect(0, 0, 1, 0.12, fog(s.accent, a));
          ellipse(0.5, 0.42, 0.3, 0.18, fog(s.accent2, a, 1.05));
        }
        rect(0, 0.86, 1, 0.92, fog(s.accent2, a));
        textBars(0.18, 0.62, a);
        return path;
      },
      can(s, a) {
        const n = s.stack;
        const path = () => {
          ctx.beginPath();
          for (let c = 0; c < n; c++) ctx.rect(0.06, c / n + 0.02, 0.88, 1 / n - 0.02);
        };
        for (let c = 0; c < n; c++) {
          const v1 = c / n + 0.02;
          const v2 = (c + 1) / n;
          const hh = v2 - v1;
          rect(0.06, v1, 0.94, v2, cylinder([226, 229, 234], a, 0.06, 0.94));
          rect(0.06, v1 + hh * 0.14, 0.94, v2 - hh * 0.1, cylinder(s.variant < 0.6 ? s.accent : s.base, a, 0.06, 0.94));
          rect(0.06, v1 + hh * 0.42, 0.94, v1 + hh * 0.62, cylinder([255, 255, 255], a, 0.06, 0.94));
          ellipse(0.5, v1, 0.44, 0.025, fog([207, 212, 220], a));
        }
        return path;
      },
      bottle(s, a) {
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(0.41, 0.05);
          ctx.lineTo(0.41, 0.24);
          ctx.quadraticCurveTo(0.12, 0.3, 0.12, 0.42);
          ctx.lineTo(0.12, 0.97);
          ctx.quadraticCurveTo(0.12, 1, 0.18, 1);
          ctx.lineTo(0.82, 1);
          ctx.quadraticCurveTo(0.88, 1, 0.88, 0.97);
          ctx.lineTo(0.88, 0.42);
          ctx.quadraticCurveTo(0.88, 0.3, 0.59, 0.24);
          ctx.lineTo(0.59, 0.05);
          ctx.closePath();
        };
        path(); ctx.fillStyle = cylinder(s.variant < 0.5 ? [235, 245, 245] : s.base, a, 0.12, 0.88); ctx.fill();
        rect(0.39, 0, 0.61, 0.08, fog(s.accent2, a));
        rect(0.12, 0.5, 0.88, 0.78, fog(s.accent, a));
        rect(0.2, 0.58, 0.8, 0.7, fog([255, 255, 255], a));
        return path;
      },
      jar(s, a) {
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(0.16, 0.04); ctx.lineTo(0.84, 0.04); ctx.lineTo(0.84, 0.18);
          ctx.quadraticCurveTo(0.92, 0.2, 0.92, 0.3); ctx.lineTo(0.92, 0.94);
          ctx.quadraticCurveTo(0.92, 1, 0.84, 1); ctx.lineTo(0.16, 1);
          ctx.quadraticCurveTo(0.08, 1, 0.08, 0.94); ctx.lineTo(0.08, 0.3);
          ctx.quadraticCurveTo(0.08, 0.2, 0.16, 0.18); ctx.closePath();
        };
        path(); ctx.fillStyle = cylinder(s.variant < 0.5 ? [250, 243, 229] : [235, 243, 244], a, 0.08, 0.92); ctx.fill();
        rect(0.16, 0.04, 0.84, 0.18, cylinder(s.accent2, a, 0.16, 0.84));
        rect(0.08, 0.42, 0.92, 0.8, fog([255, 255, 255], a));
        rect(0.08, 0.42, 0.92, 0.5, fog(s.accent, a));
        textBars(0.22, 0.6, a, 2);
        return path;
      },
      bag(s, a) {
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(0.04, 0.06);
          for (let t = 0; t <= 8; t++) ctx.lineTo(0.04 + t * 0.115, t % 2 ? 0 : 0.06);
          ctx.lineTo(0.96, 0.92);
          ctx.quadraticCurveTo(0.96, 1, 0.88, 1);
          ctx.lineTo(0.12, 1);
          ctx.quadraticCurveTo(0.04, 1, 0.04, 0.92);
          ctx.closePath();
        };
        path(); ctx.fillStyle = cylinder(s.base, a, 0.04, 0.96); ctx.fill();
        rect(0.04, 0.1, 0.96, 0.34, fog(s.accent, a));
        ellipse(0.5, 0.64, 0.28, 0.17, fog(s.variant < 0.5 ? [248, 226, 182] : s.accent2, a));
        textBars(0.2, 0.86, a, 1);
        return path;
      }
    };

    const drawPack = (face, spec, a, highlight) => {
      toFace(face);
      const path = SHAPES[spec.type](spec, a);
      path();
      toScreen();
      ctx.lineWidth = highlight ? 1.5 : 1;
      ctx.strokeStyle = highlight || `rgba(179,187,199,${a * 0.55})`;
      ctx.stroke();
      ctx.lineWidth = 1;
    };

    const lit = new Map();

    const draw = (now) => {
      mx += (tx - mx) * 0.06;
      my += (ty - my) * 0.06;
      const f = Math.max(W * 0.3, 260);
      const vx = W / 2 + mx;
      const vy = H * 0.5 + my;
      const P = (x, y, z) => [vx + (x * f) / z, vy + (y * f) / z];
      const fade = (z) => Math.max(0, Math.min(1, (Z_FAR - z) / (Z_FAR * 0.75))) * Math.max(0, Math.min(1, (z - Z_NEAR) * 6));
      const poly = (pts, fill, stroke) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgb(250,249,245)';
      ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 1;

      const first = Math.ceil((travel + Z_NEAR) / SLOT);
      const last = Math.floor((travel + Z_FAR) / SLOT);

      // Floor: lengthwise tile joints, then crosswise ones that move with you
      for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const [x1, y1] = P(x, FLOOR, Z_NEAR);
        const [x2, y2] = P(x, FLOOR, Z_FAR);
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, 'rgba(207,212,220,.9)');
        g.addColorStop(1, 'rgba(207,212,220,0)');
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      const TILE = 0.4;
      for (let t = Math.ceil((travel + Z_NEAR) / TILE); t * TILE - travel < Z_FAR; t++) {
        const z = t * TILE - travel;
        const a = fade(z) * 0.9;
        const [x1, y1] = P(-SHELF_FRONT, FLOOR, z);
        const [x2] = P(SHELF_FRONT, FLOOR, z);
        ctx.strokeStyle = `rgba(207,212,220,${a})`;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
      }

      // Ceiling light panels
      const LIGHT = 1.1;
      for (let t = Math.floor((travel + Z_FAR) / LIGHT); t * LIGHT - travel > Z_NEAR - 0.5; t--) {
        const z = t * LIGHT - travel;
        if (z < Z_NEAR) continue;
        const a = fade(z);
        const z2 = z + 0.5;
        poly([P(-0.22, CEIL, z), P(0.22, CEIL, z), P(0.22, CEIL, z2), P(-0.22, CEIL, z2)],
          fog([255, 255, 255], a), `rgba(196,231,239,${a})`);
      }

      // Shelving, one wall at a time, far to near
      for (const side of [-1, 1]) {
        const sx = (v) => side * v;

        // Uprights (end posts) every 8 slots
        for (let i = last; i >= first; i--) {
          if (i % 8 !== 0) continue;
          const z = i * SLOT - travel;
          const a = fade(z);
          if (a <= 0.01) continue;
          poly([P(sx(SHELF_FRONT), CEIL + 0.25, z), P(sx(SHELF_FRONT), FLOOR, z),
            P(sx(SHELF_FRONT), FLOOR, z + 0.03), P(sx(SHELF_FRONT), CEIL + 0.25, z + 0.03)],
          fog([226, 229, 234], a), `rgba(179,187,199,${a})`);
        }

        for (let i = last; i >= first; i--) {
          const z = i * SLOT - travel;
          const a = fade(z);
          if (a <= 0.01) continue;
          for (let row = 0; row < BOARDS.length - 1; row++) {
            const run = Math.floor((i + Math.floor(hash(row, side, 3) * 5)) / 3);
            if (hash(run, row, side + 2) < 0.07) continue; // empty spot on the shelf
            const yb = BOARDS[row];
            const room = BOARDS[row] - BOARDS[row + 1];
            const spec = packFor(run, row, side, room);
            const front = SHELF_FRONT + 0.03;
            const back = BACK - 0.03 - (spec.type === 'box' ? 0 : 0.06);
            const top = yb - spec.h;
            const zs = z + (SLOT * 0.94 - spec.d) / 2;
            const z2 = zs + spec.d;

            const key = side + ':' + row + ':' + i;
            const l = lit.get(key);
            let k = 0;
            if (l) {
              const age = now - l.t0;
              k = age < 350 ? age / 350 : age > 2800 ? Math.max(0, 1 - (age - 2800) / 500) : 1;
              if (age > 3300) lit.delete(key);
            }
            const lift = k * 0.025;
            const Y = (y) => y - lift;
            const accent = l ? (l.gold ? [244, 182, 66] : [23, 143, 174]) : null;

            // Boxes show their side and (below eye level) their top
            if (spec.type === 'box') {
              poly([P(sx(front), Y(top), zs), P(sx(back), Y(top), zs), P(sx(back), Y(yb), zs), P(sx(front), Y(yb), zs)],
                fog(spec.base, a, 0.88), `rgba(179,187,199,${a * 0.5})`);
              if (top > 0) {
                poly([P(sx(front), Y(top), zs), P(sx(back), Y(top), zs), P(sx(back), Y(top), z2), P(sx(front), Y(top), z2)],
                  fog(spec.base, a, 1.03));
              }
            }
            const face = [P(sx(front), Y(top), zs), P(sx(front), Y(top), z2), P(sx(front), Y(yb), z2), P(sx(front), Y(yb), zs)];
            drawPack(face, spec, a, accent && k > 0 ? `rgba(${accent[0]},${accent[1]},${accent[2]},${a * k})` : null);

            // Shelf tag on the lip under the first facing of each run
            const runStart = (i + Math.floor(hash(row, side, 3) * 5)) % 3 === 0;
            if (runStart || k > 0) {
              const tagC = k > 0 && accent ? accent : [255, 255, 255];
              const tagFill = k > 0 ? `rgba(${tagC[0]},${tagC[1]},${tagC[2]},${a})` : fog([255, 255, 255], a);
              poly([P(sx(SHELF_FRONT - 0.005), yb + 0.012, z), P(sx(SHELF_FRONT - 0.005), yb + 0.012, z + SLOT * 0.7),
                P(sx(SHELF_FRONT - 0.005), yb + 0.05, z + SLOT * 0.7), P(sx(SHELF_FRONT - 0.005), yb + 0.05, z)],
              tagFill, `rgba(179,187,199,${a})`);
            }
          }
        }

        // Shelf lips, one long strip per board
        for (const yb of BOARDS) {
          const pts = [P(sx(SHELF_FRONT), yb, Z_NEAR), P(sx(SHELF_FRONT), yb, Z_FAR),
            P(sx(SHELF_FRONT), yb + 0.06, Z_FAR), P(sx(SHELF_FRONT), yb + 0.06, Z_NEAR)];
          const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
          g.addColorStop(0, 'rgba(255,255,255,.95)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          poly(pts, null, null);
          ctx.fillStyle = g;
          ctx.fill();
          const g2 = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
          g2.addColorStop(0, 'rgba(179,187,199,.9)');
          g2.addColorStop(1, 'rgba(179,187,199,0)');
          ctx.strokeStyle = g2;
          ctx.stroke();
        }
      }

      // Keep the copy clear: a soft cream ellipse around the vanishing point
      ctx.save();
      ctx.translate(W / 2, H * 0.5);
      ctx.scale(Math.max(1.4, W / H * 0.9), 1);
      const rr = H * 0.46;
      const clear = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      clear.addColorStop(0, 'rgba(250,249,245,1)');
      clear.addColorStop(0.6, 'rgba(250,249,245,0.94)');
      clear.addColorStop(1, 'rgba(250,249,245,0)');
      ctx.fillStyle = clear;
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ctx.restore();

      const bottom = ctx.createLinearGradient(0, H * 0.7, 0, H);
      bottom.addColorStop(0, 'rgba(250,249,245,0)');
      bottom.addColorStop(1, 'rgba(250,249,245,1)');
      ctx.fillStyle = bottom;
      ctx.fillRect(0, H * 0.7, W, H * 0.3);

      // Soft start under the navbar instead of a hard edge
      const topFade = ctx.createLinearGradient(0, 70, 0, 200);
      topFade.addColorStop(0, 'rgba(250,249,245,1)');
      topFade.addColorStop(1, 'rgba(250,249,245,0)');
      ctx.fillStyle = topFade;
      ctx.fillRect(0, 0, W, 200);
    };

    let picks = 0;
    const pick = () => {
      const zMin = 0.7, zMax = 1.15;
      const i = Math.floor((travel + zMin + Math.random() * (zMax - zMin)) / SLOT);
      const side = Math.random() < 0.5 ? -1 : 1;
      const row = Math.floor(Math.random() * (BOARDS.length - 1));
      lit.set(side + ':' + row + ':' + i, { t0: performance.now(), gold: ++picks % 7 === 0 });
    };

    await whenRevealed();
    if (!scope.alive) return;
    if (reduceMotion) { draw(0); return; }
    let prev = 0;
    scope.frame((now) => {
      const dt = prev ? Math.min(64, now - prev) : 16;
      prev = now;
      travel += dt * 0.00012;
      draw(now);
    });
    while (scope.alive) {
      await scope.wait(500 + Math.random() * 500);
      if (!document.hidden) pick();
    }
  };

  // G in 3D (three.js, built from src/aisle3d.js). Loaded on demand; falls
  // back to the canvas aisle above when WebGL or the module isn't available.
  const aisleRealVariant = async (scope) => {
    const bg = addBg(scope, 'hl-aisle');
    let aisle = null;
    try {
      const mod = await import('/hero-lab/dist/aisle3d.js');
      if (!scope.alive) return;
      aisle = mod.mountAisle3D({ bg, hero, reduceMotion });
    } catch (e) {
      console.warn('[hero-lab] 3D aisle unavailable, using canvas fallback', e);
    }
    if (!scope.alive) { if (aisle) aisle.dispose(); return; }
    if (!aisle) { bg.remove(); return aisleCanvasVariant(scope); }
    scope.add(() => aisle.dispose());
    await whenRevealed();
    if (scope.alive) aisle.start();
  };

  // ---------------------------------------------------------------
  // Rebrand pill designs. ?pill=shader swaps the orbit pill for a single
  // line of white text on a slow WebGL flow of teal and aqua with a ribbon
  // of gold. The same flow follows it into the fixed bar above the navbar
  // (and the clone that flies between them). Without WebGL the CSS gradient
  // under the canvas shows instead.
  // ---------------------------------------------------------------
  const announce = document.getElementById('heroAnnounce');
  const topBar = document.getElementById('topBanner');
  const PILL_VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const PILL_FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    const vec3 TEAL = vec3(0.090, 0.561, 0.682);
    const vec3 AQUA = vec3(0.380, 0.773, 0.898);
    const vec3 GOLD = vec3(0.957, 0.714, 0.259);
    const vec3 NAVY = vec3(0.063, 0.165, 0.314);
    // All blending happens in OKLab, a perceptual space: long gradients stay
    // even and clean, and blue into gold passes through a soft haze instead
    // of the olive that a plain RGB mix gives
    vec3 toOklab(vec3 srgb) {
      vec3 c = pow(srgb, vec3(2.2));
      vec3 lms = c * mat3(0.4122214708, 0.5363325363, 0.0514459929,
                          0.2119034982, 0.6806995451, 0.1073969566,
                          0.0883024619, 0.2817188376, 0.6299787005);
      lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
      return lms * mat3(0.2104542553, 0.7936177850, -0.0040720468,
                        1.9779984951, -2.4285922050, 0.4505937099,
                        0.0259040371, 0.7827717662, -0.8086757660);
    }
    vec3 fromOklab(vec3 lab) {
      vec3 lms = lab * mat3(1.0, 0.3963377774, 0.2158037573,
                            1.0, -0.1055613458, -0.0638541728,
                            1.0, -0.0894841775, -1.2914855480);
      lms = lms * lms * lms;
      vec3 c = lms * mat3(4.0767416621, -3.3077115913, 0.2309699292,
                          -1.2684380046, 2.6097574011, -0.3413193965,
                          -0.0041960863, -0.7034186147, 1.7076147010);
      return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
    }
    // soft elliptical glow centered on c, r wide
    float glow(vec2 p, vec2 c, float r) { vec2 d = (p - c) / vec2(r, r * 0.6); return exp(-dot(d, d)); }
    void main() {
      // The pattern is laid out across a fixed 6.5:1 frame, the pill's own
      // shape, so the bar and the flying clone show the same flow stretched
      // rather than repeated
      vec2 p = vec2(gl_FragCoord.x / uRes.x * 6.5, gl_FragCoord.y / uRes.y);
      float t = uTime;
      // a gentle warp keeps the edges liquid
      p += 0.25 * vec2(sin(p.y * 2.3 + t * 0.7), cos(p.x * 0.9 - t * 0.5));
      // One glow per color, evenly spaced on a slowly turning loop a little
      // wider than the pill: they never pile up, all three always show (about
      // a third each), and they slowly trade places
      float a = t * 0.12;
      vec2 cT = vec2(3.25 + 2.6 * cos(a), 0.5 + 0.55 * sin(a));
      vec2 cA = vec2(3.25 + 2.6 * cos(a + 2.094), 0.5 + 0.55 * sin(a + 2.094));
      vec2 cG = vec2(3.25 + 2.6 * cos(a + 4.189), 0.5 + 0.55 * sin(a + 4.189));
      float wT = glow(p, cT, 1.4);
      float wA = glow(p, cA, 1.3);
      float wG = glow(p, cG, 1.5);
      // weighted blend: pure color at each core, long smooth hand-offs between
      vec3 col = (toOklab(TEAL) * wT + toOklab(AQUA) * wA + toOklab(GOLD) * wG) / (wT + wA + wG + 1e-4);
      // a light navy veil deepens everything so the white text holds up
      col = mix(col, toOklab(NAVY), 0.08);
      gl_FragColor = vec4(fromOklab(col), 1.0);
    }`;

  // One shader canvas behind a host element's content
  const shaderLayer = (host) => {
    const canvas = el('canvas', 'hl-pill-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return null;
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, PILL_VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, PILL_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    host.prepend(canvas);

    let last = 0;
    const draw = (phase) => {
      last = phase;
      gl.uniform1f(uTime, phase);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    // Resizing clears the canvas, and the observer fires after this frame's
    // draw, so repaint right away (the flyer resizes every frame)
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(host.offsetWidth * dpr));
      canvas.height = Math.max(1, Math.round(host.offsetHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      draw(last);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    return {
      draw,
      dispose() {
        ro.disconnect();
        canvas.remove();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    };
  };

  const mountPillShader = () => {
    document.body.classList.add('hl-pill-shader');
    const pill = shaderLayer(announce);
    if (!pill) return () => document.body.classList.remove('hl-pill-shader');
    const bar = topBar && shaderLayer(topBar);

    // The clone that flies between pill and bar is built from the bar's
    // markup: swap its copied (blank) canvas for a live layer of its own
    let flyer = null;
    const mo = new MutationObserver((records) => records.forEach((r) => {
      r.addedNodes.forEach((n) => {
        if (!n.classList || !n.classList.contains('banner-flyer')) return;
        n.querySelector('.hl-pill-canvas')?.remove();
        if (flyer) flyer.layer?.dispose();
        flyer = { node: n, layer: shaderLayer(n) };
        flyer.layer?.draw(phase);
      });
      r.removedNodes.forEach((n) => {
        if (flyer && n === flyer.node) { flyer.layer?.dispose(); flyer = null; }
      });
    }));
    mo.observe(document.body, { childList: true });

    // One clock for all three, so the flow carries on unbroken as the pill
    // turns into the bar. Slow drift; hovering eases it a little faster.
    let phase = Math.random() * 20;
    let speed = 1;
    let target = 1;
    let prev = 0;
    let raf = 0;
    let pillInView = true;
    const onEnter = () => { target = 2.4; };
    const onLeave = () => { target = 1; };
    [announce, topBar].forEach((n) => {
      if (!n) return;
      n.addEventListener('pointerenter', onEnter);
      n.addEventListener('pointerleave', onLeave);
    });
    const io = new IntersectionObserver(([e]) => { pillInView = e.isIntersecting; });
    io.observe(announce);

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = prev ? Math.min(50, now - prev) / 1000 : 0;
      prev = now;
      if (document.hidden) return;
      speed += (target - speed) * (1 - Math.exp(-dt * 3));
      if (!reduceMotion) phase += dt * 0.25 * speed;
      if (pillInView) pill.draw(phase);
      if (bar && topBar.classList.contains('is-shown')) bar.draw(phase);
      if (flyer && flyer.layer) flyer.layer.draw(phase);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
      [announce, topBar].forEach((n) => {
        if (!n) return;
        n.removeEventListener('pointerenter', onEnter);
        n.removeEventListener('pointerleave', onLeave);
      });
      pill.dispose();
      if (bar) bar.dispose();
      if (flyer) flyer.layer?.dispose();
      document.body.classList.remove('hl-pill-shader');
    };
  };

  const PILLS = [
    { key: 'orbit', label: 'Orbit', mount: null },
    { key: 'shader', label: 'Shader', mount: mountPillShader }
  ];
  let pillOff = null;
  let pillKey = 'orbit';

  const setPill = (key) => {
    const next = PILLS.find((v) => v.key === key) || PILLS[0];
    if (pillOff) { pillOff(); pillOff = null; }
    pillKey = next.key;
    if (next.mount && announce) pillOff = next.mount();
    bar.querySelectorAll('[data-pill]').forEach((b) => b.classList.toggle('is-active', b.dataset.pill === pillKey));
    const p = new URLSearchParams(location.search);
    if (pillKey === 'orbit') p.delete('pill'); else p.set('pill', pillKey);
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };

  // ---------------------------------------------------------------
  // Switcher
  // ---------------------------------------------------------------
  const VARIANTS = [
    { key: 'current', label: 'Current', mount: null },
    { key: 'path', label: 'A · Path', mount: pathVariant },
    { key: 'assistant', label: 'B · Assistant', mount: assistantVariant, split: true },
    { key: 'kinetic', label: 'C · Kinetic', mount: kineticVariant },
    { key: 'shelves', label: 'D · Shelves', mount: shelvesVariant },
    { key: 'shoppers', label: 'E · Shoppers', mount: shoppersVariant, split: true },
    { key: 'aisle', label: 'F · Aisle', mount: aisleVariant },
    { key: 'aisle-real', label: 'G · Aisle, real', mount: aisleRealVariant }
  ];

  let scope = null;
  let active = null;

  const setUrl = () => {
    const p = new URLSearchParams(location.search);
    if (active.key === 'current') p.delete('hero'); else p.set('hero', active.key);
    p.delete('focus');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };

  const activate = (key) => {
    const next = VARIANTS.find((v) => v.key === key) || VARIANTS[0];
    if (scope) scope.dispose();
    if (active) document.body.classList.remove('hl-v-' + active.key);
    active = next;
    document.body.classList.add('hl-on', 'hl-v-' + next.key);
    document.body.classList.toggle('hl-split', !!next.split);
    scope = makeScope();
    if (next.mount) next.mount(scope);
    window.dispatchEvent(new Event('resize'));
    bar.querySelectorAll('[data-key]').forEach((b) => b.classList.toggle('is-active', b.dataset.key === next.key));
    setUrl();
  };

  const bar = el('div', 'hl-switcher');
  bar.append(el('span', 'hl-switcher-label', 'Hero lab'));
  VARIANTS.forEach((v, i) => {
    const b = el('button', '', v.label);
    b.type = 'button';
    b.dataset.key = v.key;
    b.title = `${v.label} (key ${i})`;
    b.addEventListener('click', () => activate(v.key));
    bar.append(b);
  });
  bar.append(el('span', 'hl-switcher-sep'), el('span', 'hl-switcher-label', 'Pill'));
  PILLS.forEach((v) => {
    const b = el('button', '', v.label);
    b.type = 'button';
    b.dataset.pill = v.key;
    b.addEventListener('click', () => setPill(v.key));
    bar.append(b);
  });
  document.body.append(bar);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && VARIANTS[n]) activate(VARIANTS[n].key);
  });

  document.body.classList.add('hl-focus');
  activate(params.get('hero') || 'current');
  setPill(params.get('pill') || 'orbit');
})();
