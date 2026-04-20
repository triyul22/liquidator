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

// Cases: expand/collapse more cards
(function(){
  const btn = document.getElementById('casesMore');
  const list = document.getElementById('casesList');
  if (!btn || !list) return;

  const label = btn.querySelector('.cases__more-label');
  btn.addEventListener('click', () => {
    const isOpen = list.classList.toggle('is-expanded');
    btn.classList.toggle('is-open', isOpen);
    if (label) label.textContent = isOpen ? 'СКРЫТЬ' : 'БОЛЬШЕ ДЕЛ';
  });
})();

// Detect optional cases background image
(function(){
  const section = document.querySelector('.cases');
  if (!section) return;
  const img = new Image();
  img.onload = () => section.setAttribute('data-has-bg', 'true');
  img.src = 'assets/cases-bg.jpg';
})();
