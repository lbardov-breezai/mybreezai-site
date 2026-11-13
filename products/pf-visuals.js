/* Product visuals on /products (pf-*).
   [data-pf-tilt]: sets --pf-tx / --pf-ty (-1..1) from the pointer position so the
   Chat to Shop phones lean toward it. Mouse/trackpad only; skipped for reduced motion. */
(function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
