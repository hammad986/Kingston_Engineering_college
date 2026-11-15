(function () {
  'use strict';

  var countersDone = false;

  function animateCounter(el, target, decimals, suffix) {
    var start = 0;
    var duration = 1800;
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      var current = start + (target - start) * ease;
      el.textContent = current.toFixed(decimals) + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target.toFixed(decimals) + suffix;
      }
    }
    requestAnimationFrame(step);
  }

  function triggerCounters(data) {
    if (countersDone) return;
    countersDone = true;
    var o = data.overall;
    var pctEl  = document.getElementById('stat-percent');
    var avgEl  = document.getElementById('stat-avg');
    var highEl = document.getElementById('stat-highest');
    var coEl   = document.getElementById('stat-companies');
    var stuEl  = document.getElementById('stat-students');
    if (pctEl)  animateCounter(pctEl,  o.placement_percent,    0, '%');
    if (avgEl)  animateCounter(avgEl,  o.avg_package_lpa,      1, ' LPA');
    if (highEl) animateCounter(highEl, o.highest_package_lpa,  1, ' LPA');
    if (coEl)   animateCounter(coEl,   o.companies_visited,    0, '+');
    if (stuEl)  animateCounter(stuEl,  o.students_placed,      0, '');
  }

  function renderDeptTable(depts) {
    var tbody = document.getElementById('dept-tbody');
    if (!tbody) return;
    tbody.innerHTML = depts.map(function (d) {
      var barWidth = Math.min(d.percent, 100);
      return '<tr>' +
        '<td class="ps-dept-name">' + d.name + '</td>' +
        '<td>' + d.eligible + '</td>' +
        '<td>' + d.placed + '</td>' +
        '<td>' +
          '<div class="ps-bar-wrap"><div class="ps-bar" style="width:' + barWidth + '%"></div></div>' +
          '<span class="ps-bar-label">' + d.percent + '%</span>' +
        '</td>' +
        '<td>' + d.avg_lpa.toFixed(1) + ' LPA</td>' +
        '<td>' + d.highest_lpa.toFixed(1) + ' LPA</td>' +
      '</tr>';
    }).join('');
  }

  function applyYear(allData, year) {
    var entry = allData.years.find(function (y) { return y.year === year; });
    if (!entry) return;
    var o = entry.overall;

    var pctEl  = document.getElementById('stat-percent');
    var avgEl  = document.getElementById('stat-avg');
    var highEl = document.getElementById('stat-highest');
    var coEl   = document.getElementById('stat-companies');
    var stuEl  = document.getElementById('stat-students');
    if (pctEl)  pctEl.textContent  = o.placement_percent + '%';
    if (avgEl)  avgEl.textContent  = o.avg_package_lpa.toFixed(1) + ' LPA';
    if (highEl) highEl.textContent = o.highest_package_lpa.toFixed(1) + ' LPA';
    if (coEl)   coEl.textContent   = o.companies_visited + '+';
    if (stuEl)  stuEl.textContent  = o.students_placed;

    renderDeptTable(entry.departments);

    var activeYear = document.getElementById('active-year-label');
    if (activeYear) activeYear.textContent = entry.label;
  }

  function initYearButtons(allData) {
    var btns = document.querySelectorAll('.ps-year-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        countersDone = true;
        applyYear(allData, btn.dataset.year);
      });
    });
  }

  function init() {
    var section = document.getElementById('placement-stats-section');
    if (!section) return;

    fetch('data/placement-stats.json')
      .then(function (r) { return r.json(); })
      .then(function (allData) {
        var latestYear = allData.years[0];

        initYearButtons(allData);

        renderDeptTable(latestYear.departments);

        var observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              triggerCounters(latestYear);
              observer.disconnect();
            }
          });
        }, { threshold: 0.2 });
        observer.observe(section);
      })
      .catch(function (e) { console.warn('placement-stats.js: fetch error', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
