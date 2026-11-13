// BOLTYARD site: nav background, clips that play only while visible, roster turnarounds,
// lightbox, scroll reveals, plus the motion layer: scroll-driven robot assembly, odometer
// counters, hazard-tape heading wipes, drag-to-spin builds, arena fly-overs on hover and a
// light hero parallax. No dependencies; everything degrades to static under reduced motion.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const motion = !reduce && hasIO;

  // ---------- nav + hero parallax (one passive scroll listener, work done in rAF)
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  const heroMedia = document.querySelector('.hero-media');
  const heroCopy = document.querySelector('.hero-copy');
  let ticking = false;
  const onFrame = () => {
    ticking = false;
    const y = scrollY;
    nav.classList.toggle('solid', y > 40);
    if (!reduce && hero) {
      const h = hero.offsetHeight;
      if (y < h) {
        const p = y / h;
        heroMedia.style.translate = `0 ${(y * 0.35).toFixed(1)}px`;
        heroMedia.style.scale = (1 + p * 0.08).toFixed(4);
        heroCopy.style.translate = `0 ${(-y * 0.18).toFixed(1)}px`;
        heroCopy.style.opacity = Math.max(0, 1 - p * 1.4).toFixed(3);
      }
    }
    assembly?.update();
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });

  if (heroMedia && reduce) { heroMedia.removeAttribute('autoplay'); heroMedia.pause(); }

  // ---------- clips play only while on screen
  const clips = document.querySelectorAll('video[data-autoplay]');
  if (!reduce && hasIO) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.preload = 'auto'; e.target.play().catch(() => {}); }
        else e.target.pause();
      }
    }, { threshold: 0.35 });
    clips.forEach((v) => io.observe(v));
  } else clips.forEach((v) => v.setAttribute('controls', ''));

  // ---------- roster: hover / focus shows the robot from behind
  document.querySelectorAll('.roster img[data-alt-src]').forEach((img) => {
    const front = img.src;
    const back = img.dataset.altSrc;
    new Image().src = back;
    const fig = img.closest('figure');
    fig.tabIndex = 0;
    const on = () => (img.src = back);
    const off = () => (img.src = front);
    fig.addEventListener('mouseenter', on);
    fig.addEventListener('mouseleave', off);
    fig.addEventListener('focus', on);
    fig.addEventListener('blur', off);
  });

  // ---------- lightbox for gallery links
  const box = document.querySelector('.lightbox');
  const big = document.createElement('img');
  box.appendChild(big);
  document.querySelectorAll('[data-gallery] a').forEach((a) => {
    a.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey) return;
      ev.preventDefault();
      big.src = a.href;
      big.alt = a.querySelector('img')?.alt ?? '';
      box.showModal();
    });
  });
  box.addEventListener('click', () => box.close());

  // ---------- odometer: digits roll up from zero when the number scrolls into view
  const odos = document.querySelectorAll('[data-odo]');
  if (motion) {
    odos.forEach((el) => {
      const text = el.textContent;
      el.setAttribute('aria-label', text);
      let n = 0;
      el.innerHTML = [...text].map((ch) => {
        if (!/\d/.test(ch)) return `<span aria-hidden="true">${ch}</span>`;
        const d = +ch;
        const strip = Array.from({ length: 20 }, (_, i) => `<b>${i % 10}</b>`).join('');
        return `<span class="odo-d" aria-hidden="true"><span class="odo-s" style="--to:${10 + d};transition-delay:${(n++ * 0.06).toFixed(2)}s">${strip}</span></span>`;
      }).join('');
    });
    const oio = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('run'); oio.unobserve(e.target); }
    }, { threshold: 0.6 });
    odos.forEach((el) => oio.observe(el));
  }

  // ---------- reveal sections; headings get the hazard-tape wipe
  if (motion) {
    const ro = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
    }, { threshold: 0.12 });
    // the clip goes on an inner span: Chrome counts a fully clipped target as never visible
    document.querySelectorAll('.block h2').forEach((el) => { el.innerHTML = `<span class="wi">${el.innerHTML}</span>`; el.classList.add('wipe'); ro.observe(el); });
    document.querySelectorAll('.block .lead, .bento, .roster, .steps, .arenas, .chips, .letter, .faq-list, .trailer, .clips, .wall').forEach((el) => { el.classList.add('reveal'); ro.observe(el); });
  }

  // ---------- builds: scrub the assembly frames with the scroll position
  const assembly = (() => {
    const root = document.querySelector('.assembly');
    if (!root || !motion) return null;
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const morph = root.querySelector('.morph');
    const bar = root.querySelector('.assemble-bar');
    const steps = [...root.querySelectorAll('.parts li')];
    const N = +root.dataset.frames;
    const frames = new Array(N);
    let loading = false, shown = -1, done = false;

    const load = () => {
      if (loading) return;
      loading = true;
      // first, last and every 8th frame first so scrubbing never shows a blank canvas
      const order = [...new Set([0, N - 1, ...Array.from({ length: N }, (_, i) => i).sort((a, b) => (a % 8) - (b % 8))])];
      // six at a time: gentle on slow connections and small servers
      const next = () => {
        const i = order.shift();
        if (i === undefined) return;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { frames[i] = img; if (shown < 0 || Math.abs(i - target) < Math.abs(shown - target)) draw(); next(); };
        img.onerror = next;
        img.src = `${root.dataset.src}${String(i).padStart(3, '0')}.webp`;
      };
      for (let k = 0; k < 6; k++) next();
    };
    let target = 0;
    const draw = () => {
      // nearest loaded frame to the target
      for (let o = 0; o < N; o++) {
        for (const i of [target - o, target + o]) {
          if (i >= 0 && i < N && frames[i]) {
            if (i !== shown) { ctx.drawImage(frames[i], 0, 0, canvas.width, canvas.height); shown = i; root.classList.add('live'); }
            return;
          }
        }
      }
    };
    new IntersectionObserver((e) => { if (e[0].isIntersecting) load(); }, { rootMargin: '150% 0px' }).observe(root);

    return {
      update() {
        const r = root.getBoundingClientRect();
        const span = r.height - innerHeight;
        if (r.bottom < -innerHeight || r.top > innerHeight * 2) return;
        // finish the build a little before the pin releases, so "swap anything" has a beat
        const p = Math.min(1, Math.max(0, -r.top / (span * 0.82)));
        target = Math.round(p * (N - 1));
        if (loading) draw();
        bar.style.setProperty('--p', p.toFixed(3));
        let cur = -1;
        steps.forEach((li, i) => { const on = p >= +li.dataset.at; li.classList.toggle('on', on); if (on) cur = i; });
        steps.forEach((li, i) => li.classList.toggle('now', i === cur));
        const isDone = p >= 0.99;
        if (isDone !== done) {
          done = isDone;
          root.classList.toggle('done', done);
          if (done) { morph.preload = 'auto'; morph.currentTime = 0; morph.play().catch(() => {}); } else morph.pause();
        }
      },
    };
  })();
  if (!assembly) document.querySelectorAll('.parts li').forEach((li) => li.classList.add('on'));

  // ---------- featured builds: hover spins the turntable, drag turns it
  document.querySelectorAll('.wall [data-spin]').forEach((li) => {
    const FR = 24;
    const spin = document.createElement('div');
    spin.className = 'spin';
    spin.setAttribute('aria-hidden', 'true');
    li.prepend(spin);
    const hint = document.createElement('span');
    hint.className = 'spin-hint';
    hint.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>Drag to spin';
    spin.appendChild(hint);
    let ready = false, frame = 0, timer = 0, drag = null;
    const show = () => { spin.style.backgroundPosition = `${(frame / (FR - 1)) * 100}% 0`; };
    const load = (then) => {
      if (ready) return then?.();
      const img = new Image();
      img.onload = () => { spin.style.backgroundImage = `url(${img.src})`; show(); spin.classList.add('ready'); ready = true; then?.(); };
      img.src = li.dataset.spin;
    };
    const play = (turns = Infinity) => {
      if (reduce) return;
      clearInterval(timer);
      let left = turns * FR;
      timer = setInterval(() => { frame = (frame + 1) % FR; show(); if (--left <= 0) clearInterval(timer); }, 85);
    };
    const stop = () => clearInterval(timer);
    if (canHover) {
      li.addEventListener('pointerenter', () => load(() => { if (!drag) play(); }));
      li.addEventListener('pointerleave', () => { stop(); });
    } else if (hasIO) {
      // touch: load when near, give it one slow turn when it first comes into view
      const tio = new IntersectionObserver((e) => {
        if (e[0].isIntersecting) { tio.disconnect(); load(() => { li.classList.add('touched'); play(1); }); }
      }, { threshold: 0.7 });
      tio.observe(li);
    }
    spin.addEventListener('pointerdown', (ev) => {
      load();
      stop();
      drag = { x: ev.clientX, f: frame };
      spin.setPointerCapture(ev.pointerId);
    });
    spin.addEventListener('pointermove', (ev) => {
      if (!drag || !ready) return;
      const step = Math.round((ev.clientX - drag.x) / 14);
      frame = (((drag.f - step) % FR) + FR) % FR;
      show();
    });
    const end = () => { drag = null; };
    spin.addEventListener('pointerup', end);
    spin.addEventListener('pointercancel', end);
  });

  // ---------- arenas: play the fly-over on hover (or when in view on touch screens)
  if (!reduce) {
    const arenas = document.querySelectorAll('.arena[data-clip]');
    const attach = (a) => {
      let v = a.querySelector('video');
      if (!v) {
        v = document.createElement('video');
        Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto' });
        v.setAttribute('aria-hidden', 'true');
        v.src = a.dataset.clip;
        a.querySelector('img').after(v);
        v.addEventListener('playing', () => v.classList.add('on'));
      }
      return v;
    };
    if (canHover) {
      arenas.forEach((a) => {
        a.addEventListener('pointerenter', () => { const v = attach(a); v.currentTime = 0; v.play().catch(() => {}); });
        a.addEventListener('pointerleave', () => { const v = a.querySelector('video'); if (v) { v.classList.remove('on'); v.pause(); } });
      });
    } else if (hasIO) {
      const aio = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) attach(e.target).play().catch(() => {});
          else { const v = e.target.querySelector('video'); if (v) { v.pause(); v.classList.remove('on'); } }
        }
      }, { threshold: 0.75 });
      arenas.forEach((a) => aio.observe(a));
    }
  }

  onFrame();
})();
