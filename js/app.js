(function () {
  'use strict';

  var I18N = window.I18N;
  var CFG = window.SITE_CONFIG || {};
  var API_URL = CFG.API_URL;
  var LANGS = ['sl', 'en'];
  var STORAGE_KEY = 'wedding_lang';
  var TIMEOUT_MS = 15000;
  var PLUS_ONE = '+1'; // a guest row named "+1" is an unnamed seat: counted, never shown by name

  // status: 'none' (no token) | 'loading' | 'ok' | 'invalid' | 'error'
  var state = { lang: 'sl', langChosen: false, status: 'none', data: null };
  // RSVP form state. errorKey/statusKey are translation keys so messages switch language too.
  var rsvp = { built: false, done: false, sending: false, errorKey: null, statusKey: null, lastAttending: null, lastPeople: 0 };

  function $(id) { return document.getElementById(id); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

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

  // Seats on this invitation (named guests + unnamed "+1" seats).
  function seats() { return state.data ? Math.max(1, state.data.seats || state.data.guests.length || 1) : 1; }
  // People we address by name: "+1" seats don't count, so "Nika +1" is asked "Prideš?" (singular)
  // and says how many come via "Število oseb".
  function addressed() {
    if (!state.data) return 1;
    var named = (state.data.guests || []).filter(function (g) { var n = String(g.first_name || '').trim(); return n && n !== PLUS_ONE; }).length;
    return Math.max(1, named);
  }
  // Text variant: _1 one person, _2 two (Slovene dual), _3 three or more (plural).
  // The allergies hint follows seats (a +1 may have needs too); everything else follows addressed().
  function tn(base, n) {
    if (n == null) n = base === 'allergies_hint' ? seats() : addressed();
    return t(base + '_' + (n >= 3 ? 3 : n));
  }

  function applyI18n(root) {
    qsa('[data-i18n]', root).forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    qsa('[data-i18n-n]', root).forEach(function (el) { el.textContent = tn(el.getAttribute('data-i18n-n')); });
    qsa('[data-i18n-aria-label]', root).forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'))); });
    qsa('[data-i18n-alt]', root).forEach(function (el) { el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'))); });
    qsa('[data-i18n-placeholder]', root).forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  }

  /* ---------- rendering ---------- */

  function isVisible(cond) {
    var s = state.status;
    var d = state.data;
    switch (cond) {
      case 'loading': return s === 'loading';
      case 'error': return s === 'error';
      case 'no-token': return s === 'none';
      case 'invalid': return s === 'invalid';
      case 'ok': return s === 'ok';
      case 'not-ok': return s === 'none' || s === 'invalid';
      case 'closed': return s === 'ok' && d.deadline_passed === true;
      case 'open': return s === 'ok' && d.deadline_passed !== true && !rsvp.done;
      case 'done': return s === 'ok' && rsvp.done;
      case 'saved-before': return s === 'ok' && d.deadline_passed !== true && !rsvp.done && !!d.latest;
      default: return true;
    }
  }

  function render() {
    document.documentElement.lang = state.lang;
    applyI18n(document);
    $('date').textContent = formatDate(CFG.WEDDING_DATE);
    renderTimetable();
    qsa('[data-show]').forEach(function (el) { el.hidden = !isVisible(el.getAttribute('data-show')); });
    qsa('[data-lang]').forEach(function (btn) { btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === state.lang)); });
    syncHeaderHeight();

    if (state.status === 'ok') {
      $('names').textContent = namesLine(state.data.guests);
      $('allergies-hint').hidden = seats() < 2;
      renderRsvpTexts();
    }
  }

  function renderTimetable() {
    var ol = $('timeline');
    if (!ol) return;
    ol.textContent = '';
    (CFG.TIMETABLE || []).forEach(function (item) {
      var li = document.createElement('li');
      var time = document.createElement('span');
      time.className = 'tt-time';
      time.textContent = item.time;
      var title = document.createElement('span');
      title.className = 'tt-title';
      title.textContent = t(item.title);
      var what = document.createElement('span');
      what.className = 'tt-what';
      what.textContent = t(item.label);
      li.appendChild(time);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(title);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(what);
      ol.appendChild(li);
    });
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
          var pref = res.household.preferred_language;
          if (!state.langChosen && LANGS.indexOf(pref) >= 0) state.lang = pref;
          buildForm();
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

  function buildForm() {
    if (rsvp.built) return;
    rsvp.built = true;
    var latest = state.data.latest || null;
    var n = seats();

    // Number-of-people choices (only asked when the invitation has more than one seat)
    var box = $('people-choices');
    for (var i = 1; i <= n; i++) {
      var lab = document.createElement('label');
      lab.className = 'choice';
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = 'people'; inp.value = String(i);
      var sp = document.createElement('span');
      sp.className = 'num';
      sp.textContent = String(i);
      lab.appendChild(inp); lab.appendChild(sp);
      box.appendChild(lab);
    }
    $('people-block').hidden = n < 2;

    var songs = latest && latest.song_requests && latest.song_requests.length ? latest.song_requests : [{ artist: '', title: '' }];
    songs.forEach(addSong);

    if (latest) {
      checkRadio('attending', latest.attending);
      if (latest.attending === 'yes') checkRadio('people', String(latest.people_attending || n));
      $('allergies').value = latest.allergies || '';
      checkRadio('acc', latest.accommodation_help);
      $('acc-people').value = latest.accommodation_people || '';
      $('acc-notes').value = latest.accommodation_notes || '';
      $('message').value = latest.message || '';
    }
    updateDependent();

    $('rsvp-form').addEventListener('change', onFieldChange);
    $('acc-people').addEventListener('input', function () { setError('err-acc-people', $('acc-people'), false); clearSummaryIfResolved(); });
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

  function radios(name) { return qsa('#rsvp-form input[name="' + name + '"]'); }
  function radioValue(name) { var c = $('rsvp-form').querySelector('input[name="' + name + '"]:checked'); return c ? c.value : ''; }
  function checkRadio(name, val) { var r = $('rsvp-form').querySelector('input[name="' + name + '"][value="' + val + '"]'); if (r) r.checked = true; }

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

  // Show/hide the parts that depend on earlier answers.
  function updateDependent() {
    var coming = radioValue('attending') === 'yes';
    $('coming-fields').hidden = !coming;
    // Default the number of people to everyone on the invitation the first time "yes" is chosen.
    if (coming && !radioValue('people')) checkRadio('people', String(seats()));
    var accYes = radioValue('acc') === 'yes';
    $('acc-details').hidden = !accYes;
    if (accYes && !$('acc-people').value) $('acc-people').value = radioValue('people') || String(seats());
  }

  function setError(errId, controls, on) {
    $(errId).hidden = !on;
    [].concat(controls).forEach(function (c) { if (on) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid'); });
  }

  function onFieldChange(e) {
    var el = e.target;
    if (el.type === 'radio') {
      var map = { attending: 'err-attending', people: 'err-people-attending', acc: 'err-acc' };
      if (map[el.name]) setError(map[el.name], radios(el.name), false);
      updateDependent();
    }
    clearSummaryIfResolved();
  }

  // Hide the "answers missing" summary once every flagged field has been answered.
  function clearSummaryIfResolved() {
    if (rsvp.errorKey !== 'err_summary') return;
    var open = qsa('#rsvp-form .field-error').some(function (e) { return !e.hidden && !e.closest('[hidden]'); });
    if (!open) { rsvp.errorKey = null; renderRsvpTexts(); }
  }

  // Returns the first invalid control, or null when everything needed is filled in.
  function validate() {
    var bad = [];
    function need(name, errId) {
      var ok = !!radioValue(name);
      setError(errId, radios(name), !ok);
      if (!ok) bad.push(radios(name)[0]);
    }
    need('attending', 'err-attending');
    if (radioValue('attending') === 'yes') {
      if (seats() > 1) need('people', 'err-people-attending');
      need('acc', 'err-acc');
      if (radioValue('acc') === 'yes') {
        var v = $('acc-people').value.trim();
        var n = Number(v);
        var ok = v !== '' && Number.isInteger(n) && n >= 1 && n <= 50;
        setError('err-acc-people', $('acc-people'), !ok);
        if (!ok) bad.push($('acc-people'));
      }
    }
    return bad[0] || null;
  }

  function collect() {
    var coming = radioValue('attending') === 'yes';
    var accYes = coming && radioValue('acc') === 'yes';
    return {
      token: getToken(),
      attending: radioValue('attending'),
      people_attending: coming ? (seats() > 1 ? Number(radioValue('people')) : 1) : 0,
      allergies: coming ? $('allergies').value.trim() : '',
      song_requests: coming ? qsa('#song-rows .song').map(function (row) {
        return { artist: row.querySelector('.artist').value.trim(), title: row.querySelector('.title').value.trim() };
      }).filter(function (s) { return s.artist || s.title; }) : [],
      accommodation_help: coming ? radioValue('acc') : '',
      accommodation_people: accYes ? Number($('acc-people').value) : '',
      accommodation_notes: accYes ? $('acc-notes').value.trim() : '',
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
          state.data.latest = { attending: payload.attending };
          rsvp.lastAttending = payload.attending;
          rsvp.lastPeople = payload.people_attending || 0;
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
    // Big deadline banner on the first screen – only until this invitation has replied.
    var showBanner = showDeadline && !d.latest && !rsvp.done;
    $('deadline-banner').hidden = !showBanner;
    $('banner-date').textContent = showBanner ? dl : '';
    $('rsvp-deadline').hidden = !showDeadline;
    $('rsvp-deadline').textContent = showDeadline ? t('rsvp_deadline', { date: dl }) : '';
    $('done-deadline').hidden = !showDeadline;
    $('done-deadline').textContent = showDeadline ? t('done_deadline', { date: dl }) : '';
    var yes = rsvp.lastAttending !== 'no';
    $('done-title').textContent = t(yes ? 'done_title_yes' : 'done_title_no');
    // "Veseliva se te!" for one person; "…vaju!" if a +1 guest brings someone (never fewer than addressed).
    $('done-text').textContent = yes ? tn('done_yes', Math.max(addressed(), rsvp.lastPeople || 0)) : tn('done_no');
    $('form-error').hidden = !rsvp.errorKey;
    $('form-error').textContent = rsvp.errorKey ? t(rsvp.errorKey) : '';
    $('submit-status').textContent = rsvp.statusKey ? t(rsvp.statusKey) : '';
  }

  /* ---------- dates ---------- */

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

  function setupStaticLinks() {
    var map = $('map-link');
    if (CFG.VENUE_MAP_URL) map.href = CFG.VENUE_MAP_URL; else map.hidden = true;
    var route = $('route-link');
    if (CFG.ROUTE_MAP_URL) route.href = CFG.ROUTE_MAP_URL; else route.hidden = true;
    qsa('#contact-link, .contact-email').forEach(function (mail) {
      mail.href = 'mailto:' + CFG.CONTACT_EMAIL;
      mail.textContent = CFG.CONTACT_EMAIL;
    });
    if (CFG.PHOTO_URL) {
      $('photo-img').src = CFG.PHOTO_URL;
      $('photo').hidden = false;
    }
  }

  // Pages snap below the sticky header: keep its real height in a CSS variable.
  function syncHeaderHeight() {
    var h = document.querySelector('header.top');
    if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
  }

  // Underline the menu item of the page currently in the middle of the screen.
  function setupActiveNav() {
    if (!('IntersectionObserver' in window)) return;
    var links = qsa('.section-nav a');
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        links.forEach(function (a) {
          if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    qsa('main > section.panel').forEach(function (sec) { obs.observe(sec); });
  }

  function init() {
    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);
    setupActiveNav();
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

    $('retry').addEventListener('click', load);
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
