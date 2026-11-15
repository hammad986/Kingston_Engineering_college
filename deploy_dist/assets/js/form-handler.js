/**
 * Kingston Engineering College — Unified Form Handler
 *
 * Validates form fields and saves submissions to localStorage.
 * No email sending, no backend, no third-party services required.
 */

(function () {

    /* ──────────────────────────────────────────────────────────────────────
       CONFIGURATION (removed — EmailJS integration removed)
    ────────────────────────────────────────────────────────────────────── */

    /* ──────────────────────────────────────────────────────────────────────
       VALIDATION HELPERS
    ────────────────────────────────────────────────────────────────────── */
    var RULES = {
        email:    /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
        phone:    /^\+?\d{10,13}$/,
        marks:    { min: 0, max: 100 }
    };

    function sanitize(str) {
        return String(str || '')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .trim();
    }

    function getErrorMessage(input) {
        var name  = input.name;
        var type  = input.type;
        var value = input.value.trim();

        if (!value && input.required) return 'This field is required.';

        if (type === 'email' && value) {
            if (!RULES.email.test(value)) return 'Please enter a valid email address.';
        }

        if ((type === 'tel' || name === 'phone') && value) {
            var digits = value.replace(/[\s\-\(\)]/g, '');
            if (!RULES.phone.test(digits)) return 'Enter a valid 10-digit phone number.';
        }

        if (type === 'number' && name === 'marks' && value) {
            var n = parseFloat(value);
            if (isNaN(n) || n < 0 || n > 100) return 'Marks must be between 0 and 100.';
        }

        if (input.tagName === 'SELECT' && input.required && !value) {
            return 'Please select an option.';
        }

        return null;
    }

    function setFieldError(input, msg) {
        clearFieldError(input);
        input.classList.add('field-error');
        input.setAttribute('aria-invalid', 'true');
        var span = document.createElement('span');
        span.className = 'field-error-text';
        span.setAttribute('role', 'alert');
        span.textContent = msg;
        input.parentNode.appendChild(span);
    }

    function clearFieldError(input) {
        input.classList.remove('field-error');
        input.removeAttribute('aria-invalid');
        var el = input.parentNode && input.parentNode.querySelector('.field-error-text');
        if (el) el.remove();
    }

    function validateField(input) {
        var msg = getErrorMessage(input);
        if (msg) { setFieldError(input, msg); return false; }
        clearFieldError(input);
        return true;
    }

    function validateForm(form) {
        var fields = form.querySelectorAll('input[required], select[required], textarea[required], input[name="email"], input[name="phone"], input[name="marks"]');
        var valid  = true;
        var first  = null;
        fields.forEach(function (f) {
            if (!validateField(f)) {
                valid = false;
                if (!first) first = f;
            }
        });
        if (first) {
            first.focus();
            first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return valid;
    }

    /* ──────────────────────────────────────────────────────────────────────
       UI FEEDBACK
    ────────────────────────────────────────────────────────────────────── */
    function setBtn(btn, loading) {
        if (!btn) return;
        if (loading) {
            btn.dataset.orig = btn.innerHTML;
            btn.innerHTML    = '<i class="fa-solid fa-circle-notch fa-spin" style="margin-right:8px;"></i>Sending…';
            btn.disabled     = true;
            btn.style.opacity = '0.75';
        } else {
            btn.innerHTML    = btn.dataset.orig || 'Submit';
            btn.disabled     = false;
            btn.style.opacity = '1';
        }
    }

    function showBanner(form, type, msg) {
        var old = form.querySelector('.kec-form-banner');
        if (old) old.remove();

        var banner = document.createElement('div');
        banner.className = 'kec-form-banner kec-form-banner--' + type;

        var icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
        banner.innerHTML =
            '<i class="fa-solid ' + icon + '" style="margin-right:10px;font-size:1.1em;vertical-align:middle;"></i>' +
            '<span style="vertical-align:middle;">' + msg + '</span>';

        banner.style.cssText = [
            'padding:16px 22px',
            'border-radius:12px',
            'margin-top:22px',
            'font-size:0.97rem',
            'font-weight:600',
            'display:flex',
            'align-items:center',
            'animation:kec-fadein 0.35s ease',
            type === 'success'
                ? 'background:#d4edda;color:#155724;border:1.5px solid #b7dfbe;'
                : 'background:#f8d7da;color:#721c24;border:1.5px solid #f2b8bc;'
        ].join(';');

        var ref = form.querySelector('button[type="submit"]') || form.querySelector('.btn-submit[type="submit"]');
        if (ref && ref.parentNode) {
            ref.parentNode.insertBefore(banner, ref.nextSibling);
        } else {
            form.appendChild(banner);
        }

        if (type === 'success') {
            setTimeout(function () { if (banner.parentNode) banner.remove(); }, 9000);
        }

        return banner;
    }

    /* ──────────────────────────────────────────────────────────────────────
       LOCAL STORAGE FALLBACK
    ────────────────────────────────────────────────────────────────────── */
    function storeLocally(formId, data) {
        var key = 'kec_submission_' + formId;
        try {
            var arr = JSON.parse(localStorage.getItem(key) || '[]');
            arr.push(Object.assign({}, data, { _savedAt: new Date().toISOString() }));
            localStorage.setItem(key, JSON.stringify(arr));
        } catch (e) {}
    }

    /* ──────────────────────────────────────────────────────────────────────
       SUBMIT FORM (localStorage only — no email)
    ────────────────────────────────────────────────────────────────────── */
    function submitForm(formId, params, form) {
        storeLocally(formId, params);
        showBanner(form, 'success',
            'Thank you! Your submission has been received. We will contact you shortly.');
    }

    /* ──────────────────────────────────────────────────────────────────────
       CSS INJECTION  (field-error outline + fade-in)
    ────────────────────────────────────────────────────────────────────── */
    (function injectStyles() {
        if (document.getElementById('kec-form-styles')) return;
        var s = document.createElement('style');
        s.id = 'kec-form-styles';
        s.textContent = [
            '.field-error{border-color:#dc3545!important;box-shadow:0 0 0 3px rgba(220,53,69,.15)!important;}',
            '.field-error-text{color:#dc3545;font-size:.82rem;margin-top:5px;display:block;font-weight:500;}',
            '@keyframes kec-fadein{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}'
        ].join('');
        document.head.appendChild(s);
    })();

    /* ──────────────────────────────────────────────────────────────────────
       LIVE VALIDATION  (per-form setup)
    ────────────────────────────────────────────────────────────────────── */
    function setupLiveValidation(form) {
        form.querySelectorAll('input, select, textarea').forEach(function (el) {
            el.addEventListener('blur', function () { validateField(this); });
            el.addEventListener('input', function () {
                if (this.classList.contains('field-error')) validateField(this);
            });
        });
    }

    /* ──────────────────────────────────────────────────────────────────────
       HANDLER 1 — Admission Enquiry  (#enquiryForm)
    ────────────────────────────────────────────────────────────────────── */
    function handleEnquirySubmit(e) {
        e.preventDefault();
        var form = document.getElementById('enquiryForm') || e.target.closest('form');
        if (!form || !validateForm(form)) return;

        var fd  = new FormData(form);
        var btn = form.querySelector('button[type="submit"]');
        setBtn(btn, true);

        var params = {
            from_name:    sanitize(fd.get('fullName')),
            from_email:   sanitize(fd.get('email')),
            phone:        sanitize(fd.get('phone')),
            course:       sanitize(fd.get('course')),
            message:      sanitize(fd.get('message')) || '—',
            submitted_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        };

        submitForm('enquiry', params, form, btn);
        form.reset();
        setBtn(btn, false);
    }

    /* ──────────────────────────────────────────────────────────────────────
       HANDLER 2 — Contact Form  (.contact-form-section)
    ────────────────────────────────────────────────────────────────────── */
    function handleContactSubmit(e) {
        e.preventDefault();
        var form = e.target.closest('form') || e.target;
        if (!form || !validateForm(form)) return;

        var fd  = new FormData(form);
        var btn = form.querySelector('button[type="submit"]');
        setBtn(btn, true);

        var params = {
            from_name:   sanitize(fd.get('fullName')),
            from_email:  sanitize(fd.get('email')),
            phone:       sanitize(fd.get('phone')),
            subject:     sanitize(fd.get('subject')),
            department:  sanitize(fd.get('department')) || 'General Inquiry',
            message:     sanitize(fd.get('message')),
            submitted_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        };

        submitForm('contact', params, form, btn);
        form.reset();
        setBtn(btn, false);
    }

    /* ──────────────────────────────────────────────────────────────────────
       HANDLER 3 — Apply Now  (#applyForm, multi-step)
    ────────────────────────────────────────────────────────────────────── */
    function handleApplicationSubmit(e) {
        e.preventDefault();
        var form = document.getElementById('applyForm') || e.target.closest('form');
        if (!form || !validateForm(form)) return;

        var fd  = new FormData(form);
        var btn = form.querySelector('button[type="submit"]');
        setBtn(btn, true);

        var params = {
            first_name:   sanitize(fd.get('firstName')),
            last_name:    sanitize(fd.get('lastName')),
            full_name:    sanitize(fd.get('firstName')) + ' ' + sanitize(fd.get('lastName')),
            email:        sanitize(fd.get('email')),
            phone:        sanitize(fd.get('phone')),
            dob:          sanitize(fd.get('dob')),
            gender:       sanitize(fd.get('gender')),
            school_name:  sanitize(fd.get('schoolName')),
            marks:        sanitize(fd.get('marks')),
            community:    sanitize(fd.get('community')),
            category:     sanitize(fd.get('category')),
            course:       sanitize(fd.get('course')),
            submitted_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        };

        submitForm('application', params, form, btn);
        form.reset();
        if (typeof nextStep === 'function') nextStep(1);
        setBtn(btn, false);
    }

    /* ──────────────────────────────────────────────────────────────────────
       EXPOSE GLOBALS
    ────────────────────────────────────────────────────────────────────── */
    window.handleEnquirySubmit     = handleEnquirySubmit;
    window.handleContactSubmit     = handleContactSubmit;
    window.handleApplicationSubmit = handleApplicationSubmit;

    window.KingstonForms = {
        handleEnquirySubmit:     handleEnquirySubmit,
        handleContactSubmit:     handleContactSubmit,
        handleApplicationSubmit: handleApplicationSubmit,
        validateForm:            validateForm,
        validateField:           validateField,
        setupLiveValidation:     setupLiveValidation,
        showBanner:              showBanner
    };

    /* ──────────────────────────────────────────────────────────────────────
       AUTO-ATTACH LIVE VALIDATION ON DOM READY
    ────────────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        [
            document.getElementById('enquiryForm'),
            document.querySelector('.contact-form-section'),
            document.getElementById('applyForm')
        ].forEach(function (f) {
            if (f) setupLiveValidation(f);
        });
    });

})();
