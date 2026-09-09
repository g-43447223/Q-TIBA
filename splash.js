/* ============================================================
   Q-TIBA SPLASH SCREEN — skrin pemuatan interaktif berkongsi
   Dikongsi oleh index.html, scan.html, gate.html, parent.html
   Auto-inject CSS + DOM, tanpa kebergantungan luar.
   ============================================================ */
(function () {
  'use strict';
  if (window.__QTIBA_SPLASH__) return;
  window.__QTIBA_SPLASH__ = true;

  var MIN_MS = 1300;          // tempoh minimum splash sebelum boleh hilang
  var MAX_MS = 9000;          // had maksimum (pintu keselamatan) — tak akan lekat
  var MAX_AUTO = 82;          // peratus maksimum semasa "memuat" tanpa done()

  var state = { progress: 0, done: false, tsStart: Date.now() };

  // ---------- Paparan (CSS dibina sekali) ----------
  var style = document.createElement('style');
  style.textContent = [
    '#qtiba-splash{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;',
    '  background:radial-gradient(60% 50% at 20% 15%,rgba(6,182,212,.22),transparent 55%),',
    '  radial-gradient(55% 55% at 85% 25%,rgba(139,92,246,.18),transparent 60%),',
    '  radial-gradient(70% 70% at 55% 100%,rgba(34,211,238,.12),transparent 60%),',
    '  linear-gradient(160deg,#020617,#0f172a 55%,#020617);',
    '  transition:opacity .55s ease;overflow:hidden}',
    '#qtiba-splash .qs-inner{position:relative;max-width:340px;width:90%;margin:0 auto;',
    '  padding:38px 30px;border-radius:28px;text-align:center;',
    '  background:rgba(15,23,42,.55);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);',
    '  border:1px solid rgba(255,255,255,.09);box-shadow:0 24px 70px rgba(0,0,0,.55);}',
    '#qtiba-splash .qs-logo{width:86px;height:86px;margin:0 auto 14px;border-radius:22px;',
    '  display:flex;align-items:center;justify-content:center;overflow:hidden;',
    '  background:rgba(6,182,212,.14);border:1px solid rgba(6,182,212,.28);',
    '  animation:qs-float 2.4s ease-in-out infinite, qs-glow 2.4s ease-in-out infinite;}',
    '#qtiba-splash .qs-logo img{width:76%;height:76%;object-fit:contain;animation:qs-spin-slow 9s linear infinite;}',
    '#qtiba-splash .qs-fallback{font-size:38px;font-weight:900;color:#22d3ee;}',
    '#qtiba-splash h1{margin:0 0 2px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    '  font-size:24px;font-weight:900;letter-spacing:.5px;color:#fff;text-shadow:0 2px 18px rgba(34,211,238,.45);}',
    '#qtiba-splash p{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    '  color:#64748b;font-size:11.5px;font-weight:600;letter-spacing:1.5px;margin:0 0 22px;text-transform:uppercase;}',
    '#qtiba-splash .qs-bar{position:relative;height:9px;border-radius:999px;overflow:hidden;',
    '  background:rgba(148,163,184,.16);box-shadow:inset 0 1px 3px rgba(0,0,0,.35);}',
    '#qtiba-splash .qs-fill{position:absolute;left:0;top:0;bottom:0;width:0%;border-radius:999px;',
    '  background:linear-gradient(90deg,#06b6d4,#22d3ee,#818cf8,#06b6d4);background-size:220% 100%;',
    '  animation:qs-shimmer 1.6s linear infinite;}',
    '#qtiba-splash .qs-pct{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;font-weight:700;',
    '  color:#22d3ee;margin-top:8px;letter-spacing:1px;}',
    '#qtiba-splash .qs-msg{margin-top:4px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    '  font-size:13px;font-weight:700;color:#cbd5e1;min-height:20px;}',
    '#qtiba-splash .qs-tip{margin-top:18px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    '  font-size:11px;font-weight:500;line-height:1.55;color:#475569;}',
    '#qtiba-splash .qs-tip b{color:#22d3ee;font-weight:700;}',
    '#qtiba-splash .qs-skip{display:none;margin-top:16px;font-size:11px;font-weight:700;color:#64748b;',
    '  letter-spacing:.5px;text-transform:uppercase;cursor:pointer;user-select:none;padding:8px 0;}',
    '@keyframes qs-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}',
    '@keyframes qs-glow{0%,100%{box-shadow:0 0 0 0 rgba(6,182,212,.0),0 0 24px rgba(6,182,212,.14)}',
    '  50%{box-shadow:0 0 0 10px rgba(6,182,212,0),0 0 42px rgba(6,182,212,.34)}}',
    '@keyframes qs-spin-slow{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
    '@keyframes qs-shimmer{0%{background-position:0% 0}100%{background-position:-220% 0}}',
    '@media (prefers-reduced-motion:reduce){#qtiba-splash *{animation-duration:.001ms !important;animation-iteration-count:1 !important}}'
  ].join('\n');
  document.head.appendChild(style);

  // ---------- Tetapan ----------
  var TIPS = [
    'Semua data diambil <b>live</b> terus dari Google Sheet.',
    'Sistem berfungsi walaupun <b>offline</b> menggunakan data cache.',
    'Imbas QR murid di pintu masuk untuk merekod kelewatan.',
    'KPI dikira automatik: hadir, lewat, dan tak hadir.',
    'Ibu bapa boleh pantau anak melalui portal khusus.',
    'Data disimpan selamat dalam Google Sheets anda.'
  ];
  var autoProgress = 3;
  var autoTimer = null;
  var skipTimer = null;

  function selectTip(seed) {
    var random = ((seed * 9301 + 49297) % 233280) / 233280;
    return TIPS[Math.floor(random * TIPS.length)];
  }

  function autoStep() {
    // Naik sedikit demi sedikit, deselerasi menghampiri MAX_AUTO
    autoProgress += Math.max(0.6, (MAX_AUTO - autoProgress) * 0.08);
    if (autoProgress >= MAX_AUTO) autoProgress = MAX_AUTO;
    setProgress(autoProgress, true);
    if (autoProgress >= MAX_AUTO) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function messageFor(p) {
    if (p < 20) return 'Menyambung ke pelayan&hellip;';
    if (p < 38) return 'Memuatkan data murid&hellip;';
    if (p < 55) return 'Menyusun rekod kelewatan&hellip;';
    if (p < 72) return 'Mengira analisis &amp; KPI&hellip;';
    if (p < 88) return 'Hampir siap&hellip;';
    return 'Sedia!';
  }

  function setProgress(p, isAuto) {
    if (state.done) return;
    state.progress = Math.max(0, Math.min(100, p));
    fillEl.style.width = state.progress + '%';
    pctEl.textContent = Math.round(state.progress) + '%';
    if (!isAuto) msgEl.innerHTML = messageFor(state.progress);
  }

  function showSkip() {
    skipEl.style.display = 'block';
  }

  function forceProgress() {
    if (state.progress < 100) setProgress(100, false);
  }

  function fadeOut(text) {
    if (state.done) return;
    state.done = true;
    if (text) msgEl.innerHTML = text;
    forceProgress();
    skipEl.style.display = 'none';
    clearInterval(autoTimer);
    clearTimeout(skipTimer);
    overlay.style.pointerEvents = 'none';
    setTimeout(function () {
      overlay.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 600);
    }, 420);
  }

  // ---------- API global ----------
  window.QTIBA_Splash = {
    // Panggil bila data utama selesai dimuatkan — splash akan pudar pantas.
    done: function (msg) {
      var remaining = MIN_MS - (Date.now() - state.tsStart);
      if (remaining > 0) {
        forceProgress();
        setTimeout(function () { fadeOut(msg || 'Sedia!'); }, Math.min(remaining, 400));
      } else {
        fadeOut(msg || 'Sedia!');
      }
    },
    // Panggil ikut peratus sebenar (cth. QTibaSplash.setProgress(45)).
    setProgress: function (p) {
      if (p >= 100) { fadeOut('Sedia!'); return; }
      setProgress(p, false);
    },
    // Tukar mesej status manual.
    setMessage: function (m) {
      if (state.done) return;
      msgEl.innerHTML = m;
      tipEl.innerHTML = m;
    },
    // Paksa splash hilang sekarang (teknikal / emergency).
    forceHide: function () { fadeOut('Sedia!'); },
    isVisible: function () { return !state.done; }
  };

  // ---------- DOM ----------
  var overlay = document.createElement('div');
  overlay.id = 'qtiba-splash';
  overlay.innerHTML = [
    '<div class="qs-inner">',
    '  <div class="qs-logo">',
    '    <img src="q-tibalogo.png" alt="Q-TIBA"',
    '       onerror="var s=this.nextElementSibling;if(s){this.style.display=\'none\';s.style.display=\'block\';}">',
    '    <span class="qs-fallback" style="display:none">Q</span>',
    '  </div>',
    '  <h1>Q-TIBA</h1>',
    '  <p>Menganalisis Data &bull; Mengubah Budaya</p>',
    '  <div class="qs-bar"><div class="qs-fill" id="qs-fill"></div></div>',
    '  <div class="qs-pct" id="qs-pct">0%</div>',
    '  <div class="qs-msg" id="qs-msg">Menyambung ke pelayan&hellip;</div>',
    '  <div class="qs-tip" id="qs-tip"></div>',
    '  <div class="qs-skip" id="qs-skip">Ketuk untuk teruskan &rarr;</div>',
    '</div>'
  ].join('');

  var fillEl, pctEl, msgEl, tipEl, skipEl;

  function mountOverlay() {
    document.body.appendChild(overlay);

    fillEl = overlay.querySelector('#qs-fill');
    pctEl = overlay.querySelector('#qs-pct');
    msgEl = overlay.querySelector('#qs-msg');
    tipEl = overlay.querySelector('#qs-tip');
    skipEl = overlay.querySelector('#qs-skip');

    tipEl.innerHTML = 'Petua: ' + selectTip(Math.floor(Math.random() * 100));

    // Butang "ketuk untuk teruskan" — interaktif, muncul selepas 1.3s
    skipTimer = setTimeout(showSkip, 1300);
    overlay.addEventListener('click', function (ev) {
      if (ev.target === skipEl || ev.target.closest('#qs-skip')) {
        if (!state.done && Date.now() - state.tsStart >= MIN_MS) fadeOut('Sedia!');
      }
    });

    // Pintu keselamatan: tak kira apa pun, splash mesti hilang dalam MAX_MS.
    setTimeout(function () {
      if (!state.done) fadeOut('Sedia!');
    }, MAX_MS);

    // Rancangan auto-progress bermula bila badan siap
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        autoTimer = setInterval(autoStep, 140);
      }, { once: true });
    } else {
      autoTimer = setInterval(autoStep, 140);
    }
  }

if (document.body) {
    mountOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', mountOverlay, { once: true });
  }
})();