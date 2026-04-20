(function(){
  const loader = document.getElementById('siteLoader');
  if (!loader) return;

  const DURATION = 3500;
  const HOLD_AFTER = 350;

  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    loader.classList.add('is-hidden');
    document.body.style.overflow = '';
    const heroVideo = document.getElementById('heroLion');
    if (heroVideo && typeof heroVideo.play === 'function') {
      const p = heroVideo.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    setTimeout(() => loader.remove(), 800);
  }, DURATION + HOLD_AFTER);
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

  // Wheel / trackpad — gesture-end debounce (one advance per scroll gesture)
  let wheelLock = false;
  let wheelGestureTimer = null;
  stack.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (Math.abs(e.deltaY) < 4) return;
    // reset gesture timer — lock stays until no wheel events for 180ms
    clearTimeout(wheelGestureTimer);
    wheelGestureTimer = setTimeout(() => { wheelLock = false; }, 180);
    if (wheelLock) return;
    wheelLock = true;
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
