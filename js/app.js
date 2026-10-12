(function () {
  'use strict';

  var I18N = window.I18N;
  var API_URL = (window.SITE_CONFIG || {}).API_URL;
  var LANGS = ['sl', 'en'];
  var STORAGE_KEY = 'wedding_lang';
  var TIMEOUT_MS = 15000;

  // status: 'none' (no token) | 'loading' | 'ok' | 'invalid' | 'error'
  var state = { lang: 'sl', langChosen: false, status: 'none', data: null };

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
    var hh = s === 'ok' ? state.data.household : null;
    switch (cond) {
      case 'loading': return s === 'loading';
      case 'error': return s === 'error';
      case 'no-token': return s === 'none';
      case 'invalid': return s === 'invalid';
      case 'ok': return s === 'ok';
      case 'not-ok': return s === 'none' || s === 'invalid';
      case 'sat': return s !== 'ok' || hh.invited_saturday === true;
      case 'sun': return s === 'ok' && hh.invited_sunday === true;
      default: return true;
    }
  }

  function render() {
    document.documentElement.lang = state.lang;

    qsa('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    qsa('[data-i18n-aria-label]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'))); });
    qsa('[data-show]').forEach(function (el) { el.hidden = !isVisible(el.getAttribute('data-show')); });
    qsa('[data-lang]').forEach(function (btn) { btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === state.lang)); });

    if (state.status === 'ok') {
      var name = state.data.household.name;
      document.getElementById('greeting').textContent = name ? t('greeting', { name: name }) : t('greeting_noname');

      var list = document.getElementById('guest-list');
      list.textContent = '';
      state.data.guests.forEach(function (g) {
        var li = document.createElement('li');
        li.textContent = (g.first_name + ' ' + g.last_name).trim();
        list.appendChild(li);
      });
    }
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

  /* ---------- start ---------- */

  function init() {
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
