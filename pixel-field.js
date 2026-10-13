/* Pixel-Feld: ein Raster aus Quadraten, das in Stahltönen wogt.
   Der Mauszeiger hellt die Quadrate, über die er fährt, weich auf. Kein Rahmen,
   keine Fläche, nur das Aufleuchten, das schnell wieder verblasst.
   Mehrere Felder pro Seite sind möglich, jedes läuft nur, solange es sichtbar
   ist. Bei reduzierter Bewegung wird ein einzelnes statisches Bild gezeichnet.

   Konfiguration per data-Attribut am <canvas>:
     data-pixel   hero | band | top   (Verteilung der Dichte)
     data-palette light | night       (Farbwelt, Standard: light)
     data-pointer on                  (Maus hellt Quadrate auf)
     data-sparks  on                  (gelegentliches sanftes Aufhellen)  */
(() => {
  const canvases = document.querySelectorAll('canvas[data-pixel]');
  if (!canvases.length || !canvases[0].getContext) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const STEPS = 18;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  const PALETTES = {
    light: { low: [176, 183, 190], high: [240, 242, 244], glow: [255, 255, 255], glowMax: 0.6 },
    night: { low: [41, 47, 53],    high: [62, 71, 81],    glow: [150, 162, 174], glowMax: 0.5 },
  };

  // Wo das Raster dicht ist (0.1 = kaum sichtbar, 1 = voll)
  const MASKS = {
    hero: (c, r, cols, rows, narrow) => (narrow ? (r / rows - 0.5) / 0.45 : (c / cols - 0.28) / 0.55),
    band: (c, r, cols) => (c / cols - 0.3) / 0.5,
    top:  (c, r, cols, rows) => 1.05 - (r / rows) * 1.35,
  };

  function createField(canvas) {
    const kind = canvas.dataset.pixel in MASKS ? canvas.dataset.pixel : 'hero';
    const pal = PALETTES[canvas.dataset.palette] || PALETTES.light;
    const interactive = canvas.dataset.pointer === 'on';
    const sparks = canvas.dataset.sparks === 'on';
    const host = canvas.parentElement;
    const ctx = canvas.getContext('2d');

    const base = [];
    for (let i = 0; i < STEPS; i++) base.push(mix(pal.low, pal.high, i / (STEPS - 1)));
    const baseCss = base.map(rgb);

    let W = 0, H = 0, cell = 20, cols = 0, rows = 0;
    let phase, mask, heat;
    let running = false, visible = true, rafId = 0, last = 0, t = 0, nextSpark = 1;
    let inside = false, tx = 0, ty = 0, fx = 0, fy = 0;

    function build() {
      const rect = host.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const narrow = W < 720;
      cell = kind === 'band' ? 16 : narrow ? 14 : 20;
      cols = Math.ceil(W / cell);
      rows = Math.ceil(H / cell);
      const n = cols * rows;

      phase = new Float32Array(n);
      mask = new Float32Array(n);
      heat = new Float32Array(n);

      const maskFn = MASKS[kind];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          phase[i] = Math.random();
          mask[i] = Math.min(1, Math.max(0.1, maskFn(c, r, cols, rows, narrow)));
        }
      }
      draw();
    }

    // Weicher, runder Schein um einen Punkt
    function addGlow(px, py, radius, strength) {
      const cx = px / cell, cy = py / cell;
      const c0 = Math.max(0, Math.floor(cx - radius - 1));
      const c1 = Math.min(cols - 1, Math.ceil(cx + radius));
      const r0 = Math.max(0, Math.floor(cy - radius - 1));
      const r1 = Math.min(rows - 1, Math.ceil(cy + radius));
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
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const p = phase[i];

          const wave =
            Math.sin(c * 0.23 + t * 0.55) * 0.5 +
            Math.sin(r * 0.19 - t * 0.42) * 0.3 +
            Math.sin((c + r) * 0.12 + t * 0.3 + p * 0.6) * 0.2;
          let v = 0.5 + 0.5 * wave + 0.1 * Math.sin(t * 1.7 + p * 6.283);
          v = Math.min(1, Math.max(0, v)) * mask[i];

          const idx = Math.min(STEPS - 1, (v * STEPS) | 0);
          let s = size * (0.2 + 0.8 * v);
          let color = baseCss[idx];

          const h = heat[i];
          if (h > 0.03) {
            s += (size - s) * Math.min(1, h * 0.9);
            color = rgb(mix(base[idx], pal.glow, h * pal.glowMax));
          }

          ctx.fillStyle = color;
          ctx.fillRect(c * cell + (cell - s) / 2, r * cell + (cell - s) / 2, s, s);
        }
      }
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      const decay = Math.exp(-dt * 3);
      for (let i = 0; i < heat.length; i++) heat[i] *= decay;

      if (interactive && inside) {
        const k = 1 - Math.exp(-dt * 16);
        fx += (tx - fx) * k;
        fy += (ty - fy) * k;
        // Ruhende Maus leuchtet kaum, schnelle Bewegung etwas stärker
        const lag = Math.hypot(tx - fx, ty - fy);
        addGlow(fx, fy, 2.6, Math.min(0.6, 0.12 + lag / (cell * 5)));
      }

      if (sparks) {
        nextSpark -= dt;
        if (nextSpark <= 0) {
          nextSpark = 1.4 + Math.random() * 2.4;
          addGlow(W * (0.45 + Math.random() * 0.5), H * (0.12 + Math.random() * 0.6), 2.2, 0.45);
        }
      }

      draw();
      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || motion.matches || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }

    if (interactive) {
      host.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const rect = host.getBoundingClientRect();
        tx = e.clientX - rect.left;
        ty = e.clientY - rect.top;
        if (!inside) { fx = tx; fy = ty; }
        inside = true;
      }, { passive: true });
      host.addEventListener('pointerleave', () => { inside = false; });
    }

    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }, { threshold: 0 }).observe(host);

    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    motion.addEventListener('change', () => {
      if (motion.matches) { stop(); t = 2; heat.fill(0); draw(); } else { start(); }
    });

    let resizeTimer;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 120);
    }).observe(host);

    if (motion.matches) t = 2;
    build();
    start();
  }

  canvases.forEach(createField);
})();
