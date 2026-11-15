(function () {
  'use strict';

  var allRecruiters = [];
  var activeFilter = 'All';

  function getInitials(name) {
    return name.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function buildCard(r) {
    // Correct paths for placements/ folder to look up to assets/
    var logoPath = '../' + r.logo_url;
    
    return '<div class="pr-card" data-category="' + r.category + '" data-aos="fade-up">' +
      '<div class="pr-logo-row">' +
        '<div class="pr-logo-circle">' +
          '<img src="' + logoPath + '" class="pr-card-logo" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="pr-card-initials" style="display:none">' + getInitials(r.name) + '</div>' +
        '</div>' +
        '<div class="pr-card-category-badge pr-badge-' + r.category.toLowerCase() + '">' + r.category + '</div>' +
      '</div>' +
      '<div class="pr-info">' +
        '<div class="pr-company-name">' + r.name + '</div>' +
        '<div class="pr-roles">' + (r.roles ? r.roles.slice(0, 2).join(', ') : 'Associate Engineer') + '</div>' +
        '<div class="pr-pkg"><i class="fa-solid fa-gift"></i> ' + r.package_range + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderGrid(list) {
    var grid = document.getElementById('recruiters-grid');
    var empty = document.getElementById('recruiters-empty');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = list.map(buildCard).join('');
    if (window.AOS) AOS.refresh();
  }

  function filterRecruiters(cat) {
    activeFilter = cat;
    var filtered = cat === 'All'
      ? allRecruiters
      : allRecruiters.filter(function (r) { return r.category === cat; });
    renderGrid(filtered);

    document.querySelectorAll('.pr-filter-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
  }

  function initFilters() {
    document.querySelectorAll('.pr-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterRecruiters(btn.dataset.cat);
      });
    });
  }

  function init() {
    var section = document.getElementById('recruiters-section');
    if (!section) return;

    fetch('../data/recruiters.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        allRecruiters = data;
        initFilters();
        renderGrid(allRecruiters);

        // Populate Marquees (Top & Bottom)
        var marquees = ['marquee-logos-top', 'marquee-logos'];
        marquees.forEach(function(id) {
          var container = document.getElementById(id);
          if (container) {
            var logosHTML = allRecruiters.map(function (r) {
              return '<div class="m-logo-item" title="' + r.name + '"><img src="../' + r.logo_url + '" alt="' + r.name + '"></div>';
            }).join('');
            // Triple for extra smoothness on large screens
            container.innerHTML = logosHTML + logosHTML + logosHTML;
          }
        });
      })
      .catch(function (e) { console.warn('placement-recruiters.js: fetch error', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
