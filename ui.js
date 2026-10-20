/* Taxi Mela - mobile-safe UI layer (plain script; does NOT wait for Firebase / Razorpay / Maps).
   Hamburger, Home tabs/radios, Book a Ride tabs/radios and car cards run from here.
   Fare / payment / Firebase logic stays in app.js (unchanged).
   One delegated 'click' listener: fires reliably on touch and behaves the same on PC. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var setHidden = function (sel, on) { var e = $(sel); if (e) e.classList.toggle('hidden', !!on); };
  var dataOf = function (sel, key, dflt) { var e = $(sel); return (e && e.dataset[key]) || dflt; };

  /* ---------- Hamburger menu ---------- */
  function menuIsOpen() { var n = $('.navlinks'); return !!(n && n.classList.contains('open')); }
  function setMenu(open) {
    var btn = $('.menu'), nav = $('.navlinks');
    if (!btn || !nav) return;
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    btn.textContent = open ? '\u2715' : '\u2630';
  }

  /* ---------- Home page ---------- */
  function renderHome() {
    var mode = dataOf('.tm-tab.active', 'homeMode', 'outstation');
    var la = mode === 'local';
    var sv = dataOf('.tm-radio[data-home-service].active', 'homeService', 'local');
    setHidden('#homeOutstationFields', la);
    setHidden('#homeLocalAirportFields', !la);
    setHidden('#homeLocalFields', !la || sv !== 'local');
    setHidden('#homeAirportFields', !la || sv !== 'airport');
    setHidden('#homeAddCity', mode !== 'outstation');
    setHidden('#homeTrip', mode !== 'outstation');
    var d = $('#homeDistance');
    if (d) { d.textContent = ''; d.classList.remove('error'); }
  }

  /* ---------- Book a Ride page ---------- */
  var CABS = ['Hatchback', 'Sedan', 'Ertiga', 'Innova', 'Innova Crysta'];
  function syncCabs() {
    var sel = $('#category');
    if (!sel) return;
    var mode = dataOf('.tab.active', 'mode', 'outstation');
    var cur = sel.value;
    var allowed = mode === 'outstation' ? CABS : CABS.filter(function (c) { return c !== 'Innova Crysta'; });
    sel.innerHTML = allowed.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    sel.value = allowed.indexOf(cur) > -1 ? cur : (allowed.indexOf('Sedan') > -1 ? 'Sedan' : allowed[0]);
  }
  function resetFare() { setHidden('#customerBlock', true); setHidden('#carList', true); setHidden('#paymentBlock', true); setHidden('#fareBox', true); }
  function renderBookMode(m) {
    syncCabs();
    setHidden('#outstationFields', m !== 'outstation');
    setHidden('#localFields', m !== 'local');
    setHidden('#airportFields', m !== 'airport');
    setHidden('#outstation-trip', m !== 'outstation');
    setHidden('#toll-wrap', m !== 'outstation');
    setHidden('#returnWrap', m !== 'outstation');
    setHidden('#extraHoursWrap', m !== 'local');
    resetFare();
  }
  function pick(selector, chosen) { $$(selector).forEach(function (x) { x.classList.toggle('active', x === chosen); }); }

  /* ---------- Extra cities: Round Trip only for 2 cities ---------- */
  function addExtraCityRow(wrap, listId) {
    var row = document.createElement('div');
    row.className = 'tm-extra-city';
    row.innerHTML = '<span style="width:22px;color:#7e8590">\u2316</span><input list="' + listId + '" placeholder="Search another city" autocomplete="off">';
    wrap.appendChild(row);
  }
  function syncTripLock() {
    $$('.tm-extra-city').forEach(function (r) {
      if (!r.querySelector('.tm-extra-remove')) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tm-extra-remove';
        b.setAttribute('aria-label', 'Remove city');
        b.textContent = '\u2715';
        b.style.cssText = 'border:0;background:transparent;font-size:16px;cursor:pointer;color:#7e8590;padding:0 6px';
        r.appendChild(b);
      }
    });
    var pairs = [
      ['#homeExtraCities', '.tm-radio[data-home-trip="roundtrip"]', '.tm-radio[data-home-trip="oneway"]', '.tm-radio[data-home-trip]'],
      ['#bookExtraCities', '.radio[data-trip="roundtrip"]', '.radio[data-trip="oneway"]', '.radio[data-trip]']
    ];
    pairs.forEach(function (p) {
      var has = $$(p[0] + ' input').length > 0;
      var rt = $(p[1]), ow = $(p[2]);
      if (!rt) return;
      rt.style.opacity = has ? '0.4' : '';
      if (has && rt.classList.contains('active') && ow) {
        pick(p[3], ow);
        if (p[0] === '#bookExtraCities') { resetFare(); setHidden('#returnWrap', true); }
      }
    });
  }

  /* ---------- Clicks (single delegated listener) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target, el;
    setTimeout(syncTripLock, 0);
    if (!t || !t.closest) return;

    // Menu
    if (t.closest('.menu')) { e.stopPropagation(); setMenu(!menuIsOpen()); return; }
    if (t.closest('.navlinks a')) { setMenu(false); return; }
    if (menuIsOpen() && !t.closest('.navlinks')) setMenu(false);

    // Extra cities (Book a Ride add / remove / round-trip lock)
    if (t.closest('#bookAddCity')) {
      var bw = $('#bookExtraCities');
      if (bw) addExtraCityRow(bw, 'bookCities');
      return;
    }
    if ((el = t.closest('.tm-extra-remove'))) {
      var rr = el.closest('.tm-extra-city');
      if (rr) rr.remove();
      return;
    }
    if (t.closest('.radio[data-trip="roundtrip"]') && $$('#bookExtraCities input').length) {
      var f2 = $('#formMsg');
      if (f2) { f2.textContent = 'Round Trip is available only for 2 cities. Remove the extra city to select Round Trip.'; f2.classList.remove('hidden'); }
      return;
    }
    if (t.closest('.tm-radio[data-home-trip="roundtrip"]') && $$('#homeExtraCities input').length) {
      var d2 = $('#homeDistance');
      if (d2) { d2.textContent = 'Round Trip is available only for 2 cities. Remove the extra city to select Round Trip.'; d2.classList.add('error'); }
      return;
    }

    // Home page
    if ((el = t.closest('.tm-tab[data-home-mode]'))) { pick('.tm-tab[data-home-mode]', el); renderHome(); return; }
    if ((el = t.closest('.tm-radio[data-home-trip]'))) { pick('.tm-radio[data-home-trip]', el); return; }
    if ((el = t.closest('.tm-radio[data-home-service]'))) { pick('.tm-radio[data-home-service]', el); renderHome(); return; }
    if (t.closest('#homeAddCity')) {
      var wrap = $('#homeExtraCities');
      if (!wrap) return;
      var row = document.createElement('div');
      row.className = 'tm-extra-city';
      row.innerHTML = '<span style="width:22px;color:#7e8590">\u2316</span><input list="homeCities" placeholder="Search another city" autocomplete="off">';
      wrap.appendChild(row);
      return;
    }
    if ((el = t.closest('.tm-car-card'))) { location.href = 'book.html?category=' + encodeURIComponent(el.dataset.car || 'Sedan'); return; }

    // Book a Ride page
    if ((el = t.closest('.tab[data-mode]'))) { pick('.tab[data-mode]', el); renderBookMode(el.dataset.mode); return; }
    if ((el = t.closest('.radio[data-trip]'))) { pick('.radio[data-trip]', el); resetFare(); return; }

    // Buttons that need Firebase / Maps / Razorpay (handled in app.js). If app.js has not loaded yet,
    // show a visible message instead of silently doing nothing.
    if (t.closest('#homeSubmit,#estimateBtn,#payBtn') && !window.__tmAppReady) {
      var msg = 'The page is still loading. Please wait a few seconds and try again, or refresh the page.';
      var d = $('#homeDistance'), f = $('#formMsg');
      if (d) { d.textContent = msg; d.classList.add('error'); }
      else if (f) { f.textContent = msg; f.classList.remove('hidden'); }
    }
  });

  window.addEventListener('scroll', function () {
    var n = $('.nav');
    if (n) n.classList.toggle('scrolled', window.scrollY > 25);
  }, { passive: true });

  function init() { if ($('#homeLocalAirportFields')) renderHome(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
