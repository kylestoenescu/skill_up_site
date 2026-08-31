/*
 * dashboard.js — the two history tables on the home page.
 *
 * Previously this rendered a whole separate dashboard.html, including a hero
 * figure and a per-module meter list. Those moved: the per-module status now
 * lives on the home page's module cards (js/home.js), and the "N of 7 modules
 * mastered" hero was dropped on purpose — a global completion count rewards
 * racing through content, which is the opposite of what this site is for.
 *
 * What's left here is the backward-looking history: what you attempted recently
 * and which questions you keep missing.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE DATA COMES FROM
 * ---------------------------------------------------------------------------
 * Nothing here touches localStorage. Every number is read through the Progress
 * API (js/progress.js), and the list of modules comes from the manifest
 * (js/modules.js). That's the whole point of building those two first: this
 * page is pure presentation over an existing data layer.
 *
 *   SiteModules.all()                  which modules exist
 *   Progress.getModuleSummary(id)      best score, attempts, mastery
 *   Progress.getAttempts(id)           the attempt log, for recent activity
 *   Progress.getStrugglingQuestions()  questions you keep missing
 *   Progress.getMasteredQuestions()    questions you've nailed repeatedly
 *
 * ---------------------------------------------------------------------------
 * WHY BOTH ARE TABLES
 * ---------------------------------------------------------------------------
 * With three or four irregularly-spaced attempts, a line chart draws a trend
 * that isn't in the data. When data is this sparse a table is the honest form,
 * and it stays readable as the log grows.
 */

(function () {
  "use strict";

  /** A module counts as mastered at this share of a full attempt. */
  function masteryThreshold() {
    return window.Progress ? window.Progress.MASTERY_THRESHOLD : 0.8;
  }

  // --- small helpers -------------------------------------------------------

  /**
   * Creates an element with an optional class and text, so the rendering code
   * below reads as structure rather than as a wall of createElement calls.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   * @returns {HTMLElement}
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /** @param {string} iso @returns {string} e.g. "30 Aug 2026, 14:05" */
  function formatDate(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    }) + ", " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  /** @param {number} fraction 0..1 @returns {string} */
  function percent(fraction) {
    return Math.round(fraction * 100) + "%";
  }


  // --- sections ------------------------------------------------------------



  /**
   * Recent attempts across every module, newest first.
   * A table rather than a chart: attempts are sparse and irregularly spaced.
   */
  function renderRecent(root, modules, limit) {
    const rows = [];

    modules.forEach(function (module) {
      window.Progress.getAttempts(module.id).forEach(function (attempt) {
        /* Flashcard reviews live in the same log but aren't scored quiz runs,
         * so they'd be misleading in a table of "3 / 5" results. */
        if (attempt.mode === "review") return;
        rows.push({ module: module, attempt: attempt });
      });
    });

    rows.sort(function (a, b) {
      return (b.attempt.completedAt || "").localeCompare(a.attempt.completedAt || "");
    });

    if (rows.length === 0) return false;

    const table = el("table", "dash-table");
    const thead = el("thead");
    const headRow = el("tr");
    ["When", "Module", "Score", "Result"].forEach(function (heading) {
      headRow.appendChild(el("th", null, heading));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    rows.slice(0, limit).forEach(function (entry) {
      const attempt = entry.attempt;
      const tr = el("tr");

      tr.appendChild(el("td", "dash-cell-when", formatDate(attempt.completedAt)));
      tr.appendChild(el("td", null, entry.module.title));
      tr.appendChild(
        el("td", "dash-cell-num", attempt.score + " / " + attempt.total)
      );

      const passed = attempt.total > 0 && attempt.score / attempt.total >= masteryThreshold();
      const resultCell = el("td");
      const pill = el(
        "span",
        "dash-pill " + (passed ? "is-pass" : "is-fail"),
        attempt.mode === "retry"
          ? (passed ? "Retry passed" : "Retry")
          : (passed ? "Passed" : "Below " + percent(masteryThreshold()))
      );
      resultCell.appendChild(pill);
      tr.appendChild(resultCell);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    root.appendChild(table);

    if (rows.length > limit) {
      root.appendChild(
        el("p", "dash-note", "Showing the " + limit + " most recent of " + rows.length + " attempts.")
      );
    }
    return true;
  }

  /**
   * Questions you keep getting wrong, worst first — the seed list for the
   * flashcards feature later. Question text is pulled from QUIZ_DATA, which is
   * why this page loads every module's data file.
   */
  function renderReview(root, modules, limit) {
    const rows = [];

    modules.forEach(function (module) {
      const data = (window.QUIZ_DATA || {})[module.id];
      const questions = (data && data.questions) || [];

      window.Progress.getStrugglingQuestions(module.id).forEach(function (entry) {
        const question = questions.filter(function (q) {
          return q.id === entry.questionId;
        })[0];

        /* Skip anything we can't name. Stats outlive their questions in two
         * ways: a Parsons puzzle or free-write task is recorded per item but
         * has no multiple-choice question behind it, and a question deleted
         * from a data file leaves its history behind. Either way, printing a
         * raw id like "js-p1" in a table of questions is worse than omitting
         * the row. */
        if (!question) return;

        rows.push({ module: module, stat: entry.stat, text: question.question });
      });
    });

    if (rows.length === 0) return false;

    // Worst first: most misses, then fewest correct.
    rows.sort(function (a, b) {
      if (b.stat.incorrect !== a.stat.incorrect) return b.stat.incorrect - a.stat.incorrect;
      return a.stat.correct - b.stat.correct;
    });

    const table = el("table", "dash-table");
    const thead = el("thead");
    const headRow = el("tr");
    ["Question", "Module", "Missed", "Correct"].forEach(function (heading) {
      headRow.appendChild(el("th", null, heading));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    rows.slice(0, limit).forEach(function (row) {
      const tr = el("tr");
      tr.appendChild(el("td", "dash-cell-question", row.text));
      tr.appendChild(el("td", null, row.module.title));
      tr.appendChild(el("td", "dash-cell-num", row.stat.incorrect));
      tr.appendChild(el("td", "dash-cell-num", row.stat.correct));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(table);

    if (rows.length > limit) {
      root.appendChild(
        el("p", "dash-note", "Showing the " + limit + " weakest of " + rows.length + " questions.")
      );
    }

    // Give the table somewhere to go: these are exactly the flashcard deck.
    const actions = el("div", "fc-actions");
    const drill = el("a", "btn", "Drill these as flashcards");
    drill.href = "flashcards.html";
    actions.appendChild(drill);
    root.appendChild(actions);

    return true;
  }

  // --- wiring --------------------------------------------------------------

  /** Hides a whole <section> when it has nothing to show. */
  function hideSection(root) {
    const section = root.closest(".dash-section");
    if (section) section.hidden = true;
  }

  function init() {
    const recentRoot0 = document.querySelector("[data-dash-recent]");
    const reviewRoot0 = document.querySelector("[data-dash-review]");
    if (!recentRoot0 && !reviewRoot0) return;

    if (typeof window.Progress === "undefined" || !window.SiteModules) {
      console.warn("SkillUp: dashboard needs progress.js and modules.js.");
      return;
    }

    const modules = window.SiteModules.all();

    const recentRoot = document.querySelector("[data-dash-recent]");
    if (recentRoot && !renderRecent(recentRoot, modules, 10)) hideSection(recentRoot);

    const reviewRoot = document.querySelector("[data-dash-review]");
    if (reviewRoot && !renderReview(reviewRoot, modules, 10)) hideSection(reviewRoot);

  }

  /*
   * Question text lives in js/data/*.js, which js/data-loader.js fetches from
   * the manifest. Those are injected scripts, so they arrive asynchronously —
   * wait for them before rendering, or the "Questions to review" table would
   * fall back to showing raw question ids.
   *
   * Everything else on the page (scores, meters, attempt history) comes from
   * progress.js and doesn't need the data files, so if the loader is missing
   * entirely we still render rather than showing nothing.
   */
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
