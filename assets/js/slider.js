// =============================================
// slider.js — Hero image slider logic
// =============================================

(function () {
  'use strict';

  const slides = document.querySelectorAll('.hero-slide');
  const indicators = document.querySelectorAll('.indicator');
  let current = 0;
  let autoTimer = null;
  const DURATION = 3000;

  function goTo(index) {
    if (!slides.length) return;
    // Exit current
    slides[current].classList.add('exit-left');
    slides[current].classList.remove('active');
    indicators[current].classList.remove('active');

    // After exit animation, clean up
    const prev = current;
    setTimeout(() => {
      slides[prev].classList.remove('exit-left');
    }, 900);

    // Enter new
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    indicators[current].classList.add('active');
  }

  function next() {
    goTo(current + 1);
  }

  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(next, DURATION);
  }

  function stopAuto() {
    clearInterval(autoTimer);
  }

  // Indicator clicks
  indicators.forEach(function (btn, idx) {
    btn.addEventListener('click', function () {
      if (idx === current) return;
      stopAuto();
      goTo(idx);
      startAuto();
    });
  });

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { stopAuto(); goTo(current - 1); startAuto(); }
    if (e.key === 'ArrowRight') { stopAuto(); goTo(current + 1); startAuto(); }
  });

  // Touch swipe support
  const heroSection = document.getElementById('hero-section');
  if (heroSection) {
    let startX = 0;
    heroSection.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
    heroSection.addEventListener('touchend', function (e) {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) {
        stopAuto();
        goTo(dx < 0 ? current + 1 : current - 1);
        startAuto();
      }
    }, { passive: true });
  }

  // Wait for DOM ready
  document.addEventListener('DOMContentLoaded', function () {
    if (slides.length) {
      slides[0].classList.add('active');
      indicators[0] && indicators[0].classList.add('active');
      startAuto();
    }
  });
})();
