(function(){
  const loader = document.getElementById('siteLoader');
  if (!loader) return;

  document.body.style.overflow = 'hidden';

  function hideLoader() {
    loader.classList.add('is-hidden');
    document.body.style.overflow = '';
    const heroVideo = document.getElementById('heroLion');
    if (heroVideo && typeof heroVideo.play === 'function') {
      const p = heroVideo.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    setTimeout(() => loader.remove(), 600);
  }

  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader);
  }
})();

const header = document.getElementById('header');
let lastScroll = 0;

const onScroll = () => {
  const y = window.scrollY;
  if (y > 80) {
    header.classList.add('is-collapsed');
  } else {
    header.classList.remove('is-collapsed');
  }
  lastScroll = y;
};

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const lion = document.getElementById('heroLion');
if (lion) {
  let frozen = false;
  const freezeNow = () => {
    if (frozen) return;
    frozen = true;
    lion.pause();
  };

  lion.addEventListener('timeupdate', () => {
    if (!lion.duration || !isFinite(lion.duration)) return;
    if (lion.currentTime >= lion.duration - 0.12) {
      freezeNow();
    }
  });
}

// Cases: 3D vertical stack carousel (Safari-tabs style)
(function(){
  const stack = document.getElementById('casesStack');
  if (!stack) return;

  const tabs = [...stack.querySelectorAll('.case-tab')];
  const dotsEl = document.getElementById('casesDots');
  const hintEl = document.getElementById('casesHint');
  const N = tabs.length;
  let active = Math.max(0, tabs.findIndex(t => t.classList.contains('is-active')));
  if (active < 0) active = 0;

  // Build dots
  if (dotsEl) {
    for (let i = 0; i < N; i++) {
      const d = document.createElement('span');
      d.className = 'cases__dot';
      d.dataset.idx = String(i);
      dotsEl.appendChild(d);
    }
  }

  function render() {
    const halfN = N / 2;
    tabs.forEach((t, i) => {
      // normalize to [0, N) then fold to (-halfN, halfN]
      let rel = ((i - active) % N + N) % N;
      if (rel > halfN) rel -= N;
      t.classList.toggle('is-active', rel === 0);

      let y, scale, opacity, zi, pe;
      if (rel < 0) {
        // Above — dismissed, off the top
        y = `calc(-100% - ${Math.min(Math.abs(rel), 3) * 10}px)`;
        scale = 0.92;
        opacity = 0;
        zi = 1;
        pe = 'none';
      } else if (rel === 0) {
        y = '0px';
        scale = 1;
        opacity = 1;
        zi = 100;
        pe = 'auto';
      } else {
        // Below — peek stack (show max 4 upcoming, rest hidden)
        const base = 492; // active card height + gap
        const step = 70;
        y = (base + (rel - 1) * step) + 'px';
        scale = Math.max(0.82, 1 - rel * 0.04);
        if (rel > 4) {
          opacity = 0;
          pe = 'none';
        } else {
          opacity = Math.max(0.25, 1 - (rel - 1) * 0.18);
          pe = rel <= 3 ? 'auto' : 'none';
        }
        zi = 100 - rel;
      }

      t.style.setProperty('--y', y);
      t.style.setProperty('--s', scale);
      t.style.setProperty('--o', opacity);
      t.style.zIndex = String(zi);
      t.style.pointerEvents = pe;
    });

    if (dotsEl) {
      dotsEl.querySelectorAll('.cases__dot').forEach((d, i) => {
        d.classList.toggle('is-active', i === active);
      });
    }
  }

  function setActive(idx) {
    idx = ((idx % N) + N) % N;
    if (idx === active) return;
    active = idx;
    markTouched();
    render();
  }

  function next() { setActive(active + 1); }
  function prev() { setActive(active - 1); }

  let touched = false;
  function markTouched() {
    if (touched) return;
    touched = true;
    if (hintEl) hintEl.style.opacity = '0';
    stack.classList.add('is-touched');
  }

  // Wheel / trackpad — advance on the first event of a fresh gesture (gap-based).
  // Any wheel events arriving <120ms apart are treated as the same gesture (inertia)
  // and ignored, so deliberate back-to-back scrolls always register.
  let lastWheelTime = 0;
  stack.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (Math.abs(e.deltaY) < 4) return;
    const now = performance.now();
    const gap = now - lastWheelTime;
    lastWheelTime = now;
    if (gap < 120) return;
    if (e.deltaY > 0) next();
    else prev();
  }, { passive: false });

  // Touch swipe (vertical)
  let touchStartY = null;
  let touchMoved = false;
  stack.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchMoved = false;
  }, { passive: true });
  stack.addEventListener('touchmove', (e) => {
    if (touchStartY === null) return;
    if (Math.abs(e.touches[0].clientY - touchStartY) > 6) touchMoved = true;
  }, { passive: true });
  stack.addEventListener('touchend', (e) => {
    if (touchStartY === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartY = null;
    if (Math.abs(dy) < 40) return;
    if (dy < 0) next();
    else prev();
  });

  // Click on a peek card — bring to focus
  tabs.forEach((t, i) => {
    t.addEventListener('click', (e) => {
      if (e.target.closest('.case-tab__link')) return;
      if (i !== active) setActive(i);
    });
  });

  // Click on a dot — jump to that index
  if (dotsEl) {
    dotsEl.addEventListener('click', (e) => {
      const d = e.target.closest('.cases__dot');
      if (!d) return;
      setActive(+d.dataset.idx);
    });
    dotsEl.style.pointerEvents = 'auto';
  }

  // Keyboard when stack is hovered/focused
  stack.tabIndex = 0;
  stack.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); prev(); }
  });

  render();
})();

// Services: inject icons + scroll animation (stagger fade-in, fill vertical connectors, activate numbers)
(function initServicesAnim() {
  const steps = [...document.querySelectorAll('.services__step')];
  if (!steps.length) return;

  // Icon pool — варьируем по индексу внутри колонки
  const ICONS = [
    // chat
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    // star
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l2.8 5.9 6.2.9-4.5 4.4 1.1 6.3L12 17.8 6.4 20.5l1.1-6.3L3 9.8l6.2-.9L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    // document
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h8l4 4v14H6V3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v4h4M9 12h6M9 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    // scales / gavel
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v18M5 21h14M4 8l4-2 4 2M20 8l-4-2-4 2M4 8l2 6h4L4 8zm16 0l-2 6h-4l6-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    // check circle
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  ];

  document.querySelectorAll('.services__col').forEach(col => {
    const colSteps = col.querySelectorAll('.services__step');
    colSteps.forEach((step, i) => {
      if (step.querySelector('.services__step-icon')) return;
      const icon = document.createElement('div');
      icon.className = 'services__step-icon';
      icon.innerHTML = ICONS[i % ICONS.length];
      step.appendChild(icon);
    });
  });

  // Stagger index для задержки появления
  steps.forEach((step, idx) => {
    const colIndex = [...step.parentElement.children].indexOf(step);
    step.style.transitionDelay = `${colIndex * 90}ms`;
  });

  function checkSteps() {
    const vh = window.innerHeight;
    steps.forEach(step => {
      const rect = step.getBoundingClientRect();
      if (rect.top < vh * 0.88 && rect.bottom > 0) {
        step.classList.add('is-visible');
        step.classList.add('is-active');
        // Когда карточка появилась, рисуем линию от предыдущей цифры к этой
        const prev = step.previousElementSibling;
        if (prev && prev.classList.contains('services__step')) {
          prev.classList.add('is-line-drawn');
        }
      }
    });
  }

  window.addEventListener('scroll', checkSteps, { passive: true });
  window.addEventListener('resize', checkSteps, { passive: true });
  checkSteps();
})();

// Knowledge base: horizontal infinite carousel with category filters
(function initKnowledge() {
  const track = document.getElementById('knowledgeTrack');
  const tpl = document.getElementById('knowledgeData');
  const dataScript = tpl && tpl.content ? tpl.content.querySelector('script') : null;
  if (!track || !dataScript) return;

  let articles;
  try { articles = JSON.parse(dataScript.textContent); } catch (e) { return; }
  if (!articles.length) return;

  const viewport = track.parentElement;
  const slider = viewport.parentElement;
  const prevBtn = slider.querySelector('.knowledge__arrow--prev');
  const nextBtn = slider.querySelector('.knowledge__arrow--next');
  const chips = [...document.querySelectorAll('.knowledge__chip')];

  // Media icons per tone
  const MEDIA_ICONS = {
    a: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v18M5 21h14M4 9l4-2 4 2M20 9l-4-2-4 2M4 9l2 5h4L4 9zm16 0l-2 5h-4l6-5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    b: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M9 4v16" stroke="currentColor" stroke-width="1.6"/></svg>',
    c: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 13c2-1 4-1 6 0s4 1 6 0 4-1 4-1M4 17c2-1 4-1 6 0s4 1 6 0 4-1 4-1M8 7l4-3 4 3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    d: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    e: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    f: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M4 21c1.5-5 4.5-7 8-7s6.5 2 8 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    g: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4h8l4 4v12H6V4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 4v4h4M9 13h6M9 17h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    h: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };

  function buildCard(a) {
    const el = document.createElement('article');
    el.className = 'k-card';
    el.dataset.cat = a.cat;
    el.dataset.tone = a.tone || 'a';
    const img = a.img || '';
    el.innerHTML = `
      <div class="k-card__content">
        <span class="k-card__tag">${a.catLabel}</span>
        <h3 class="k-card__title">${a.title}</h3>
        <p class="k-card__desc">${a.desc}</p>
        <div class="k-card__meta">
          <span class="k-card__meta-item">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            ${a.date}
          </span>
          <span class="k-card__meta-item">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            ${a.read}
          </span>
        </div>
      </div>
      <div class="k-card__media"${img ? ` style="background-image:url('${img}')"` : ''}>
        ${img ? '' : `<div class="k-card__media-inner">${MEDIA_ICONS[a.tone] || MEDIA_ICONS.a}</div>`}
      </div>
    `;
    return el;
  }

  let activeCards = articles.slice();
  let index = 0;
  let isTransitioning = false;

  function getVisibleCount() {
    const w = viewport.clientWidth;
    if (w < 720) return 1;
    if (w < 1200) return 2;
    return 3;
  }

  function render() {
    if (!activeCards.length) {
      track.innerHTML = '<div style="padding:40px;color:rgba(255,255,255,0.5);text-align:center;width:100%">Нет статей в этой категории</div>';
      return;
    }
    track.innerHTML = '';
    const N = activeCards.length;
    const visible = Math.min(getVisibleCount(), N);
    // Render 3 copies for infinite loop
    const copies = N >= visible ? 3 : 1;
    for (let c = 0; c < copies; c++) {
      activeCards.forEach(a => track.appendChild(buildCard(a)));
    }
    index = N >= visible ? N : 0; // start in middle copy
    applyTransform(false);
  }

  function getCardStep() {
    const card = track.querySelector('.k-card');
    if (!card) return 0;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    return card.getBoundingClientRect().width + gap;
  }

  function applyTransform(animate) {
    const step = getCardStep();
    track.classList.toggle('no-anim', !animate);
    track.style.transform = `translate3d(${-index * step}px, 0, 0)`;
    if (!animate) {
      // force reflow so next frame transitions apply
      void track.offsetWidth;
      track.classList.remove('no-anim');
    }
  }

  function move(delta) {
    if (isTransitioning || !activeCards.length) return;
    const N = activeCards.length;
    const visible = Math.min(getVisibleCount(), N);
    if (N <= visible) return; // nothing to scroll
    isTransitioning = true;
    index += delta;
    applyTransform(true);
  }

  track.addEventListener('transitionend', (e) => {
    if (e.target !== track || e.propertyName !== 'transform') return;
    if (!isTransitioning) return;
    isTransitioning = false;
    const N = activeCards.length;
    const visible = Math.min(getVisibleCount(), N);
    if (N <= visible) return;
    // Snap back into middle copy when approaching edges
    if (index >= 2 * N) {
      index -= N;
      applyTransform(false);
    } else if (index < N) {
      index += N;
      applyTransform(false);
    }
  });

  nextBtn.addEventListener('click', () => move(+1));
  prevBtn.addEventListener('click', () => move(-1));

  // Keyboard
  slider.tabIndex = 0;
  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(+1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  });

  // Touch swipe
  let touchX = null;
  viewport.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  viewport.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 40) return;
    move(dx < 0 ? +1 : -1);
  });

  // Filter chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const f = chip.dataset.filter;
      activeCards = f === 'all' ? articles.slice() : articles.filter(a => a.cat === f);
      render();
    });
  });

  // Resize
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      render();
    }, 150);
  });

  render();
})();
