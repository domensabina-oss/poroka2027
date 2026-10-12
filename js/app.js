(function () {
  'use strict';

  var I18N = window.I18N;
  var CFG = window.SITE_CONFIG || {};
  var API_URL = CFG.API_URL;
  var LANGS = ['sl', 'en'];
  var STORAGE_KEY = 'wedding_lang';
  var TIMEOUT_MS = 15000;
  var PLUS_ONE = '+1'; // a guest row whose first_name is "+1" is an unnamed plus-one

  // status: 'none' (no token) | 'loading' | 'ok' | 'invalid' | 'error'
  var state = { lang: 'sl', langChosen: false, status: 'none', data: null };
  // RSVP form state. errorKey/statusKey are translation keys so messages switch language too.
  var rsvp = { built: false, done: false, sending: false, errorKey: null, statusKey: null };

  /* ---------- language ---------- */

  function readStoredLang() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return LANGS.indexOf(v) >= 0 ? v : null;
    } catch (e) { return null; }
  }

  function storeLang(lang) {
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage blocked: choice lasts for this visit only */ }
  }

  // Default Slovene; English only if the browser's language list has no Slovene.
  function detectBrowserLang() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : (navigator.language ? [navigator.language] : []);
    if (!list.length) return 'sl';
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase().split('-')[0] === 'sl') return 'sl';
    }
    return 'en';
  }

  function t(key, vars) {
    var s = I18N[state.lang][key];
    if (s == null) { console.warn('Missing translation:', state.lang, key); s = I18N.sl[key]; }
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
    return s;
  }

  /* ---------- rendering ---------- */

  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function isVisible(cond) {
    var s = state.status;
    switch (cond) {
      case 'loading': return s === 'loading';
      case 'error': return s === 'error';
      case 'no-token': return s === 'none';
      case 'invalid': return s === 'invalid';
      case 'ok': return s === 'ok';
      case 'not-ok': return s === 'none' || s === 'invalid';
      case 'extra': return s === 'ok' && !!state.data.extra;
      case 'closed': return s === 'ok' && state.data.deadline_passed === true;
      case 'open': return s === 'ok' && state.data.deadline_passed !== true && !rsvp.done;
      case 'done': return s === 'ok' && rsvp.done;
      case 'saved-before': return s === 'ok' && state.data.deadline_passed !== true && !rsvp.done && !!state.data.latest;
      default: return true;
    }
  }

  function render() {
    document.documentElement.lang = state.lang;

    applyI18n(document);
    document.getElementById('date').textContent = formatDate(CFG.WEDDING_DATE);
    qsa('[data-show]').forEach(function (el) { el.hidden = !isVisible(el.getAttribute('data-show')); });
    qsa('[data-lang]').forEach(function (btn) { btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === state.lang)); });

    // Texts for invitation-specific sections come from the API, not from this site.
    var extra = (state.status === 'ok' && state.data.extra) || {};
    qsa('[data-extra]').forEach(function (el) {
      var entry = extra[el.getAttribute('data-extra')];
      el.textContent = entry ? (entry[state.lang] || entry.sl || '') : '';
    });

    if (state.status === 'ok') {
      document.getElementById('names').textContent = namesLine(state.data.guests);
      renderRsvpTexts();
    }
  }

  function applyI18n(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-aria-label]'), function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'))); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-alt]'), function (el) { el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'))); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-placeholder]'), function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  }

  // "Saša in Urška", "Dušan, Saša in Lan", "Nika" (plus-ones are not named)
  function namesLine(guests) {
    var names = guests
      .map(function (g) { return String(g.first_name || '').trim(); })
      .filter(function (n) { return n && n !== PLUS_ONE; });
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' ' + t('names_and') + ' ' + names[names.length - 1];
  }

  /* ---------- data ---------- */

  function getToken() {
    try { return (new URLSearchParams(window.location.search).get('g') || '').trim(); } catch (e) { return ''; }
  }

  function load() {
    var token = getToken();
    if (!token) { state.status = 'none'; render(); return; }

    state.status = 'loading';
    render();

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

    fetch(API_URL + '?action=get&token=' + encodeURIComponent(token), { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (res) {
        if (res && res.ok === true && res.household && Array.isArray(res.guests)) {
          state.data = res;
          state.status = 'ok';
          buildForm();
          var pref = res.household.preferred_language;
          if (!state.langChosen && LANGS.indexOf(pref) >= 0) state.lang = pref;
        } else if (res && res.error === 'invalid_token') {
          state.status = 'invalid';
        } else {
          state.status = 'error';
        }
      })
      .catch(function (err) {
        console.warn('Loading invitation failed:', err);
        state.status = 'error';
      })
      .then(function () {
        clearTimeout(timer);
        render();
      });
  }

  /* ---------- RSVP form ---------- */

  function $(id) { return document.getElementById(id); }
  function hasExtra() { return !!(state.data && state.data.extra); }

  function buildForm() {
    if (rsvp.built) return;
    rsvp.built = true;
    var latest = state.data.latest || null;
    var tpl = $('tpl-guest');

    state.data.guests.forEach(function (g) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.setAttribute('data-guest', g.guest_id);
      var legend = node.querySelector('.guest-name');
      if (String(g.first_name).trim() === PLUS_ONE) legend.setAttribute('data-i18n', 'plus_one');
      else legend.textContent = g.first_name;
      ['main', 'extra'].forEach(function (q) {
        Array.prototype.forEach.call(node.querySelectorAll('[data-q="' + q + '"] input[type=radio]'), function (r) {
          r.name = q + '-' + g.guest_id;
        });
      });
      var prev = latest && latest.guests && latest.guests[g.guest_id];
      if (prev) {
        setQ(node, 'main', prev.attending);
        setQ(node, 'extra', prev.attending_extra);
        node.querySelector('.allergies').value = prev.allergies || '';
      }
      $('guest-fields').appendChild(node);
    });

    var songs = latest && latest.song_requests && latest.song_requests.length ? latest.song_requests : [{ artist: '', title: '' }];
    songs.forEach(addSong);

    if (latest) {
      var acc = $('rsvp-form').querySelector('input[name="acc"][value="' + latest.accommodation_help + '"]');
      if (acc) acc.checked = true;
      $('acc-people').value = latest.accommodation_people || '';
      $('acc-notes').value = latest.accommodation_notes || '';
      $('message').value = latest.message || '';
    }
    updateAccDetails();

    $('rsvp-form').addEventListener('change', onFieldChange);
    $('acc-people').addEventListener('input', function () { $('err-people').hidden = true; $('acc-people').removeAttribute('aria-invalid'); clearSummaryIfResolved(); });
    $('rsvp-form').addEventListener('submit', onSubmit);
    $('add-song').addEventListener('click', function () {
      var row = addSong({ artist: '', title: '' });
      if (row) row.querySelector('.artist').focus();
    });
    $('edit-again').addEventListener('click', function () {
      rsvp.done = false;
      render();
      $('rsvp').scrollIntoView();
    });
  }

  function setQ(node, q, val) {
    var r = node.querySelector('[data-q="' + q + '"] input[value="' + val + '"]');
    if (r) r.checked = true;
  }

  function addSong(song) {
    var box = $('song-rows');
    if (box.children.length >= 10) return null;
    var row = $('tpl-song').content.firstElementChild.cloneNode(true);
    row.querySelector('.artist').value = song.artist || '';
    row.querySelector('.title').value = song.title || '';
    row.querySelector('.remove').addEventListener('click', function () {
      if (box.children.length > 1) box.removeChild(row);
      else { row.querySelector('.artist').value = ''; row.querySelector('.title').value = ''; }
      $('add-song').hidden = box.children.length >= 10;
    });
    applyI18n(row);
    box.appendChild(row);
    $('add-song').hidden = box.children.length >= 10;
    return row;
  }

  function accValue() {
    var c = $('rsvp-form').querySelector('input[name="acc"]:checked');
    return c ? c.value : '';
  }

  function updateAccDetails() { $('acc-details').hidden = accValue() !== 'yes'; }

  function onFieldChange(e) {
    var el = e.target;
    if (el.type === 'radio') {
      var holder = el.name === 'acc' ? $('acc-block') : el.closest('.q');
      var err = el.name === 'acc' ? $('err-acc') : holder.querySelector('.field-error');
      err.hidden = true;
      Array.prototype.forEach.call(holder.querySelectorAll('input[type=radio][name="' + el.name + '"]'), function (r) { r.removeAttribute('aria-invalid'); });
      if (el.name === 'acc') updateAccDetails();
    }
    clearSummaryIfResolved();
  }

  // Hide the "answers missing" summary once every flagged field has been answered.
  function clearSummaryIfResolved() {
    if (rsvp.errorKey !== 'err_summary') return;
    var open = Array.prototype.some.call(document.querySelectorAll('#rsvp-form .field-error'), function (e) { return !e.hidden; });
    if (!open) { rsvp.errorKey = null; renderRsvpTexts(); }
  }

  function markChoice(radios, errEl) {
    var ok = Array.prototype.some.call(radios, function (r) { return r.checked; });
    errEl.hidden = ok;
    Array.prototype.forEach.call(radios, function (r) { if (ok) r.removeAttribute('aria-invalid'); else r.setAttribute('aria-invalid', 'true'); });
    return ok ? null : radios[0];
  }

  // Returns the first invalid control, or null when everything is filled in.
  function validate() {
    var bad = [];
    Array.prototype.forEach.call($('guest-fields').querySelectorAll('.guest'), function (node) {
      ['main', 'extra'].forEach(function (q) {
        if (q === 'extra' && !hasExtra()) return;
        var box = node.querySelector('[data-q="' + q + '"]');
        bad.push(markChoice(box.querySelectorAll('input[type=radio]'), box.querySelector('.field-error')));
      });
    });
    bad.push(markChoice($('acc-block').querySelectorAll('input[name="acc"]'), $('err-acc')));
    if (accValue() === 'yes') {
      var v = $('acc-people').value.trim();
      var n = Number(v);
      var okPeople = v !== '' && Number.isInteger(n) && n >= 1 && n <= 50;
      $('err-people').hidden = okPeople;
      if (okPeople) $('acc-people').removeAttribute('aria-invalid');
      else { $('acc-people').setAttribute('aria-invalid', 'true'); bad.push($('acc-people')); }
    }
    return bad.filter(Boolean)[0] || null;
  }

  function collect() {
    var yes = accValue() === 'yes';
    return {
      token: getToken(),
      guests: Array.prototype.map.call($('guest-fields').querySelectorAll('.guest'), function (node) {
        var main = node.querySelector('[data-q="main"] input:checked');
        var g = { guest_id: node.getAttribute('data-guest'), attending: main ? main.value : '', allergies: node.querySelector('.allergies').value.trim() };
        if (hasExtra()) {
          var x = node.querySelector('[data-q="extra"] input:checked');
          g.attending_extra = x ? x.value : '';
        }
        return g;
      }),
      song_requests: Array.prototype.map.call($('song-rows').querySelectorAll('.song'), function (row) {
        return { artist: row.querySelector('.artist').value.trim(), title: row.querySelector('.title').value.trim() };
      }).filter(function (s) { return s.artist || s.title; }),
      accommodation_help: accValue(),
      accommodation_people: yes ? Number($('acc-people').value) : '',
      accommodation_notes: yes ? $('acc-notes').value.trim() : '',
      message: $('message').value.trim()
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    if (rsvp.sending) return;
    var firstBad = validate();
    if (firstBad) {
      rsvp.errorKey = 'err_summary';
      renderRsvpTexts();
      firstBad.focus();
      return;
    }
    rsvp.errorKey = null;
    send(collect());
  }

  function send(payload) {
    rsvp.sending = true;
    rsvp.statusKey = 'sending';
    $('submit-btn').disabled = true;
    renderRsvpTexts();

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);

    // text/plain keeps this a "simple" request (no CORS preflight, which Apps Script does not answer).
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (res) {
        if (res && res.ok === true) {
          state.data.latest = state.data.latest || {};
          rsvp.done = true;
          rsvp.errorKey = null;
        } else if (res && res.error === 'deadline_passed') {
          state.data.deadline_passed = true;
        } else if (res && res.error === 'invalid_token') {
          rsvp.errorKey = 'invalid_token';
        } else if (res && res.error === 'busy') {
          rsvp.errorKey = 'err_busy';
        } else {
          rsvp.errorKey = 'err_server';
        }
      })
      .catch(function (err) {
        console.warn('Sending reply failed:', err);
        rsvp.errorKey = 'err_network';
      })
      .then(function () {
        clearTimeout(timer);
        rsvp.sending = false;
        rsvp.statusKey = null;
        $('submit-btn').disabled = false;
        render();
        if (rsvp.done) $('rsvp').scrollIntoView();
      });
  }

  function renderRsvpTexts() {
    var d = state.data;
    var showDeadline = !!d.rsvp_deadline && d.deadline_passed !== true;
    var dl = showDeadline ? formatShortDate(d.rsvp_deadline) : '';
    $('rsvp-deadline').hidden = !showDeadline;
    $('rsvp-deadline').textContent = showDeadline ? t('rsvp_deadline', { date: dl }) : '';
    $('done-deadline').hidden = !showDeadline;
    $('done-deadline').textContent = showDeadline ? t('done_deadline', { date: dl }) : '';
    $('form-error').hidden = !rsvp.errorKey;
    $('form-error').textContent = rsvp.errorKey ? t(rsvp.errorKey) : '';
    $('submit-status').textContent = rsvp.statusKey ? t(rsvp.statusKey) : '';
  }

  // "15. 1. 2027" / "15 January 2027"
  function formatShortDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso;
    if (state.lang === 'sl') return (+p[2]) + '. ' + (+p[1]) + '. ' + p[0];
    try {
      var parts = {};
      new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        .formatToParts(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)))
        .forEach(function (x) { parts[x.type] = x.value; });
      return parts.day + ' ' + parts.month + ' ' + parts.year;
    } catch (e) { return iso; }
  }

  /* ---------- start ---------- */

  // "sobota, 19. junij 2027" / "Saturday, 19 June 2027"
  function formatDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return '';
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
    try {
      // Built from parts because browsers differ in punctuation (e.g. Chrome omits the comma in en-GB).
      var parts = {};
      new Intl.DateTimeFormat(state.lang === 'sl' ? 'sl-SI' : 'en-GB',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        .formatToParts(d).forEach(function (x) { parts[x.type] = x.value; });
      return state.lang === 'sl'
        ? parts.weekday + ', ' + parts.day + '. ' + parts.month + ' ' + parts.year
        : parts.weekday + ', ' + parts.day + ' ' + parts.month + ' ' + parts.year;
    } catch (e) { return iso; }
  }

  function setupStaticLinks() {
    var map = document.getElementById('map-link');
    var web = document.getElementById('web-link');
    var mails = qsa('#contact-link, .contact-email');
    if (CFG.VENUE_MAP_URL) map.href = CFG.VENUE_MAP_URL; else map.hidden = true;
    if (CFG.VENUE_WEBSITE) web.href = CFG.VENUE_WEBSITE; else web.hidden = true;
    mails.forEach(function (mail) {
      mail.href = 'mailto:' + CFG.CONTACT_EMAIL;
      mail.textContent = CFG.CONTACT_EMAIL;
    });
    if (CFG.PHOTO_URL) {
      document.getElementById('photo-img').src = CFG.PHOTO_URL;
      document.getElementById('photo').hidden = false;
    }
  }

  function init() {
    setupStaticLinks();
    var stored = readStoredLang();
    state.lang = stored || detectBrowserLang();
    state.langChosen = !!stored;

    qsa('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.lang = btn.getAttribute('data-lang');
        state.langChosen = true;
        storeLang(state.lang);
        render();
      });
    });

    document.getElementById('retry').addEventListener('click', load);

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
