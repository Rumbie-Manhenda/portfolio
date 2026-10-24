/* main.js — site behaviour for the STUDIO KILN portfolio.
   Keeps every animation on the theme's --tp-* motion tokens. */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. Mobile navigation drawer
   * ------------------------------------------------------------------ */
  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var drawer = document.querySelector('.nav-drawer');
    if (!toggle || !drawer) return;

    function close() {
      drawer.dataset.open = 'false';
      toggle.setAttribute('aria-expanded', 'false');
    }

    function open() {
      drawer.dataset.open = 'true';
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.dataset.open = 'false';
    drawer.dataset.open = 'false';

    toggle.addEventListener('click', function () {
      if (drawer.dataset.open === 'true') close();
      else open();
    });

    drawer.addEventListener('click', function (event) {
      if (event.target.closest('a')) close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    document.addEventListener('click', function (event) {
      if (!drawer.contains(event.target) && !toggle.contains(event.target)) close();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) close();
    });
  }

  /* ------------------------------------------------------------------
   * 2. Skill bars — fill when the panel enters the viewport
   * ------------------------------------------------------------------ */
  function initSkillBars() {
    var skills = document.querySelectorAll('.skill[data-pct]');
    if (!skills.length) return;

    skills.forEach(function (skill) {
      skill.style.setProperty('--pct', skill.dataset.pct + '%');
    });

    if (!window.IntersectionObserver) {
      skills.forEach(function (skill) { skill.dataset.armed = 'true'; });
      return;
    }

    var skillsList = Array.prototype.slice.call(skills);
    var stagger = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--tp-stagger')
    ) || 80;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var index = Math.max(skillsList.indexOf(el), 0);
        window.setTimeout(function () {
          el.dataset.armed = 'true';
        }, index * stagger);
        observer.unobserve(el);
      });
    }, { threshold: 0.35 });

    skills.forEach(function (skill) { observer.observe(skill); });
  }

  /* ------------------------------------------------------------------
   * 3. Numbers that count up once, then hold
   * ------------------------------------------------------------------ */
  function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length || !window.IntersectionObserver) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = Number(el.dataset.count);
        if (isNaN(target)) { observer.unobserve(el); return; }

        var duration = 900;
        var start = null;

        function step(timestamp) {
          if (start === null) start = timestamp;
          var progress = Math.min((timestamp - start) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = String(Math.round(target * eased));
          if (progress < 1) window.requestAnimationFrame(step);
        }

        window.requestAnimationFrame(step);
        observer.unobserve(el);
      });
    }, { threshold: 0.5 });

    counters.forEach(function (counter) { observer.observe(counter); });
  }

  /* ------------------------------------------------------------------
   * 4. Footer year
   * ------------------------------------------------------------------ */
  function initYear() {
    var slots = document.querySelectorAll('[data-year]');
    var year = String(new Date().getFullYear());
    slots.forEach(function (slot) { slot.textContent = year; });
  }

  /* ------------------------------------------------------------------
   * 5. Forms — send by the best available route, report inline
   *    Endpoints: POST /submit  (email, message)
   *               POST /submit_rec (email_rec, name_rec, message_rec)
   *
   * form-delivery.js chooses the route and posts: the Express API whenever it
   * answers, the form service from api-config.js when it does not — which is
   * what happens on the published static site. This section only deals with
   * the visitor: validating, disabling the button, and writing the reply into
   * the status area.
   * ------------------------------------------------------------------ */

  /**
   * Build the once-per-page sender from the settings in api-config.js.
   * Returns { send, warmUp, warmService }, or null when form-delivery.js is
   * missing.
   */
  function createSender() {
    if (!window.PortfolioDelivery) return null;

    return window.PortfolioDelivery.createSender({
      api: window.PORTFOLIO_API,
      service: window.PORTFOLIO_FORM_ENDPOINT,
      protocol: window.location.protocol,
      host: window.location.hostname
    });
  }

  /** Turn a failed submission into something worth showing a visitor. */
  function formErrorMessage(error) {
    if (error && error.name === 'TypeError') {
      return 'Could not reach the message server. Please check your connection and try again, or email me directly.';
    }

    // A route that cannot deliver at all — no API here, and no fallback
    // configured — is a setup problem, not the visitor's mistake, so say so
    // rather than repeating a bare 404 from the host.
    var delivery = window.PortfolioDelivery;
    if (delivery && delivery.isFallbackWarranted(error && error.status)) {
      return 'The message server is not connected to this copy of the site yet. Please email me directly — the address is in the footer.';
    }

    return (error && error.message) || 'Something went wrong — please try again.';
  }

  function setStatus(form, state, message) {
    var box = form.querySelector('.form-status');
    if (!box) return;
    box.dataset.state = state;
    var text = box.querySelector('[data-status-text]');
    if (text) text.textContent = message;
  }

  function clearStatus(form) {
    var box = form.querySelector('.form-status');
    if (box && box.dataset.state) delete box.dataset.state;
  }

  function initForms() {
    var forms = document.querySelectorAll('form[data-endpoint]');
    if (!forms.length) return;

    var delivery = createSender();
    if (!delivery) {
      console.error('form-delivery.js is missing, so the forms cannot send.');
      return;
    }

    // Decide the route while the visitor is still reading: by the time they
    // press send, a static host no longer pays for a doomed POST to an API it
    // does not run. It is a same-origin request, so visitors who never touch
    // the form cost nothing and contact nobody else.
    delivery.warmUp();

    forms.forEach(function (form) {
      var submit = form.querySelector('button[type="submit"]');

      // The moment they start filling it in, open the mail service's
      // connection. The DNS lookup and TLS handshake then happen while they
      // type, not between the click and the send. Throttled inside, so this
      // is safe to call on every keystroke.
      form.addEventListener('focusin', function () { delivery.warmService(); });

      form.addEventListener('input', function () {
        clearStatus(form);
        delivery.warmService();
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        clearStatus(form);

        // Browsers skip empty fields, so an untouched form sends nothing.
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        if (submit) submit.disabled = true;
        setStatus(form, 'pending', 'Sending…');

        delivery.send(form.dataset.endpoint, new FormData(form))
          .then(function (result) {
            if (!result.ok) {
              var failure = new Error(result.body || 'Request failed');
              failure.status = result.status;
              throw failure;
            }

            setStatus(form, 'sent', result.body || 'Thank you — your message is with me.');
            form.reset();
          })
          .catch(function (error) {
            console.error('Form submission failed:', error);
            setStatus(form, 'error', formErrorMessage(error));
          })
          .finally(function () {
            if (submit) submit.disabled = false;
          });
      });
    });
  }

  /* ------------------------------------------------------------------
   * 6. Boot
   * ------------------------------------------------------------------ */
  function boot() {
    initNav();
    initSkillBars();
    initCounters();
    initYear();
    initForms();
    if (typeof window.initReveals === 'function') window.initReveals(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
