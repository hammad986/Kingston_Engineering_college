// =============================================
// navbar.js — Responsive navbar + mobile accordion
// =============================================

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const hamburger = document.getElementById('hamburger');
    const navMenu   = document.getElementById('nav-menu');
    const header    = document.getElementById('site-header');
    const dropItems = document.querySelectorAll('.nav-item.has-dropdown');

    // --- Create overlay ---
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    overlay.id = 'nav-overlay';
    document.body.appendChild(overlay);

    // --- Toggle mobile menu ---
    function openMenu() {
      navMenu.classList.add('open');
      hamburger.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      navMenu.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      overlay.classList.remove('show');
      document.body.style.overflow = '';
      // close all accordions
      dropItems.forEach(function (item) { item.classList.remove('accordion-open'); });
    }

    hamburger && hamburger.addEventListener('click', function () {
      navMenu.classList.contains('open') ? closeMenu() : openMenu();
    });

    overlay.addEventListener('click', closeMenu);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    // --- Mobile accordion for dropdowns ---
    function isMobile() { return window.innerWidth <= 1024; }

    dropItems.forEach(function (item) {
      const link = item.querySelector('a');
      link && link.addEventListener('click', function (e) {
        if (!isMobile()) return; // desktop — let CSS handle hover
        e.preventDefault();
        const isOpen = item.classList.contains('accordion-open');
        // Close all
        dropItems.forEach(function (i) { i.classList.remove('accordion-open'); });
        if (!isOpen) item.classList.add('accordion-open');
      });
    });

    // --- Close menu on desktop resize ---
    window.addEventListener('resize', function () {
      if (!isMobile()) closeMenu();
    });

    // --- Sticky header shadow on scroll ---
    window.addEventListener('scroll', function () {
      if (window.scrollY > 60) {
        header && header.classList.add('scrolled');
      } else {
        header && header.classList.remove('scrolled');
      }
    }, { passive: true });

    // --- Active nav link highlighting ---
    const navLinks = document.querySelectorAll('.nav-item > a');
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    navLinks.forEach(function (link) {
      const href = link.getAttribute('href') || '';
      if (href.includes(currentPath) && currentPath !== '') {
        link.closest('.nav-item').classList.add('active');
      }
    });
  });
})();
