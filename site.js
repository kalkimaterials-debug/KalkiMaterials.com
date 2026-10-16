// Interactivity for the pre-rendered pages: header menus, forms, hero video.
(function () {
  function show(root, key, on) {
    root.querySelectorAll('dc-if[data-if="' + key + '"]').forEach(function (el) { el.hidden = !on; });
  }

  // ---- Site header ----
  var header = document.querySelector('[data-ref="rootRef"]');
  if (header) {
    var mq = window.matchMedia('(max-width:700px)');
    var btn = header.querySelector('[data-ref="btnRef"]');
    var panel = header.querySelector('#kalki-materials-panel');
    var menuBtn = header.querySelector('[data-ref="menuBtnRef"]');
    var accBtn = header.querySelector('[aria-controls="kalki-mobile-materials"]');
    var open = false, menuOpen = false, accOpen = false, openedAt = 0, tOpen, tClose;
    var cards = function () { return Array.prototype.slice.call(header.querySelectorAll('[data-ref="card.ref"]')); };

    var setOpen = function (v, focusFirst) {
      clearTimeout(tOpen); clearTimeout(tClose);
      if (v && !open) openedAt = Date.now();
      open = v;
      if (btn) btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      show(header, 'panelOpen', v && !mq.matches);
      if (v && focusFirst && cards()[0]) cards()[0].focus();
    };
    var setMenu = function (v) {
      menuOpen = v;
      if (menuBtn) menuBtn.setAttribute('aria-expanded', v ? 'true' : 'false');
      show(header, 'menuOpen', v);
      show(header, 'menuClosed', !v);
      show(header, 'mobileMenuVisible', v && mq.matches);
    };
    var setAcc = function (v) {
      accOpen = v;
      if (accBtn) accBtn.setAttribute('aria-expanded', v ? 'true' : 'false');
      show(header, 'accOpen', v);
    };
    var leave = function () { clearTimeout(tOpen); if (open) tClose = setTimeout(function () { setOpen(false); }, 200); };

    if (btn) {
      btn.addEventListener('mouseenter', function () {
        clearTimeout(tClose);
        if (!open) tOpen = setTimeout(function () { setOpen(true, false); }, 120);
      });
      btn.addEventListener('mouseleave', leave);
      btn.addEventListener('click', function (e) {
        var kb = e.detail === 0;
        if (open) {
          if (!kb && Date.now() - openedAt < 400) return;
          setOpen(false);
        } else setOpen(true, kb);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true, true); }
      });
    }
    if (panel) {
      panel.addEventListener('mouseenter', function () { clearTimeout(tClose); });
      panel.addEventListener('mouseleave', leave);
      panel.addEventListener('keydown', function (e) {
        var k = e.key;
        if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(k) < 0) return;
        e.preventDefault();
        var els = cards(), n = els.length, i = els.indexOf(document.activeElement);
        var j = k === 'Home' ? 0 : k === 'End' ? n - 1
          : (k === 'ArrowRight' || k === 'ArrowDown') ? (i + 1) % n
          : (i < 0 ? n - 1 : (i - 1 + n) % n);
        if (els[j]) els[j].focus();
      });
    }
    if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });
    if (accBtn) accBtn.addEventListener('click', function () { setAcc(!accOpen); });

    var outside = function (e) {
      if (!header.contains(e.target) && (open || menuOpen)) { setOpen(false); setMenu(false); }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (open) { setOpen(false); if (btn) btn.focus(); }
      if (menuOpen) { setMenu(false); if (menuBtn) menuBtn.focus(); }
    });
    mq.addEventListener('change', function () { setOpen(false); setMenu(false); });
  }

  // ---- Forms ----
  // Both forms post to server.js, which emails them through Resend.
  document.querySelectorAll('form[data-form]').forEach(function (form) {
    var kind = form.getAttribute('data-form');
    var btn = form.querySelector('button[type="submit"]');
    var label = btn ? btn.textContent : '';
    var error = document.createElement('p');
    error.setAttribute('role', 'alert');
    error.style.cssText = 'margin:0;flex-basis:100%;font-size:0.85rem;color:#94472B';
    error.hidden = true;
    form.appendChild(error);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {};
      if (kind === 'onJoin') {
        data.email = form.querySelector('input[type="email"]').value;
      } else {
        new FormData(form).forEach(function (v, k) { data[k] = v; });
        data.monthlyDrop = !!form.querySelector('[name="monthlyDrop"]:checked');
      }
      error.hidden = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      fetch(kind === 'onJoin' ? '/api/newsletter' : '/api/catalogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (res) {
        if (!res.ok) throw new Error(res.status);
        if (kind === 'onJoin') {
          if (btn) btn.textContent = 'Joined';
        } else {
          show(document, 'sent', true);
          show(document, 'notSent', false);
        }
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = label; }
        error.textContent = 'Something went wrong. Please try again, or email us at Kalkimaterials@gmail.com.';
        error.hidden = false;
      });
    });
  });

  // ---- Hero video autoplay (some mobile browsers need a nudge) ----
  var tryPlay = function () {
    var v = document.querySelector('video[src*="hero"]');
    if (!v) return;
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true;
    var p = v.play();
    if (p && p.catch) p.catch(function () {
      var resume = function () {
        v.play().catch(function () {});
        document.removeEventListener('touchstart', resume);
        document.removeEventListener('click', resume);
      };
      document.addEventListener('touchstart', resume, { once: true });
      document.addEventListener('click', resume, { once: true });
    });
  };
  tryPlay();
  setTimeout(tryPlay, 400);
})();
