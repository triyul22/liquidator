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
  let lastFrameCanvas = null;

  const captureFrame = () => {
    try {
      if (!lion.videoWidth || !lion.videoHeight) return;
      if (!lastFrameCanvas) {
        lastFrameCanvas = document.createElement('canvas');
        lastFrameCanvas.width = lion.videoWidth;
        lastFrameCanvas.height = lion.videoHeight;
      }
      const ctx = lastFrameCanvas.getContext('2d');
      ctx.drawImage(lion, 0, 0, lastFrameCanvas.width, lastFrameCanvas.height);
    } catch (e) {}
  };

  if ('requestVideoFrameCallback' in lion) {
    const onFrame = () => {
      captureFrame();
      if (!lion.ended && !lion.paused) {
        lion.requestVideoFrameCallback(onFrame);
      }
    };
    lion.requestVideoFrameCallback(onFrame);
  } else {
    lion.addEventListener('timeupdate', captureFrame);
  }

  let swapped = false;
  const swapToCanvas = () => {
    if (swapped) return;
    captureFrame();
    if (!lastFrameCanvas) return;
    swapped = true;

    lastFrameCanvas.className = lion.className;

    if (lion.parentNode) {
      lion.parentNode.replaceChild(lastFrameCanvas, lion);
    }
  };

  lion.addEventListener('ended', swapToCanvas);

  lion.addEventListener('timeupdate', () => {
    if (!lion.duration || !isFinite(lion.duration)) return;
    if (lion.currentTime >= lion.duration - 0.15) {
      swapToCanvas();
    }
  });
}
