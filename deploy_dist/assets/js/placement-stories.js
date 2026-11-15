(function () {
  'use strict';

  function buildCard(s) {
    var stars = '<span class="pst-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>';
    return '<div class="pst-card" data-aos="fade-up">' +
      '<div class="pst-top">' +
        '<div class="pst-photo-wrap">' +
          '<img src="' + s.photo_url + '" alt="' + s.name + '" class="pst-photo" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="pst-initials" style="display:none">' + s.name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase() + '</div>' +
        '</div>' +
        '<div class="pst-header">' +
          '<div class="pst-name">' + s.name + '</div>' +
          '<div class="pst-meta">' + s.department + ' &bull; Batch ' + s.batch + '</div>' +
          stars +
        '</div>' +
      '</div>' +
      '<blockquote class="pst-quote">&ldquo;' + s.testimonial + '&rdquo;</blockquote>' +
      '<div class="pst-placement">' +
        '<div class="pst-company">' +
          '<i class="fa-solid fa-building"></i> ' + s.company +
        '</div>' +
        '<div class="pst-role">' +
          '<i class="fa-solid fa-briefcase"></i> ' + s.role +
        '</div>' +
        '<div class="pst-package">' +
          '<i class="fa-solid fa-indian-rupee-sign"></i> ' + s.package_lpa.toFixed(1) + ' LPA' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function init() {
    var section = document.getElementById('success-stories-section');
    if (!section) return;

    fetch('data/success-stories.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var grid = document.getElementById('stories-grid');
        if (!grid) return;
        grid.innerHTML = data.map(buildCard).join('');
        if (window.AOS) AOS.refresh();
      })
      .catch(function (e) { console.warn('placement-stories.js: fetch error', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
