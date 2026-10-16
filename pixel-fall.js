/* Seitenweites Pixel-Feld (nur Startseite)
   Ein fester Canvas hinter dem gesamten Inhalt.
   1. Oben bildet er das Raster des Hero. Beim Scrollen lösen sich die Quadrate
      und sinken langsam nach unten, jedes mit eigenem Tempo, und verblassen.
   2. In der Mitte der Seite liegt ein sehr zartes Raster im Hintergrund.
   3. Der Mauszeiger hellt die Quadrate, über die er fährt, weich auf.
   Gezeichnet wird nur, was im Fenster sichtbar ist. Bei reduzierter Bewegung
   gibt es kein Fallen, keine Wellen und kein Aufhellen: Das Raster steht still
   und scrollt mit der Seite. */
(() => {
  const canvas = document.getElementById('pixelFall');
  const hero = document.getElementById('top');
  const contact = document.getElementById('kontakt') || document.getElementById('contact');
  if (!canvas || !canvas.getContext || !hero || !contact) return;

  const ctx = canvas.getContext('2d');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const STEPS = 18;
  const LOW = [176, 183, 190], HIGH = [240, 242, 244], GLOW = [255, 255, 255];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const base = Array.from({ length: STEPS }, (_, i) => mix(LOW, HIGH, i / (STEPS - 1)));
  const baseCss = base.map(rgb);
  const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const fract = (x) => x - Math.floor(x);
  const rnd = (c, r) => fract(Math.sin(c * 127.1 + r * 311.7) * 43758.5453);

  let W = 0, H = 0, cell = 20, cols = 0, heroH = 0, heroRows = 0, pageRows = 0, contactTop = 0, hrows = 0;
  let fmax = 1300;
  let phase, mask, kfall, midMask, heat;
  let S = 0, Fe = 0, t = 0, last = 0, running = false, rafId = 0, queued = false;
  let inside = false, tx = 0, ty = 0, fx = 0, fy = 0, nextSpark = 1.5;

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const narrow = W < 720;
    cell = narrow ? 14 : 20;
    cols = Math.ceil(W / cell);
    fmax = narrow ? 900 : 1300;

    heroH = hero.offsetHeight;
    heroRows = Math.ceil(heroH / cell);
    contactTop = contact.getBoundingClientRect().top + window.scrollY;
    pageRows = Math.ceil(contactTop / cell) + 2;

    phase = new Float32Array(cols * pageRows);
    for (let r = 0; r < pageRows; r++) for (let c = 0; c < cols; c++) phase[r * cols + c] = rnd(c, r);

    mask = new Float32Array(cols * heroRows);
    kfall = new Float32Array(cols * heroRows);
    for (let r = 0; r < heroRows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        // Dichte wie im Hero: rechts dicht, auf schmalen Schirmen unten
        const m = narrow ? (r / heroRows - 0.5) / 0.45 : (c / cols - 0.28) / 0.55;
        mask[i] = Math.min(1, Math.max(0.1, m));
        kfall[i] = 0.25 + 0.55 * rnd(c + 7, r + 3); // Fallanteil pro Quadrat
      }
    }

    // Mitte der Seite: am Rand etwas dichter als hinter dem Text
    midMask = new Float32Array(cols);
    for (let c = 0; c < cols; c++) midMask[c] = 0.25 + 0.75 * Math.pow(Math.abs((2 * (c + 0.5)) / cols - 1), 1.4);

    hrows = Math.ceil(H / cell);
    heat = new Float32Array(cols * hrows);

    S = window.scrollY;
    Fe = S;
    draw();
  }

  function level(c, r, p) {
    const wave =
      Math.sin(c * 0.23 + t * 0.55) * 0.5 +
      Math.sin(r * 0.19 - t * 0.42) * 0.3 +
      Math.sin((c + r) * 0.12 + t * 0.3 + p * 0.6) * 0.2;
    return Math.min(1, Math.max(0, 0.5 + 0.5 * wave + 0.1 * Math.sin(t * 1.7 + p * 6.283)));
  }

  // Weicher, runder Schein um einen Punkt (Fensterkoordinaten)
  function addHeat(px, py, radius, strength) {
    const cx = px / cell, cy = py / cell;
    const c0 = Math.max(0, Math.floor(cx - radius - 1));
    const c1 = Math.min(cols - 1, Math.ceil(cx + radius));
    const r0 = Math.max(0, Math.floor(cy - radius - 1));
    const r1 = Math.min(hrows - 1, Math.ceil(cy + radius));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const d = Math.hypot(c + 0.5 - cx, r + 0.5 - cy);
        if (d > radius) continue;
        const h = strength * Math.pow(1 - d / radius, 1.5);
        const i = r * cols + c;
        if (h > heat[i]) heat[i] = h;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const size = cell - 2;
    const fall = motion.matches ? 0 : 1;
    const Fd = Fe * fall;

    // 1) Hero-Raster, das beim Scrollen herabsinkt
    if (S < 1800) {
      for (let r = 0; r < heroRows; r++) {
        const y0 = r * cell + cell / 2;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const fallPx = Fd * kfall[i];
          const ys = y0 + fallPx - S;
          if (ys < -cell || ys > H + cell) continue;
          const a = 1 - fallPx / fmax;
          if (a < 0.03) continue;

          const v = level(c, r, phase[i]) * mask[i];
          const idx = Math.min(STEPS - 1, (v * STEPS) | 0);
          let s = size * (0.2 + 0.8 * v) * (1 - 0.35 * (1 - a));
          let color = baseCss[idx];

          const hy = (ys / cell) | 0;
          const h = hy >= 0 && hy < hrows ? heat[hy * cols + c] : 0;
          if (h > 0.03) {
            s += (size - s) * Math.min(1, h * 0.9);
            color = rgb(mix(base[idx], GLOW, h * 0.6));
          }

          ctx.globalAlpha = a;
          ctx.fillStyle = color;
          ctx.fillRect(c * cell + (cell - s) / 2, ys - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    }

    // 2) Zartes Raster hinter der Seitenmitte
    const rStart = Math.max(heroRows, Math.floor(S / cell) - 1);
    const rEnd = Math.min(pageRows - 1, Math.ceil((S + H) / cell) + 1);
    for (let r = rStart; r <= rEnd; r++) {
      const y0 = r * cell + cell / 2;
      if (y0 >= contactTop) break;
      const env = smooth(heroH, heroH + 260, y0) * (1 - smooth(contactTop - 340, contactTop - 60, y0));
      if (env < 0.03) continue;
      const ys = y0 - S;
      const hy = (ys / cell) | 0;
      for (let c = 0; c < cols; c++) {
        const vv = level(c, r, phase[r * cols + c]) * midMask[c] * env;
        const idx = 6 + Math.min(7, (vv * 8) | 0);
        let s = size * (0.2 + 0.5 * vv);
        let color = baseCss[idx];

        const h = hy >= 0 && hy < hrows ? heat[hy * cols + c] : 0;
        if (h > 0.03) {
          s += (size - s) * Math.min(1, h * 0.9);
          color = rgb(mix(base[idx], GLOW, h * 0.6));
        }

        ctx.fillStyle = color;
        ctx.fillRect(c * cell + (cell - s) / 2, ys - s / 2, s, s);
      }
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    S = window.scrollY;
    Fe += (S - Fe) * (1 - Math.exp(-dt * 3)); // das Fallen läuft dem Scrollen weich hinterher

    const decay = Math.exp(-dt * 3);
    for (let i = 0; i < heat.length; i++) heat[i] *= decay;

    if (inside) {
      const k = 1 - Math.exp(-dt * 16);
      fx += (tx - fx) * k;
      fy += (ty - fy) * k;
      const lag = Math.hypot(tx - fx, ty - fy);
      addHeat(fx, fy, 2.6, Math.min(0.6, 0.12 + lag / (cell * 5)));
    }

    nextSpark -= dt;
    if (nextSpark <= 0) {
      nextSpark = 1.6 + Math.random() * 2.4;
      if (S < heroH * 0.5) addHeat(W * (0.5 + Math.random() * 0.45), H * (0.15 + Math.random() * 0.6), 2.2, 0.45);
    }

    draw();
    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    queued = false;
    S = window.scrollY;
    Fe = S;
    draw();
  }
  function queueStatic() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(drawStatic);
  }

  function start() {
    if (motion.matches) { t = 2; drawStatic(); return; }
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    tx = e.clientX;
    ty = e.clientY;
    if (!inside) { fx = tx; fy = ty; }
    inside = true;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { inside = false; });

  window.addEventListener('scroll', () => { if (motion.matches) queueStatic(); }, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  motion.addEventListener('change', () => { stop(); if (heat) heat.fill(0); start(); });

  let resizeTimer;
  const relayout = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { build(); if (motion.matches) queueStatic(); }, 150);
  };
  window.addEventListener('resize', relayout);
  new ResizeObserver(relayout).observe(document.body);

  if (motion.matches) t = 2;
  build();
  start();
})();
