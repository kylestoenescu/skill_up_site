/*
 * nav.js — the single definition of the site header + nav.
 *
 * WHY THIS EXISTS
 * The header used to be copy-pasted into all 8 HTML files, so adding a module
 * meant 8 edits. Now every page ships an empty <header data-site-header> and
 * this script fills it in at runtime, from the module manifest in js/modules.js.
 * Adding a module = one entry in that manifest.
 *
 * THE TWO HARD PARTS, AND HOW THEY'RE SOLVED
 *
 * 1. Relative paths. index.html sits at the site root and links to
 *    "modules/sql.html"; modules/sql.html sits one level down and links to
 *    "../index.html". A single hard-coded nav can't be right for both.
 *
 *    Rather than sniffing the URL for "/modules/" (which breaks the moment you
 *    add a second subdirectory), we work out where the site root is from THIS
 *    SCRIPT'S OWN URL. The browser gives us the fully-resolved absolute src of
 *    the running script via document.currentScript.src — something like
 *    "https://example.com/js/nav.js". Chop the known "js/nav.js" off the end and
 *    what remains is the site root: "https://example.com/". Every nav link is
 *    then built as root + path, which is correct from any page at any depth,
 *    and works identically on GitHub Pages, on a local file:// double-click,
 *    and from a project subpath like username.github.io/skill_up_site/.
 *
 * 2. Marking the active link. Each link's absolute URL is compared against the
 *    page's own URL, so aria-current="page" is set automatically. Nothing in the
 *    HTML has to declare which page it is.
 *
 * TRADEOFF (you asked me to flag it)
 * With JavaScript disabled there is no nav at all — it's markup that only
 * exists after a script runs. To limit the damage each page keeps a <noscript>
 * block inside the header with a plain link back to the home page, and the home
 * page lists every module as a tile. So a no-JS visitor can still reach
 * everything in at most two clicks, and that fallback is one static line per
 * page that never changes as modules are added. Full parity would mean
 * hand-writing the whole nav into every <noscript>, which is exactly the
 * duplication we just removed. Given the quizzes themselves require JS, a
 * no-JS visitor can't use this site anyway, so I traded parity for
 * maintainability. Say the word and I'll put the full list in the noscript.
 */

(function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * The nav is derived from the module manifest (js/modules.js) rather than
   * being listed again here — one source of truth for what modules exist.
   * Home is prepended because it isn't a module.
   *
   * modules.js must load first. Both are `defer` scripts in <head>, and
   * deferred scripts run in document order, so the ordering of the tags is
   * what guarantees it. The fallback below keeps the brand and a Home link
   * working if modules.js is ever missing, rather than rendering nothing.
   * ------------------------------------------------------------------- */
  function buildLinks() {
    const links = [{ label: "Home", path: "index.html" }];

    if (!window.SiteModules) {
      console.warn("SkillUp: js/modules.js did not load before js/nav.js — nav will show Home only.");
      return links;
    }

    window.SiteModules.all().forEach(function (module) {
      links.push({
        label: module.title,
        path: window.SiteModules.pageFor(module)
      });
    });

    return links;
  }

  /* document.currentScript is the <script> element currently executing. It is
   * only valid while the script body runs, so we read it immediately — not
   * later inside a callback, where it would be null. The querySelector is a
   * belt-and-braces fallback in case this file is ever loaded in a way that
   * doesn't set currentScript (e.g. dynamically injected). */
  const thisScript =
    document.currentScript || document.querySelector('script[src$="js/nav.js"]');

  /* .src always reports the fully-resolved absolute URL, even when the HTML
   * attribute said "../js/nav.js". Strip the trailing "js/nav.js" (plus any
   * ?cachebuster) and we're left with the site root, ending in a slash. */
  const SITE_ROOT = thisScript
    ? thisScript.src.replace(/js\/nav\.js(\?.*)?$/, "")
    : "";

  /**
   * Normalises a URL path for comparison. A request for "/modules/" or "/"
   * serves the directory's index.html, so treat those as equivalent.
   * @param {string} pathname
   * @returns {string}
   */
  function normalisePath(pathname) {
    return pathname.endsWith("/") ? pathname + "index.html" : pathname;
  }

  /**
   * Builds the header contents and puts them into the placeholder element.
   * @param {HTMLElement} headerEl the <header data-site-header> on the page
   */
  function renderHeader(headerEl) {
    const currentPath = normalisePath(window.location.pathname);

    const inner = document.createElement("div");
    inner.className = "header-inner";

    // Brand / logo link, back to the home page.
    const brand = document.createElement("a");
    brand.className = "brand";
    brand.href = SITE_ROOT + "index.html";
    brand.appendChild(document.createTextNode("Skill"));
    const brandAccent = document.createElement("span");
    brandAccent.textContent = "Up";
    brand.appendChild(brandAccent);

    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Main");

    buildLinks().forEach((link) => {
      const a = document.createElement("a");
      a.href = SITE_ROOT + link.path;
      a.textContent = link.label;

      /* Comparing pathnames (not full hrefs) keeps this working when the page
       * URL carries a ?query or #hash. `a.pathname` is the browser's own
       * resolved path for the link we just built. */
      if (normalisePath(a.pathname) === currentPath) {
        a.setAttribute("aria-current", "page");
      }

      nav.appendChild(a);
    });

    inner.appendChild(brand);
    inner.appendChild(nav);

    // Replace whatever was in the header (the <noscript> fallback) with the
    // real nav. Nothing else on the page touches this element.
    headerEl.textContent = "";
    headerEl.appendChild(inner);
  }

  /**
   * Finds the placeholder and renders into it. Called immediately if the DOM is
   * already parsed, otherwise on DOMContentLoaded — so this file works whether
   * it's loaded with `defer` in <head> or as a plain tag at the end of <body>.
   */
  function init() {
    const headerEl = document.querySelector("[data-site-header]");
    if (headerEl) renderHeader(headerEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
