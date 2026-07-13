/* Back to top. Long reads (the story, the profiles, a finished quiz result) leave you a long way
   from the nav with no way home but a thumb. Appears once you're a screenful down, on pages long
   enough to warrant it, and never on a short one.

   Styles live in scarred-light.css (.totop) so it uses the site's own tokens.
   It lifts itself above the story page's sticky audio player when that's up — otherwise the two
   would sit on top of each other in the same corner. */
(function () {
  if (document.querySelector('.totop')) return;          // never two

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'totop';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 19V6"/><path d="M5.5 12.5L12 6l6.5 6.5"/></svg>';
  document.body.appendChild(btn);

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // long enough to get lost in, and she's a screenful down
  function shouldShow() {
    var h = window.innerHeight;
    var doc = document.documentElement.scrollHeight;
    var y = window.scrollY || document.documentElement.scrollTop;
    return doc > h * 2 && y > h;
  }

  // don't land on top of a bar pinned to the bottom of the screen (story page's mini-player)
  function lift() {
    var bar = document.querySelector('.mini.up');
    var gap = 20;
    if (bar) {
      var h = bar.getBoundingClientRect().height;
      if (h > 0) gap = h + 16;
    }
    btn.style.bottom = 'calc(' + gap + 'px + env(safe-area-inset-bottom))';
  }

  function update() {
    var show = shouldShow();
    btn.classList.toggle('up', show);
    if (show) lift();
  }

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { update(); ticking = false; });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  // the quiz is a single page that swaps its whole body — re-check when it does
  if (window.MutationObserver) {
    var app = document.getElementById('app');
    if (app) new MutationObserver(update).observe(app, { childList: true });
  }
  update();
})();
