/* Shared scroll-reveal — and a floor underneath it.
 *
 * The stylesheet starts every .reveal element at opacity:0 and waits for JavaScript to add .in.
 * That is a page-blanking bug waiting to happen, and on 14 Jul 2026 it had already happened:
 * scarred-truth-stories.html carried eight stories and no reveal script, so all eight were
 * permanently invisible — 29,000px of empty cream. The only readers who saw anything were those
 * with "reduce motion" on, rescued by accident by a separate stylesheet rule.
 *
 * Loaded on every page. Two jobs:
 *   1. reveal .reveal elements as they scroll into view (the intended effect), and
 *   2. guarantee that nothing which is ON SCREEN is ever invisible — a backstop on scroll/resize
 *      shows anything at or above the fold that the observer somehow missed. It deliberately does
 *      NOT blanket-reveal the whole page, or the scroll animation would fire all at once and the
 *      effect would be dead on every page that works fine.
 *
 * Pages that still define their own wireReveal() are unaffected: adding .in twice is harmless.
 */
(function () {
  var SEL = '.reveal';

  function els() { return document.querySelectorAll(SEL); }

  // show anything that is already on screen (or above it) but still hidden
  function showOnScreen() {
    var list = els();
    var vh = window.innerHeight || 800;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.classList.contains('in')) continue;
      var r = el.getBoundingClientRect();
      if (r.top < vh * 1.05) el.classList.add('in');   // on screen, or already scrolled past
    }
  }

  function start() {
    if (!els().length) return;

    if (!('IntersectionObserver' in window)) {         // ancient browser: just show everything
      var all = els();
      for (var i = 0; i < all.length; i++) all[i].classList.add('in');
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });

    var list = els();
    for (var j = 0; j < list.length; j++) io.observe(list[j]);

    // the floor: whatever the observer does or doesn't do, what's on screen is visible
    var ticking = false;
    function backstop() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { showOnScreen(); ticking = false; });
    }
    window.addEventListener('scroll', backstop, { passive: true });
    window.addEventListener('resize', backstop, { passive: true });
    setTimeout(showOnScreen, 1200);                    // and once, shortly after load
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
