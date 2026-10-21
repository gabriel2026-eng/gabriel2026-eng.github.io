/* Oak & Form: demo site.
   Plain JavaScript, no libraries. Everything lives in one function so the page stays clean. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
     SETTINGS: the only place you change for a real client
     --------------------------------------------------------------- */
  var CONFIG = {
    // true = demo: the form and WhatsApp only show how they would work; nothing is sent.
    // For a real client set false and fill in formEndpoint and whatsappNumber.
    demo: true,
    // The service that receives the form (e.g. Formspree, Netlify Forms, a Google Apps Script).
    formEndpoint: '',
    // WhatsApp number with country code, no + or spaces (e.g. 407xxxxxxxx).
    whatsappNumber: '40700000000',
    whatsappText: 'Hello! I would like a quote for a custom piece of furniture.'
  };

  var root = document.documentElement;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Short notification ---------- */
  var toastEl = $('#toast');
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4500);
  }

  /* ---------- Light / dark theme ---------- */
  function temaCurenta() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function aplicaTema(t) {
    root.setAttribute('data-theme', t);
    var meta = $('#tc');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#15100c' : '#f6f1e9');
    try { localStorage.setItem('tema', t); } catch (e) { /* private mode: ignore */ }
  }
  var btnTema = $('#tema');
  if (btnTema) {
    btnTema.addEventListener('click', function () {
      aplicaTema(temaCurenta() === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- Header: shadow on scroll + mobile menu ---------- */
  var header = $('.site-header');
  var burger = $('#burger');
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setMeniu(deschis) {
    if (!header || !burger) return;
    header.classList.toggle('open', deschis);
    burger.setAttribute('aria-expanded', String(deschis));
  }
  if (burger) {
    burger.addEventListener('click', function () {
      setMeniu(!header.classList.contains('open'));
    });
  }
  $$('#meniu a').forEach(function (a) {
    a.addEventListener('click', function () { setMeniu(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMeniu(false);
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) setMeniu(false);
  });

  /* ---------- Highlight the current section in the menu ---------- */
  if ('IntersectionObserver' in window) {
    var legaturi = {};
    $$('#meniu a[href^="#"]').forEach(function (a) { legaturi[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (intrari) {
      intrari.forEach(function (i) {
        if (!i.isIntersecting) return;
        Object.keys(legaturi).forEach(function (k) { legaturi[k].classList.remove('active'); });
        if (legaturi[i.target.id]) legaturi[i.target.id].classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(legaturi).forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) spy.observe(sec);
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (intrari, obs) {
      intrari.forEach(function (i) {
        if (i.isIntersecting) { i.target.classList.add('in'); obs.unobserve(i.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Pre-select the project type in the form ---------- */
  function alegeProiect(valoare) {
    var sel = $('#f-proiect');
    if (!sel || !valoare) return;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === valoare) { sel.value = valoare; break; }
    }
  }
  $$('[data-proiect]').forEach(function (el) {
    el.addEventListener('click', function () { alegeProiect(el.getAttribute('data-proiect')); });
  });

  /* ---------- Gallery: filters ---------- */
  var chips = $$('.chip[data-filtru]');
  var lucrari = $$('.work');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filtru');
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
      lucrari.forEach(function (w) {
        w.hidden = !(f === 'toate' || w.getAttribute('data-cat') === f);
      });
    });
  });

  /* ---------- Gallery: lightbox ---------- */
  var lb = $('#lightbox');
  if (lb && typeof lb.showModal === 'function') {
    var lbArt = $('.lb-art', lb);
    var lbTitlu = $('#lb-titlu');
    var lbSub = $('.lb-sub', lb);
    var lbDesc = $('.lb-desc', lb);
    var lbCta = $('.lb-cta', lb);
    var ultimulButon = null;

    $$('.work-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var li = btn.closest('.work');
        var svg = $('svg', btn);
        lbArt.innerHTML = svg ? svg.outerHTML : '';
        lbArt.setAttribute('style', li.getAttribute('style') || ''); // keeps the wall tint
        lbTitlu.textContent = $('.work-title', btn).textContent;
        lbSub.textContent = $('.work-sub', btn).textContent;
        lbDesc.textContent = li.getAttribute('data-desc') || '';
        lbCta.setAttribute('data-proiect', li.getAttribute('data-proiect') || '');
        ultimulButon = btn;
        lb.showModal();
      });
    });
    $('.lb-close', lb).addEventListener('click', function () { lb.close(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); }); // click on the backdrop
    lb.addEventListener('close', function () { if (ultimulButon) ultimulButon.focus(); });
    lbCta.addEventListener('click', function () {
      alegeProiect(lbCta.getAttribute('data-proiect'));
      lb.close();
    });
  } else {
    // Old browser without <dialog>: the buttons stay plain cards
    $$('.work-more').forEach(function (m) { m.hidden = true; });
  }

  /* ---------- Contact form (no server) ---------- */
  var form = $('#contact-form');
  var okBox = $('#form-ok');
  var REGULI = {
    nume: function (v) { return v.length >= 2 ? '' : 'Please tell us your name.'; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Please enter a valid email address.'; },
    telefon: function (v) { return v === '' || /^[+\d][\d\s().-]{6,}$/.test(v) ? '' : 'The number looks incomplete.'; },
    mesaj: function (v) { return v.length >= 10 ? '' : 'Briefly describe what you need (at least 10 characters).'; }
  };

  function setEroare(camp, mesaj) {
    var wrap = camp.closest('.field') || camp.closest('.check');
    var err = document.getElementById('err-' + camp.name);
    if (wrap) wrap.classList.toggle('has-error', !!mesaj);
    if (err) err.textContent = mesaj;
    camp.setAttribute('aria-invalid', mesaj ? 'true' : 'false');
  }
  function valideazaCamp(camp) {
    var mesaj = '';
    if (camp.name === 'acord') {
      mesaj = camp.checked ? '' : 'Please tick the consent box so we can reply.';
    } else if (REGULI[camp.name]) {
      mesaj = REGULI[camp.name](camp.value.trim());
    }
    setEroare(camp, mesaj);
    return !mesaj;
  }
  function pauza(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // In the real version the data goes to formEndpoint. In the demo we only simulate a short wait.
  function trimite(date) {
    if (CONFIG.demo || !CONFIG.formEndpoint) return pauza(900).then(function () { return true; });
    return fetch(CONFIG.formEndpoint, { method: 'POST', headers: { 'Accept': 'application/json' }, body: date })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  if (form) {
    form.noValidate = true; // we validate ourselves, with messages in the page
    var campuri = $$('input[name], select[name], textarea[name]', form)
      .filter(function (c) { return c.name !== 'website'; });
    campuri.forEach(function (c) {
      c.addEventListener('blur', function () { if (REGULI[c.name] && c.value !== '') valideazaCamp(c); });
      c.addEventListener('input', function () {
        if (c.closest('.has-error')) valideazaCamp(c);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var primulGresit = null;
      campuri.forEach(function (c) {
        if (!valideazaCamp(c) && !primulGresit) primulGresit = c;
      });
      if (primulGresit) { primulGresit.focus(); return; }

      // Honeypot field for bots: a person never sees or fills it
      if (form.elements.website && form.elements.website.value) return;

      var btn = $('button[type="submit"]', form);
      var text = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';

      trimite(new FormData(form)).then(function (ok) {
        btn.disabled = false;
        btn.textContent = text;
        if (!ok) { toast('We could not send the message. Please try again or call us.'); return; }
        $('#ok-nume').textContent = form.elements.nume.value.trim().split(/\s+/)[0];
        $('#ok-email').textContent = form.elements.email.value.trim();
        form.hidden = true;
        $('#form-intro').hidden = true;
        okBox.hidden = false;
        okBox.focus();
      });
    });

    $('#alt-mesaj').addEventListener('click', function () {
      form.reset();
      campuri.forEach(function (c) { setEroare(c, ''); });
      okBox.hidden = true;
      form.hidden = false;
      $('#form-intro').hidden = false;
      form.elements.nume.focus();
    });
  }

  /* ---------- WhatsApp button ---------- */
  var waToggle = $('#wa-toggle');
  var waPanel = $('#wa-panel');
  var waLink = $('#wa-link');
  if (waToggle && waPanel && waLink) {
    waLink.setAttribute('href', 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(CONFIG.whatsappText));
    waToggle.addEventListener('click', function () {
      var deschis = waPanel.hidden;
      waPanel.hidden = !deschis;
      waToggle.setAttribute('aria-expanded', String(deschis));
    });
    waLink.addEventListener('click', function (e) {
      if (CONFIG.demo) {
        e.preventDefault();
        toast('Demo: this would open WhatsApp with the message ready to send.');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !waPanel.hidden) { waPanel.hidden = true; waToggle.setAttribute('aria-expanded', 'false'); waToggle.focus(); }
    });
  }

  /* ---------- Footer year ---------- */
  var an = $('#an');
  if (an) an.textContent = String(new Date().getFullYear());
})();
