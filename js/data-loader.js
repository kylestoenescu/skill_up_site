/*
 * data-loader.js — loads every module's quiz data file, driven by the manifest.
 *
 * ---------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------
 * The dashboard and the flashcards page both need question TEXT for every
 * module, which lives in js/data/*.js. Until now each page hard-coded seven
 * <script> tags — the last place the manifest wasn't really the single source
 * of truth. Add an eighth module, forget a tag, and those pages would silently
 * show raw question ids instead of questions.
 *
 * Now they load this file instead, and it asks the manifest what exists.
 *
 * ---------------------------------------------------------------------------
 * HOW, AND THE TWO THINGS THAT MAKE IT NON-OBVIOUS
 * ---------------------------------------------------------------------------
 * 1. THE VERSION STAMP HAS TO SURVIVE.
 *    Every asset URL in the HTML carries ?v=N so a page and its scripts update
 *    together (see tools/bump-assets.js — this exists because a stale quiz.js
 *    once took the quizzes off the live site). A <script> tag injected by JS
 *    isn't in the HTML, so nothing stamps it, and those URLs would fall back to
 *    the 4-hour cache and go stale independently — reopening exactly the bug
 *    the stamps were added to close.
 *
 *    The fix: this file reads the version off ITS OWN src. The HTML says
 *    js/data-loader.js?v=6, so document.currentScript.src ends in "?v=6", and
 *    that query is copied onto every URL injected below. The version therefore
 *    still originates in the HTML — which has the short cache TTL — and flows
 *    from there to the data files.
 *
 * 2. LOADING IS ASYNCHRONOUS, SO CALLERS MUST WAIT.
 *    A dynamically inserted <script> loads async no matter what. loadAll()
 *    returns a Promise so a page can do SiteData.loadAll().then(render).
 *    Order doesn't matter: each data file only does
 *    `QUIZ_DATA = QUIZ_DATA || {}` and then adds its own key, so they're
 *    independent and load in parallel.
 *
 * A page that only needs ONE module's data (a module page) should keep its own
 * static <script> tag — it knows which file it wants, there's no list to drift,
 * and a static tag is faster than a script that injects a script.
 */

(function (global) {
  "use strict";

  /* Read currentScript immediately — it is only valid while this script body
   * runs, and is null inside any later callback. */
  const thisScript =
    document.currentScript || document.querySelector('script[src*="js/data-loader.js"]');

  const src = thisScript ? thisScript.src : "";

  /** Absolute site root, derived from this file's own URL. */
  const SITE_ROOT = src.replace(/js\/data-loader\.js(\?.*)?$/, "");

  /** e.g. "?v=6" — copied onto every injected URL. Empty if unstamped. */
  const VERSION_QUERY = (src.match(/\?v=\d+/) || [""])[0];

  /** The in-flight (or completed) load, so loadAll() is safe to call twice. */
  let pending = null;

  /**
   * Injects one <script> and resolves when it settles.
   * Resolves rather than rejects on error: one missing data file should cost
   * you that module, not the whole page.
   *
   * @param {string} url
   * @returns {Promise<{url: string, ok: boolean}>}
   */
  function loadScript(url) {
    return new Promise(function (resolve) {
      const node = document.createElement("script");
      node.src = url;
      node.onload = function () { resolve({ url: url, ok: true }); };
      node.onerror = function () { resolve({ url: url, ok: false }); };
      document.head.appendChild(node);
    });
  }

  global.SiteData = {
    /** Exposed for tests and debugging. */
    SITE_ROOT: SITE_ROOT,
    VERSION_QUERY: VERSION_QUERY,

    /**
     * The URLs loadAll() would request, in manifest order. Split out so it can
     * be asserted on without actually injecting anything.
     * @returns {string[]}
     */
    urls: function () {
      if (!global.SiteModules) return [];
      return global.SiteModules.all().map(function (module) {
        return SITE_ROOT + global.SiteModules.dataFileFor(module) + VERSION_QUERY;
      });
    },

    /**
     * Loads the data file for every module in the manifest.
     * Calling it again returns the same promise rather than re-injecting.
     *
     * @returns {Promise<Array<{url: string, ok: boolean}>>}
     */
    loadAll: function () {
      if (pending) return pending;

      if (!global.SiteModules) {
        console.warn("SkillUp: js/modules.js must load before js/data-loader.js.");
        pending = Promise.resolve([]);
        return pending;
      }

      const quizData = global.QUIZ_DATA || {};

      /* Skip anything already on the page. Nothing loads data statically AND
       * through the loader today, but this keeps the two approaches safe to
       * mix and avoids a pointless second request. */
      const wanted = global.SiteModules.all().filter(function (module) {
        return !quizData[module.id];
      });

      pending = Promise.all(
        wanted.map(function (module) {
          return loadScript(SITE_ROOT + global.SiteModules.dataFileFor(module) + VERSION_QUERY);
        })
      ).then(function (results) {
        const failed = results.filter(function (r) { return !r.ok; });
        if (failed.length > 0) {
          console.warn(
            "SkillUp: " + failed.length + " module data file(s) failed to load: " +
            failed.map(function (r) { return r.url; }).join(", ")
          );
        }
        return results;
      });

      return pending;
    }
  };
})(window);
