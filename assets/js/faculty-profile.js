/**
 * Kingston Engineering College — Faculty Profile & Directory
 * - With ?slug=X → individual profile view
 * - Without slug → searchable faculty directory
 */

const KEC_FacultyProfile = (() => {

  var allFacultyData = [];

  // ─────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────
  async function init() {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get('slug');

    try {
      var res = await fetch('data/faculty.json');
      allFacultyData = await res.json();

      if (slug) {
        loadProfile(slug);
      } else {
        loadDirectory();
      }
    } catch (e) {
      console.error('[KEC Faculty]', e);
      setContent('<div class="container" style="text-align:center;padding:80px 20px;">' +
        '<h2 style="color:#666;">Error loading faculty data</h2>' +
        '<p style="color:#999;">Please try again later.</p></div>');
    }
  }

  function setContent(html) {
    var main = document.querySelector('main');
    if (main) main.innerHTML = html;
  }

  // ─────────────────────────────────────────
  //  PROFILE MODE  (with ?slug=)
  // ─────────────────────────────────────────
  function loadProfile(slug) {
    var person = allFacultyData.find(function(f) { return f.slug === slug; });

    if (!person) {
      setContent('<div class="container" style="text-align:center;padding:80px 20px;">' +
        '<h2 style="color:#666;">Faculty member not found</h2>' +
        '<p><a href="faculty-profile.html" style="color:#003366;font-weight:600;">View all faculty →</a></p></div>');
      return;
    }

    document.title = person.name + ' — Faculty, ' + person.department + ' | Kingston Engineering College';
    var meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = person.name + ' — ' + person.designation + ' at Kingston Engineering College.';

    updateHeroProfile(person);
    renderProfileBody(person);
  }

  function catColor(category) {
    var colors = { 'doctorate': '#8b1a2b', 'guide': '#1a5276', 'scholar': '#1e8449' };
    return colors[category.split(',')[0]] || '#003366';
  }

  function catLabel(category) {
    var cats = category.split(',');
    var out = [];
    for (var i = 0; i < cats.length; i++) {
      out.push(cats[i].charAt(0).toUpperCase() + cats[i].slice(1));
    }
    return out.join(' & ');
  }

  function updateHeroProfile(person) {
    var hero = document.querySelector('.faculty-page-hero');
    if (!hero) return;
    var c = hero.querySelector('.container');
    if (!c) return;
    var color = catColor(person.category);

    c.innerHTML =
      '<p class="faculty-breadcrumb">' +
        '<a href="index.html">Home</a> &rsaquo; ' +
        '<a href="faculty-profile.html">Faculty Directory</a> &rsaquo; ' +
        '<span>Profile</span>' +
      '</p>' +
      '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' +
        '<div style="width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,0.15);' +
          'display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#f5c518;' +
          'border:3px solid rgba(255,255,255,0.2);flex-shrink:0;">' +
          '<i class="fa-solid fa-user-graduate"></i>' +
        '</div>' +
        '<div>' +
          '<h1 style="font-size:2rem;font-weight:800;margin:0 0 6px;">' + escapeHtml(person.name) + '</h1>' +
          '<p style="margin:0 0 8px;font-size:1rem;opacity:0.9;">' +
            escapeHtml(person.designation) +
            '<span style="opacity:0.5;margin:0 8px;">|</span>' +
            escapeHtml(person.department) +
          '</p>' +
          '<span style="display:inline-block;background:' + color + ';padding:3px 12px;border-radius:20px;' +
            'font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;">' +
            catLabel(person.category) +
          '</span>' +
        '</div>' +
      '</div>';
    if (window.AOS) setTimeout(function() { AOS.refresh(); }, 100);
  }

  function renderProfileBody(person) {
    var tags = '';
    for (var i = 0; i < person.research_areas.length; i++) {
      tags += '<span style="background:#eef2fb;color:#003366;padding:6px 14px;border-radius:20px;' +
        'font-size:0.85rem;font-weight:600;border:1px solid #d5e0f5;">' +
        escapeHtml(person.research_areas[i]) + '</span>';
    }

    setContent(
      '<section style="padding:60px 0;background:#f8f9fa;">' +
        '<div class="container" style="max-width:960px;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">' +

            '<div>' +
              '<div style="background:#fff;padding:35px;border-radius:16px;box-shadow:0 4px 15px rgba(0,0,0,0.05);">' +
                '<h2 style="color:#003366;font-size:1.4rem;font-weight:800;margin-bottom:20px;' +
                  'border-bottom:3px solid #f5c518;padding-bottom:10px;">' +
                  '<i class="fa-solid fa-circle-info" style="color:#003366;margin-right:10px;"></i> About' +
                '</h2>' +
                '<p style="color:#444;font-size:1rem;line-height:1.8;">' + escapeHtml(person.bio) + '</p>' +
                '<div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
                  '<div style="background:#f8f9fa;padding:16px;border-radius:10px;">' +
                    '<p style="margin:0 0 4px;color:#888;font-size:0.8rem;font-weight:600;text-transform:uppercase;">Experience</p>' +
                    '<p style="margin:0;color:#003366;font-weight:700;font-size:1.1rem;">' + escapeHtml(person.experience) + '</p>' +
                  '</div>' +
                  '<div style="background:#f8f9fa;padding:16px;border-radius:10px;">' +
                    '<p style="margin:0 0 4px;color:#888;font-size:0.8rem;font-weight:600;text-transform:uppercase;">Publications</p>' +
                    '<p style="margin:0;color:#003366;font-weight:700;font-size:1.1rem;">' + person.publications + '+</p>' +
                  '</div>' +
                  '<div style="background:#f8f9fa;padding:16px;border-radius:10px;grid-column:1/-1;">' +
                    '<p style="margin:0 0 4px;color:#888;font-size:0.8rem;font-weight:600;text-transform:uppercase;">Qualification</p>' +
                    '<p style="margin:0;color:#003366;font-weight:700;font-size:1.1rem;">' + escapeHtml(person.qualification) + '</p>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div>' +
              '<div style="background:#fff;padding:35px;border-radius:16px;box-shadow:0 4px 15px rgba(0,0,0,0.05);margin-bottom:25px;">' +
                '<h3 style="color:#003366;font-size:1.2rem;font-weight:800;margin-bottom:16px;' +
                  'border-bottom:3px solid #f5c518;padding-bottom:10px;">' +
                  '<i class="fa-solid fa-flask" style="color:#003366;margin-right:10px;"></i> Research Areas' +
                '</h3>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + tags + '</div>' +
              '</div>' +

              '<div style="background:#fff;padding:35px;border-radius:16px;box-shadow:0 4px 15px rgba(0,0,0,0.05);">' +
                '<h3 style="color:#003366;font-size:1.2rem;font-weight:800;margin-bottom:16px;' +
                  'border-bottom:3px solid #f5c518;padding-bottom:10px;">' +
                  '<i class="fa-solid fa-envelope" style="color:#003366;margin-right:10px;"></i> Contact' +
                '</h3>' +
                '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f8f9fa;border-radius:10px;">' +
                  '<i class="fa-solid fa-envelope" style="color:#003366;font-size:1.2rem;"></i>' +
                  '<a href="mailto:' + person.email + '" style="color:#003366;font-weight:600;text-decoration:none;">' + person.email + '</a>' +
                '</div>' +
                '<p style="margin-top:12px;color:#888;font-size:0.85rem;">' +
                  '<i class="fa-solid fa-building"></i> ' + escapeHtml(person.department) +
                '</p>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div style="text-align:center;margin-top:40px;">' +
            '<a href="faculty-profile.html" style="display:inline-flex;align-items:center;gap:10px;background:#003366;' +
              'color:#fff;padding:12px 30px;border-radius:10px;text-decoration:none;font-weight:700;transition:all 0.3s;">' +
              '<i class="fa-solid fa-arrow-left"></i> Back to Faculty Directory' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</section>');
  }

  // ─────────────────────────────────────────
  //  DIRECTORY MODE  (no slug)
  // ─────────────────────────────────────────
  function loadDirectory() {
    document.title = 'Faculty Directory — Kingston Engineering College';

    var hero = document.querySelector('.faculty-page-hero');
    if (hero) {
      var c = hero.querySelector('.container');
      if (c) {
        c.innerHTML =
          '<p class="faculty-breadcrumb"><a href="index.html">Home</a> &rsaquo; <span>Faculty Directory</span></p>' +
          '<h1 style="font-size:2rem;font-weight:800;margin:0 0 8px;">Faculty Directory</h1>' +
          '<p style="color:rgba(255,255,255,0.7);font-size:1rem;margin:0;">' + allFacultyData.length + ' faculty members across all departments</p>';
      }
    }

    // Collect unique departments for filter chips
    var deptSet = {};
    for (var i = 0; i < allFacultyData.length; i++) {
      deptSet[allFacultyData[i].department] = true;
    }
    var departments = Object.keys(deptSet).sort();

    renderDirectoryView(departments);
    if (window.AOS) setTimeout(function() { AOS.refresh(); }, 100);
  }

  function renderDirectoryView(departments) {
    // Build category filter chips
    var filterChips =
      '<div class="faculty-filter-chip active" data-filter="all">All</div>' +
      '<div class="faculty-filter-chip" data-filter="doctorate">Doctorates</div>' +
      '<div class="faculty-filter-chip" data-filter="guide">Guides</div>' +
      '<div class="faculty-filter-chip" data-filter="scholar">Scholars</div>';

    // Build department filter chips (limit to a reasonable amount)
    for (var d = 0; d < departments.length; d++) {
      var short = departments[d].replace('Engineering', '').replace('Master of Business Administration', 'MBA')
        .replace('Artificial Intelligence and Data Science', 'AI & DS')
        .replace('Computer Science and Business Systems', 'CSBS')
        .replace('Computer Science and Engineering', 'CSE')
        .replace('Electronics and Communication Engineering', 'ECE')
        .replace('Electrical and Electronics Engineering', 'EEE')
        .replace('Information Technology', 'IT')
        .replace('Mechanical Engineering', 'MECH')
        .replace('Science and Humanities', 'S&H');
      filterChips += '<div class="faculty-filter-chip" data-filter="dept:' + departments[d] + '">' + short + '</div>';
    }

    var html =
      '<section class="faculty-directory-section">' +
        '<div class="container">' +

          /* Search bar */
          '<div class="faculty-search-bar">' +
            '<i class="fa-solid fa-search"></i>' +
            '<input type="text" id="facultySearchInput" placeholder="Search by name, department, or research area..." oninput="KEC_FacultyProfile.filterDirectory()">' +
          '</div>' +

          /* Category filter chips */
          '<div class="faculty-filter-chips" id="facultyFilterChips">' + filterChips + '</div>' +

          /* Results count */
          '<div class="faculty-results-count" id="facultyResultsCount">Showing all ' + allFacultyData.length + ' faculty members</div>' +

          /* Faculty grid */
          '<div class="faculty-grid" id="facultyGrid">' +
            buildFacultyCards(allFacultyData) +
          '</div>' +
        '</div>' +
      '</section>';

    setContent(html);

    // Wire up filter click events
    var chips = document.querySelectorAll('#facultyFilterChips .faculty-filter-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function() {
        var chipsAll = document.querySelectorAll('#facultyFilterChips .faculty-filter-chip');
        for (var j = 0; j < chipsAll.length; j++) {
          chipsAll[j].classList.remove('active');
        }
        this.classList.add('active');
        KEC_FacultyProfile.filterDirectory();
      });
    }
  }

  function buildFacultyCards(list) {
    if (!list || list.length === 0) {
      return '<div class="faculty-empty-state">' +
        '<i class="fa-solid fa-search"></i>' +
        '<h3>No faculty members found</h3>' +
        '<p>Try adjusting your search or filter criteria.</p></div>';
    }

    var cards = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var color = catColor(p.category);
      var label = catLabel(p.category);

      // Short department name
      var deptShort = p.department.replace('Engineering', '').replace('Master of Business Administration', 'MBA')
        .replace('Artificial Intelligence and Data Science', 'AI & DS')
        .replace('Computer Science and Business Systems', 'CSBS')
        .replace('Computer Science and Engineering', 'CSE')
        .replace('Electronics and Communication Engineering', 'ECE')
        .replace('Electrical and Electronics Engineering', 'EEE')
        .replace('Information Technology', 'IT')
        .replace('Mechanical Engineering', 'MECH')
        .replace('Science and Humanities', 'S&H');

      cards +=
        '<a href="faculty-profile.html?slug=' + p.slug + '" class="faculty-dir-card">' +
          '<div class="faculty-dir-card-avatar"><i class="fa-solid fa-user-tie"></i></div>' +
          '<h3>' + escapeHtml(p.name) + '</h3>' +
          '<p class="dir-designation">' + escapeHtml(p.designation) + '</p>' +
          '<p class="dir-department"><i class="fa-solid fa-building" style="color:#aaa;font-size:0.75rem;"></i> ' + escapeHtml(deptShort) + '</p>' +
          '<div class="dir-tags">' +
            '<span class="dir-tag" style="background:' + color + ';">' + label + '</span>' +
          '</div>' +
        '</a>';
    }
    return cards;
  }

  // ─────────────────────────────────────────
  //  FILTER (called from oninput + chip clicks)
  // ─────────────────────────────────────────
  function filterDirectory() {
    var input = document.getElementById('facultySearchInput');
    var query = input ? input.value.toLowerCase().trim() : '';

    // Get active filter chip
    var activeChip = document.querySelector('#facultyFilterChips .faculty-filter-chip.active');
    var filter = activeChip ? activeChip.getAttribute('data-filter') : 'all';

    var filtered = [];
    for (var i = 0; i < allFacultyData.length; i++) {
      var p = allFacultyData[i];

      // Category filter
      if (filter !== 'all') {
        if (filter.indexOf('dept:') === 0) {
          var deptFilter = filter.substring(5);
          if (p.department !== deptFilter) continue;
        } else {
          // Check if the p's category includes this filter value
          if (p.category.indexOf(filter) === -1) continue;
        }
      }

      // Text search
      if (query) {
        var searchText = (p.name + ' ' + p.department + ' ' + p.research_areas.join(' ') + ' ' + p.designation).toLowerCase();
        if (searchText.indexOf(query) === -1) continue;
      }

      filtered.push(p);
    }

    // Update grid
    var grid = document.getElementById('facultyGrid');
    if (grid) {
      grid.innerHTML = buildFacultyCards(filtered);
    }

    // Update count
    var count = document.getElementById('facultyResultsCount');
    if (count) {
      if (query || filter !== 'all') {
        count.textContent = 'Showing ' + filtered.length + ' of ' + allFacultyData.length + ' faculty members';
      } else {
        count.textContent = 'Showing all ' + allFacultyData.length + ' faculty members';
      }
    }
  }

  // ─────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────
  return {
    init: init,
    filterDirectory: filterDirectory
  };
})();

document.addEventListener('DOMContentLoaded', function() { KEC_FacultyProfile.init(); });
