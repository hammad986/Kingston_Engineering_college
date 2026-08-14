/**
 * ==========================================
 * MEGA MENU — Reusable Flyout Navigation
 * ==========================================
 * 
 * Handles:
 * - Desktop hover + submenu positioning (edge detection)
 * - Mobile/tablet accordion-style toggle
 * - Closing menus on Escape / outside click
 * - Responsive mode switching (resize listener)
 * 
 * Usage:
 *   <li class="flyout-trigger">
 *     <a href="#">Category</a>
 *     <ul class="flyout-menu">
 *       <li class="flyout-trigger">
 *         <a href="#">Subcategory ›</a>
 *         <ul class="flyout-submenu">
 *           <li><a href="/page.html">Page</a></li>
 *         </ul>
 *       </li>
 *     </ul>
 *   </li>
 * 
 * Initialize automatically on DOMContentLoaded.
 * Re-initialize manually via window.KingstonMegaMenu.refresh() after dynamic content loads.
 */

var KingstonMegaMenu = (function() {
    'use strict';

    /* ── Configuration ── */
    var BREAKPOINT = 1024; // px — below this, accordion mode activates
    var HOVER_DELAY = 250; // ms — debounce for hover to reduce accidental triggers

    /* ── State ── */
    var isMobile = window.innerWidth <= BREAKPOINT;
    var hoverTimers = {}; // track setTimeout IDs per trigger

    /* ── Initialize ── */
    function init() {
        isMobile = window.innerWidth <= BREAKPOINT;
        bindDesktopHover();
        bindMobileClick();
        bindGlobalClose();
        bindResize();
    }

    /* ── Desktop: Hover with debounce ── */
    function bindDesktopHover() {
        if (isMobile) return;

        var triggers = document.querySelectorAll('.flyout-menu > .flyout-trigger');
        triggers.forEach(function(trigger) {
            var id = getTriggerId(trigger);

            // Remove old listeners to avoid duplicates
            trigger.removeEventListener('mouseenter', handleEnter);
            trigger.removeEventListener('mouseleave', handleLeave);
            trigger.removeEventListener('click', handleDesktopClick);

            trigger.addEventListener('mouseenter', handleEnter);
            trigger.addEventListener('mouseleave', handleLeave);
            trigger.addEventListener('click', handleDesktopClick);

            // Store reference
            trigger._flyoutId = id;
        });
    }

    function handleEnter(e) {
        var trigger = e.currentTarget;
        var id = trigger._flyoutId;

        // Clear any pending leave timer
        if (hoverTimers[id + '_leave']) {
            clearTimeout(hoverTimers[id + '_leave']);
            delete hoverTimers[id + '_leave'];
        }

        // Show with a small delay to prevent accidental triggers
        if (hoverTimers[id + '_enter']) clearTimeout(hoverTimers[id + '_enter']);
        hoverTimers[id + '_enter'] = setTimeout(function() {
            var submenu = trigger.querySelector('.flyout-submenu');
            if (submenu) {
                // Edge detection: if submenu goes off-screen, flip it
                positionSubmenu(submenu);
                submenu.style.display = 'block';
                submenu.style.opacity = '1';
                submenu.style.visibility = 'visible';
                submenu.style.transform = 'translateX(0)';
            }
        }, HOVER_DELAY);
    }

    function handleLeave(e) {
        var trigger = e.currentTarget;
        var id = trigger._flyoutId;

        // Cancel pending enter timer
        if (hoverTimers[id + '_enter']) {
            clearTimeout(hoverTimers[id + '_enter']);
            delete hoverTimers[id + '_enter'];
        }

        // Hide after a small delay to allow moving from category to submenu
        if (hoverTimers[id + '_leave']) clearTimeout(hoverTimers[id + '_leave']);
        hoverTimers[id + '_leave'] = setTimeout(function() {
            var submenu = trigger.querySelector('.flyout-submenu');
            if (submenu) {
                submenu.style.display = 'none';
                submenu.style.opacity = '0';
                submenu.style.visibility = 'hidden';
                submenu.style.transform = 'translateX(4px)';
            }
        }, 150);
    }

    function handleDesktopClick(e) {
        // On desktop, prevent the parent link from navigating
        // when clicking the trigger (the submenu items are the targets)
        var trigger = e.currentTarget;
        var submenu = trigger.querySelector('.flyout-submenu');
        if (submenu) {
            e.preventDefault();
        }
    }

    /* ── Edge detection: flip submenu if it overflows the viewport ── */
    function positionSubmenu(submenu) {
        submenu.classList.remove('flyout-submenu-left');
        // Reset position first
        submenu.style.left = '';
        submenu.style.right = '';

        // Force layout to get dimensions
        submenu.style.display = 'block';
        submenu.style.opacity = '0';
        submenu.style.visibility = 'hidden';

        var rect = submenu.getBoundingClientRect();
        var viewportWidth = window.innerWidth;

        // If submenu extends beyond right edge, flip it
        if (rect.right > viewportWidth - 10) {
            submenu.classList.add('flyout-submenu-left');
        }

        submenu.style.display = '';
        submenu.style.opacity = '';
        submenu.style.visibility = '';
    }

    /* ── Mobile: Accordion click toggle ── */
    function bindMobileClick() {
        if (!isMobile) return;

        var triggers = document.querySelectorAll('.flyout-menu > .flyout-trigger');
        triggers.forEach(function(trigger) {
            trigger.removeEventListener('click', handleMobileToggle);
            trigger.addEventListener('click', handleMobileToggle);
        });
    }

    function handleMobileToggle(e) {
        // Get the direct anchor link
        var link = e.currentTarget.querySelector(':scope > a');
        var submenu = e.currentTarget.querySelector(':scope > .flyout-submenu');

        if (!submenu) {
            // No submenu, navigate normally
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Toggle this submenu
        var isOpen = submenu.classList.contains('flyout-open');
        
        // Close all sibling submenus first
        var parent = e.currentTarget.parentElement;
        if (parent) {
            parent.querySelectorAll(':scope > .flyout-trigger > .flyout-submenu.flyout-open').forEach(function(sm) {
                sm.classList.remove('flyout-open');
            });
            parent.querySelectorAll(':scope > .flyout-trigger.flyout-open').forEach(function(tr) {
                tr.classList.remove('flyout-open');
            });
        }

        if (!isOpen) {
            submenu.classList.add('flyout-open');
            e.currentTarget.classList.add('flyout-open');
        }
    }

    /* ── Global Close: Escape key and outside click ── */
    function bindGlobalClose() {
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeAllSubmenus();
            }
        });

        document.addEventListener('click', function(e) {
            // Close if click is outside any flyout
            var isFlyout = e.target.closest('.flyout-menu, .flyout-submenu, .flyout-trigger');
            if (!isFlyout && isMobile) {
                closeAllSubmenus();
            }
        });
    }

    function closeAllSubmenus() {
        document.querySelectorAll('.flyout-submenu.flyout-open').forEach(function(sm) {
            sm.classList.remove('flyout-open');
        });
        document.querySelectorAll('.flyout-menu > .flyout-trigger.flyout-open').forEach(function(tr) {
            tr.classList.remove('flyout-open');
        });
        // Also hide desktop submenus
        document.querySelectorAll('.flyout-submenu').forEach(function(sm) {
            if (!isMobile) {
                sm.style.display = 'none';
                sm.style.opacity = '0';
                sm.style.visibility = 'hidden';
                sm.style.transform = 'translateX(4px)';
            }
        });
    }

    /* ── Responsive: Re-bind on resize ── */
    function bindResize() {
        var resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                var newIsMobile = window.innerWidth <= BREAKPOINT;
                if (newIsMobile !== isMobile) {
                    isMobile = newIsMobile;
                    closeAllSubmenus();
                    init();
                }
            }, 200);
        });
    }

    /* ── Utility: Unique ID for each trigger ── */
    var triggerCounter = 0;
    function getTriggerId(trigger) {
        if (!trigger._flyoutId) {
            triggerCounter++;
            trigger._flyoutId = 'flyout-' + triggerCounter;
        }
        return trigger._flyoutId;
    }

    /* ── Public API ── */
    function refresh() {
        closeAllSubmenus();
        // Clear timers
        Object.keys(hoverTimers).forEach(function(k) {
            clearTimeout(hoverTimers[k]);
        });
        hoverTimers = {};
        init();
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init: init,
        refresh: refresh,
        closeAll: closeAllSubmenus
    };
})();
