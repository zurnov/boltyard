// BOLTYARD site: nav background, play clips only while visible, roster turnarounds,
// lightbox for screenshots, gentle reveal on scroll. No dependencies.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Hero loop: respect reduced motion (the poster stays).
  const hero = document.querySelector('.hero-media');
  if (hero && reduce) { hero.removeAttribute('autoplay'); hero.pause(); }

  // Clips play only while on screen.
  const clips = document.querySelectorAll('video[data-autoplay]');
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.preload = 'auto'; e.target.play().catch(() => {}); }
        else e.target.pause();
      }
    }, { threshold: 0.35 });
    clips.forEach((v) => io.observe(v));
  } else clips.forEach((v) => v.setAttribute('controls', ''));

  // Roster: hover / focus shows the robot from behind.
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

  // Lightbox for gallery links.
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

  // Reveal sections as they scroll in.
  if (!reduce && 'IntersectionObserver' in window) {
    const els = document.querySelectorAll('.block h2, .block .lead, .bento, .roster, .steps, .arenas, .chips, .letter, .faq-list, .trailer, .clips, .assemble, .wall');
    const ro = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
    }, { threshold: 0.12 });
    els.forEach((el) => { el.classList.add('reveal'); ro.observe(el); });
  }
})();
