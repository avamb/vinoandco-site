/*
 * Age gate 18+ (replaces the WordPress age-gate plugin, JS mode).
 * Loaded blocking in <head>: a visitor who already confirmed never sees the gate.
 * Cookie "age_gate" as on WordPress: session cookie, or 1 year with "Remember me".
 */
(function () {
  var NAME = 'age_gate';
  var root = document.documentElement;
  var passed = document.cookie.split('; ').some(function (c) { return c.indexOf(NAME + '=1') === 0; });
  if (passed) {
    root.classList.add('age-gate-passed');
    return;
  }
  root.classList.add('age-gate-open');

  document.addEventListener('DOMContentLoaded', function () {
    var wrapper = document.querySelector('[data-age-gate]');
    var form = document.querySelector('[data-age-gate-form]');
    if (!wrapper || !form) return;
    var errors = form.querySelector('[data-age-gate-errors]');
    var remember = form.querySelector('[data-age-gate-remember]');
    var yes = form.querySelector('.age-gate__submit--yes');
    if (yes) yes.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter;
      if (btn && btn.value === '1') {
        var c = NAME + '=1; path=/; SameSite=Lax';
        if (location.protocol === 'https:') c += '; Secure';
        if (remember && remember.checked) c += '; max-age=31536000';
        document.cookie = c;
        root.classList.remove('age-gate-open');
        root.classList.add('age-gate-passed');
      } else if (errors) {
        errors.textContent = form.getAttribute('data-error') || '';
      }
    });
  });
})();
