/*
 * home.js — the module grid on index.html, with a live status layer.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SHOWS, AND WHAT IT DELIBERATELY DOESN'T
 * ---------------------------------------------------------------------------
 * Every card carries one of three states, and never anything in between:
 *
 *   not started   no attempt recorded      grey, empty track
 *   in progress   attempted, under 80%     blue, partial bar
 *   mastered      best attempt >= 80%      green, full bar + badge
 *
 * The state is carried by colour AND by a text label AND by the bar, so it is
 * never colour alone — that matters for anyone who can't distinguish the blue
 * from the green, and it is why the label is not decoration.
 *
 * There is NO overall "you have completed 43% of the site" bar, on purpose. A
 * global completion meter rewards racing to the end: it goes up when you touch
 * something new and never when you go back and fix something you half-knew.
 * Status plus "last attempted 9 days ago" points at what is going stale, which
 * is the thing actually worth doing next. The one aggregate number here is a
 * count of cards due for review, which points backwards rather than forwards.
 *
 * ---------------------------------------------------------------------------
 * STAGED MODULES
 * ---------------------------------------------------------------------------
 * Most modules are one quiz, so "best score" is unambiguous. The JavaScript
 * module is three gated stages, and a single best score across them would be
 * meaningless — 6/6 on the trace stage is not 6/6 on the module. For those,
 * the card reports stages passed ("2 of 3 stages") and is only mastered when
 * every stage is. js/modules.js decides which modules are staged.
 */

(function () {
  "use strict";

  const thisScript =
    document.currentScript || document.querySelector('script[src*="js/home.js"]');
  const SITE_ROOT = thisScript ? thisScript.src.replace(/js\/home\.js(\?.*)?$/, "") : "";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /**
   * Recency in words. "11 days ago" answers "is this going stale?" far more
   * directly than a date does; the exact timestamp goes in the tooltip for
   * when you want it.
   * @param {string} iso
   * @returns {string}
   */
  function relativeDate(iso) {
    const then = new Date(iso);
    if (isNaN(then.getTime())) return "";

    const days = Math.floor((Date.now() - then.getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + " days ago";
    const months = Math.round(days / 30);
    return months === 1 ? "a month ago" : months + " months ago";
  }

  function absoluteDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  /**
   * Works out a module's single unambiguous state, plus the numbers to show.
   * All three states are decided here so the bar, the label and the colour can
   * never disagree with each other.
   *
   * @param {object} module a manifest entry
   * @returns {{state:string, label:string, fraction:number, lastAttempt:object|null}}
   */
  function statusFor(module) {
    const Progress = window.Progress;
    const stages = window.SiteModules.stagesFor(module);

    if (stages) {
      const gates = Progress.getStageGates(module.id, stages);
      const passed = gates.filter(function (g) { return g.mastered; }).length;

      // Newest attempt across every stage.
      let last = null;
      gates.forEach(function (g) {
        const attempt = g.summary.lastAttempt;
        if (attempt && (!last || attempt.completedAt > last.completedAt)) last = attempt;
      });

      if (!last) {
        return { state: "none", label: "Not started", fraction: 0, lastAttempt: null };
      }
      return {
        state: passed === stages.length ? "mastered" : "progress",
        label: passed + " of " + stages.length + " stages",
        fraction: passed / stages.length,
        lastAttempt: last
      };
    }

    const summary = Progress.getModuleSummary(module.id);
    if (summary.bestScore === null) {
      return { state: "none", label: "Not started", fraction: 0, lastAttempt: null };
    }
    return {
      state: summary.mastered ? "mastered" : "progress",
      label: "Best " + summary.bestScore + "/" + summary.bestTotal +
        " (" + Math.round(summary.bestPercent * 100) + "%)",
      fraction: summary.bestPercent,
      lastAttempt: summary.lastAttempt
    };
  }

  /** @param {object} module @returns {HTMLAnchorElement} */
  function buildCard(module) {
    const card = el("a", "module-card");
    card.href = SITE_ROOT + window.SiteModules.pageFor(module);

    const head = el("div", "module-card-head");
    head.appendChild(el("span", "badge", module.badge));
    head.appendChild(el("h2", null, module.title));
    card.appendChild(head);

    card.appendChild(el("p", "module-blurb", module.blurb));

    // Status block. Absent entirely when there's no progress layer at all.
    if (typeof window.Progress !== "undefined") {
      const status = statusFor(module);
      card.classList.add("is-" + status.state);

      const row = el("div", "module-status-row");

      const label = el("span", "module-status", status.label);
      row.appendChild(label);

      if (status.state === "mastered") {
        row.appendChild(el("span", "mastery-badge", "Mastered"));
      }
      card.appendChild(row);

      /* The bar is a second, redundant channel for the same state — useful at a
       * glance, never the only way to read it. */
      const meter = el("div", "module-meter");
      meter.setAttribute("role", "progressbar");
      meter.setAttribute("aria-valuemin", "0");
      meter.setAttribute("aria-valuemax", "100");
      meter.setAttribute("aria-valuenow", String(Math.round(status.fraction * 100)));
      meter.setAttribute("aria-label", module.title + " progress");
      const fill = el("div", "module-meter-fill");
      fill.style.width = Math.round(status.fraction * 100) + "%";
      meter.appendChild(fill);
      card.appendChild(meter);

      if (status.lastAttempt) {
        const when = el("p", "module-when", "Last attempt " + relativeDate(status.lastAttempt.completedAt));
        when.title = absoluteDate(status.lastAttempt.completedAt);
        card.appendChild(when);
      } else {
        card.appendChild(el("p", "module-when module-when-empty", "No attempts yet"));
      }
    }

    card.appendChild(el("span", "go", "Open module →"));
    return card;
  }

  /**
   * A single backward-looking pointer: how much is waiting to be reviewed.
   * Counting due cards is the opposite incentive to a completion bar — it goes
   * UP when you neglect things, not when you finish them.
   */
  function renderReviewPointer() {
    const root = document.querySelector("[data-home-review]");
    if (!root || typeof window.Progress === "undefined") return;

    const due = window.Progress.getReviewQueue(window.SiteModules.ids());
    if (due.length === 0) return;

    root.textContent = "";
    const link = el("a", "home-review-link");
    link.href = SITE_ROOT + "flashcards.html";
    link.textContent =
      due.length + (due.length === 1 ? " question is" : " questions are") +
      " due for review →";
    root.appendChild(link);
    root.hidden = false;
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
      grid.appendChild(buildCard(module));
    });

    renderReviewPointer();

    if (typeof window.Progress !== "undefined" && !window.Progress.isAvailable()) {
      const warning = document.querySelector("[data-home-storage-warning]");
      if (warning) warning.hidden = false;
    }
  }

  /* Staged modules need question data? No — statusFor() reads scores only, which
   * live in progress.js. But the review pointer counts cards, and the flashcard
   * deck resolves text from the data files, so wait for the loader when it's
   * present to keep the count consistent with what the deck will actually show. */
  function start() {
    if (window.SiteData) window.SiteData.loadAll().then(init);
    else init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
