/*
 * home.js — builds the module tiles on the home page from the manifest.
 *
 * Before this, the seven tiles were hand-written in index.html and the same
 * seven modules were listed again in the nav. They're now both generated from
 * js/modules.js, so they cannot disagree.
 *
 * If progress.js is present, each tile also gets a short status line ("Best:
 * 4/5", "Mastered", "Not started"). That is deliberately a one-line summary and
 * not a dashboard — the dashboard is its own page, later. It reads through the
 * Progress API like everything else; this file never touches localStorage.
 *
 * TRADEOFF (same one as the nav, extended)
 * The tiles now require JavaScript. With JS off, the home page previously still
 * listed the modules, which was the fallback that made the nav's <noscript>
 * acceptable. That's gone, so index.html now carries an honest <noscript>
 * saying the site needs JavaScript. That is the truthful position anyway: the
 * quizzes have never worked without it.
 */

(function () {
  "use strict";

  /* Same trick as nav.js: work out the site root from this script's own URL, so
   * the generated links are correct regardless of where the page lives. The
   * home page is always at the root today, but deriving it costs nothing and
   * stops this breaking if the page ever moves. */
  const thisScript =
    document.currentScript || document.querySelector('script[src$="js/home.js"]');
  const SITE_ROOT = thisScript ? thisScript.src.replace(/js\/home\.js(\?.*)?$/, "") : "";

  /**
   * Builds the short progress line shown on a tile.
   * @param {string} moduleId
   * @returns {{text: string, mastered: boolean}|null} null when there's no
   *          progress layer at all, so the caller can omit the line entirely
   */
  function progressLineFor(moduleId) {
    if (typeof window.Progress === "undefined") return null;

    const summary = window.Progress.getModuleSummary(moduleId);

    if (summary.bestScore === null) {
      return { text: "Not started", mastered: false };
    }

    const percent = Math.round(summary.bestPercent * 100);
    return {
      text: "Best " + summary.bestScore + "/" + summary.bestTotal + " (" + percent + "%)",
      mastered: summary.mastered
    };
  }

  /**
   * @param {object} module an entry from SITE_MODULES
   * @returns {HTMLAnchorElement}
   */
  function buildTile(module) {
    const card = document.createElement("a");
    card.className = "module-card";
    card.href = SITE_ROOT + window.SiteModules.pageFor(module);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = module.badge;

    const heading = document.createElement("h2");
    heading.textContent = module.title;

    const blurb = document.createElement("p");
    blurb.textContent = module.blurb;

    card.appendChild(badge);
    card.appendChild(heading);
    card.appendChild(blurb);

    const progress = progressLineFor(module.id);
    if (progress) {
      const status = document.createElement("p");
      status.className = "module-status";
      status.textContent = progress.text;

      if (progress.mastered) {
        status.classList.add("is-mastered");
        const badgeEl = document.createElement("span");
        badgeEl.className = "mastery-badge";
        badgeEl.textContent = "Mastered";
        status.textContent = progress.text + " ";
        status.appendChild(badgeEl);
      }

      card.appendChild(status);
    }

    const go = document.createElement("span");
    go.className = "go";
    go.textContent = "Start module →";
    card.appendChild(go);

    return card;
  }

  function init() {
    const grid = document.querySelector("[data-module-grid]");
    if (!grid) return;

    if (!window.SiteModules) {
      console.warn("SkillUp: js/modules.js did not load before js/home.js — no tiles rendered.");
      return;
    }

    grid.textContent = "";
    window.SiteModules.all().forEach(function (module) {
      grid.appendChild(buildTile(module));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
