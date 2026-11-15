/**
 * Kingston Engineering College - Blog Management System
 * Features: Dynamic JSON rendering, Filter animations, Content Modal
 */

(function() {
    'use strict';

    // State
    let blogData = [];
    let activeFilter = 'all';

    // Selectors
    const grid = document.getElementById('blog-grid');
    const filterContainer = document.getElementById('filter-container');
    const emptyState = document.getElementById('blog-empty');
    const modal = document.getElementById('blog-modal');
    const closeModalBtn = document.getElementById('modal-close');

    /**
     * INIT: Fetch data and start the page
     */
    async function init() {
        try {
            // Load JSON (using actual path)
            const response = await fetch('data/blogs.json');
            blogData = await response.json();
            
            // Initial Render
            render(blogData);
            
            // Event Listeners
            setupEventListeners();
        } catch (error) {
            console.error('Error loading blog data:', error);
            // Fallback content if fetch fails
            grid.innerHTML = '<p class="text-center w-full">Error loading stories. Please refresh or try again later.</p>';
        }
    }

    /**
     * RENDER: Create card elements and inject into DOM
     */
    function render(data) {
        // Clear grid
        grid.innerHTML = '';
        
        if (data.length === 0) {
            emptyState.style.display = 'block';
            return;
        } else {
            emptyState.style.display = 'none';
        }

        data.forEach((post, index) => {
            const card = document.createElement('div');
            card.className = 'blog-card';
            card.setAttribute('data-aos', 'fade-up');
            card.setAttribute('data-aos-delay', (index % 3) * 150);
            
            card.innerHTML = `
                <div class="blog-card-img-wrap">
                    <img src="${post.image}" alt="${post.title}" loading="lazy" 
                         onerror="this.src='assets/images/icons/001-web_logo_banner_2026.png'; this.style.objectFit='contain';">
                    <span class="blog-card-cat">${post.category}</span>
                </div>
                <div class="blog-card-content">
                    <div class="blog-card-date">
                        <i class="fa-regular fa-calendar"></i> ${post.date}
                    </div>
                    <h3 class="blog-card-title">${post.title}</h3>
                    <p class="blog-card-excerpt">${post.excerpt}</p>
                    <div class="blog-card-footer">
                        <span class="read-more-btn">Read Entry <i class="fa-solid fa-arrow-right-long"></i></span>
                    </div>
                </div>
            `;

            // Click listener for modal
            card.onclick = () => openModal(post);
            
            grid.appendChild(card);
        });

        // Trigger AOS refresh
        if (window.AOS) AOS.refresh();
    }

    /**
     * SETUP: Event listeners for filters and modals
     */
    function setupEventListeners() {
        // Filter Click
        filterContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;

            // UI Update
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            // Logic
            activeFilter = chip.getAttribute('data-cat');
            filterAndRender();
        });

        // Close Modal
        closeModalBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        // Keyboard close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('visible')) {
                closeModal();
            }
        });
    }

    /**
     * LOGIC: Filter data based on active category
     */
    function filterAndRender() {
        // CSS transition effect for grid
        grid.style.opacity = '0';
        grid.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
            const filtered = activeFilter === 'all' 
                ? blogData 
                : blogData.filter(p => p.category === activeFilter);
            
            render(filtered);
            
            grid.style.opacity = '1';
            grid.style.transform = 'translateY(0)';
        }, 300);
    }

    /**
     * MODAL: Manage detail view
     */
    function openModal(post) {
        document.getElementById('modal-img').src = post.image;
        document.getElementById('modal-img').onerror = function() {
            this.src = 'assets/images/icons/001-web_logo_banner_2026.png';
        };
        document.getElementById('modal-title').textContent = post.title;
        document.getElementById('modal-cat').textContent = post.category;
        document.getElementById('modal-date').textContent = post.date;
        document.getElementById('modal-text').innerHTML = `
            <p style="margin-bottom: 20px; font-weight: 500;">${post.excerpt}</p>
            <p>${post.content}</p>
        `;

        modal.classList.add('visible');
        document.body.style.overflow = 'hidden'; // Prevent scroll
    }

    function closeModal() {
        modal.classList.remove('visible');
        document.body.style.overflow = 'auto'; // Restore scroll
    }

    // Run
    init();

})();
