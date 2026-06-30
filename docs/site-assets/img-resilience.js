/* Auto-recover transient <img> load failures (server cold-start, a cached 404, or a flaky
   mobile connection dropping one of many parallel image requests). On error, retry up to twice
   with a cache-busting query param — which also forces past any failure the browser cached.
   A MutationObserver re-scans so JS-injected images (e.g. the rendered result page) are covered. */
(function () {
  function retry(img) {
    var n = +(img.getAttribute("data-rt") || 0);
    if (n >= 2) return;
    img.setAttribute("data-rt", n + 1);
    var base = (img.getAttribute("src") || "").split("?")[0];
    if (!base) return;
    setTimeout(function () { img.src = base + "?retry=" + n; }, 600 * (n + 1));
  }
  function hook(img) {
    if (img.getAttribute("data-rh")) return;
    img.setAttribute("data-rh", "1");
    img.addEventListener("error", function () { retry(img); });
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) retry(img);
  }
  function scan() { for (var i = 0; i < document.images.length; i++) hook(document.images[i]); }
  if (document.readyState !== "loading") scan();
  else document.addEventListener("DOMContentLoaded", scan);
  try { new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
