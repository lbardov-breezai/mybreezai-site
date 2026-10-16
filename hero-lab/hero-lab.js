// Hero lab: experimental homepage hero variants.
// ?hero=<key> picks a variant; the switcher (bottom-left) shows on localhost
// or whenever ?hero= is in the URL. Variants mount and unmount live, so
// switching doesn't replay the intro. Without ?hero= nothing here runs.
(() => {
  const params = new URLSearchParams(location.search);
  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  if (!isLocal && !params.has('hero')) return;

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
    const chat = el('div', 'hl-chat', `
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
  // Switcher
  // ---------------------------------------------------------------
  const VARIANTS = [
    { key: 'current', label: 'Current', mount: null },
    { key: 'path', label: 'A · Path', mount: pathVariant },
    { key: 'assistant', label: 'B · Assistant', mount: assistantVariant },
    { key: 'kinetic', label: 'C · Kinetic', mount: kineticVariant },
    { key: 'shelves', label: 'D · Shelves', mount: shelvesVariant }
  ];

  let scope = null;
  let active = null;

  const setUrl = () => {
    const p = new URLSearchParams(location.search);
    if (active.key === 'current') p.delete('hero'); else p.set('hero', active.key);
    if (document.body.classList.contains('hl-focus')) p.delete('focus'); else p.set('focus', '0');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };

  const activate = (key) => {
    const next = VARIANTS.find((v) => v.key === key) || VARIANTS[0];
    if (scope) scope.dispose();
    if (active) document.body.classList.remove('hl-v-' + active.key);
    active = next;
    document.body.classList.add('hl-on', 'hl-v-' + next.key);
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
  bar.append(el('span', 'hl-sep'));
  const focusBtn = el('button', 'hl-toggle', 'Focus');
  focusBtn.type = 'button';
  focusBtn.title = 'Show only the hero and the sections right under it (key F)';
  const setFocus = (on) => {
    document.body.classList.toggle('hl-focus', on);
    focusBtn.classList.toggle('is-active', on);
    if (active) setUrl();
  };
  focusBtn.addEventListener('click', () => setFocus(!document.body.classList.contains('hl-focus')));
  bar.append(focusBtn);
  document.body.append(bar);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && VARIANTS[n]) activate(VARIANTS[n].key);
    else if (e.key === 'f' || e.key === 'F') focusBtn.click();
  });

  setFocus(params.get('focus') !== '0');
  activate(params.get('hero') || 'current');
})();
