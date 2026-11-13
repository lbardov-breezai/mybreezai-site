/* Product visuals on /products (pf-*).
   - [data-pf-scrub]: sets --pf-progress (0..1) and --pf-shift (px) as the panel crosses the viewport.
   - [data-pf-land]:  sets --pf-enter (0..1) as the panel scrolls up into view.
   - [data-pf-tilt]:  sets --pf-tx / --pf-ty (-1..1) from the pointer position.
   Everything degrades to a static image when reduced motion is requested. */
(function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
    var scrub = [].slice.call(document.querySelectorAll('[data-pf-scrub]'));
    var land = [].slice.call(document.querySelectorAll('[data-pf-land]'));
    var ticking = false;

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            var vh = window.innerHeight;
            scrub.forEach(function (el) {
                var r = el.getBoundingClientRect();
                // 0 when the panel's top is 85% down the viewport, 1 when its bottom reaches 15% from the top,
                // so the whole page plays while the panel is comfortably on screen
                var p = clamp((vh * 0.85 - r.top) / (vh * 0.7 + r.height));
                el.style.setProperty('--pf-progress', p.toFixed(4));
                // Pixel distance the page inside the frame should travel at this progress
                var img = el.querySelector('.pf-scrub-img');
                var port = img && img.parentElement;
                if (img && port) {
                    var room = Math.max(0, img.offsetHeight - port.offsetHeight);
                    el.style.setProperty('--pf-shift', (room * p).toFixed(1) + 'px');
                }
            });
            land.forEach(function (el) {
                var r = el.getBoundingClientRect();
                // 0 while the panel's top sits at the bottom edge, 1 once it reaches 25% from the top
                el.style.setProperty('--pf-enter', clamp((vh - r.top) / (vh * 0.75)).toFixed(4));
            });
            ticking = false;
        });
    }
    if (scrub.length || land.length) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        window.addEventListener('load', onScroll);
        onScroll();
    }

    // Pointer tilt only on devices with a real hover pointer
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('[data-pf-tilt]').forEach(function (el) {
        var frame = 0;
        el.addEventListener('pointermove', function (e) {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(function () {
                var r = el.getBoundingClientRect();
                el.style.setProperty('--pf-tx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
                el.style.setProperty('--pf-ty', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
            });
        });
        el.addEventListener('pointerleave', function () {
            cancelAnimationFrame(frame);
            el.style.setProperty('--pf-tx', 0);
            el.style.setProperty('--pf-ty', 0);
        });
    });
})();
