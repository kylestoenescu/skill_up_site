/*
 * dashboard.js — renders the progress dashboard.
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
 * WHY IT LOOKS THE WAY IT DOES
 * ---------------------------------------------------------------------------
 * A few deliberate choices, so you can push back on them:
 *
 * - There is exactly ONE hero number (modules mastered). A dashboard that
 *   leads with six equally-large numbers has no lead at all.
 * - Per-module scores are horizontal meters, not a chart. The labels are long
 *   ("REST APIs", "JavaScript") and horizontal bars give text room to breathe.
 * - Recent attempts and weak questions are TABLES, not charts. With three or
 *   four irregularly-spaced attempts, a line chart draws a trend that isn't
 *   really there. When data is sparse, a table is the honest form.
 * - Meter colour encodes STATUS (mastered / in progress / not started), never
 *   the value. Colouring a bar darker because it's longer double-encodes the
 *   same fact and wastes the only free channel.
 * - Every meter is accompanied by its number in text, so the colour is never
 *   the only way to read it.
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

  /**
   * Classifies a module for display. This is the only place the three states
   * are decided, so the meter, the label and the colour can never disagree.
   * @param {object} summary from Progress.getModuleSummary
   * @returns {{state: "mastered"|"progress"|"none", label: string, fraction: number}}
   */
  function classify(summary) {
    if (summary.bestScore === null) {
      return { state: "none", label: "Not started", fraction: 0 };
    }
    const label = summary.bestScore + " / " + summary.bestTotal + " (" + percent(summary.bestPercent) + ")";
    return {
      state: summary.mastered ? "mastered" : "progress",
      label: label,
      fraction: summary.bestPercent
    };
  }

  // --- sections ------------------------------------------------------------

  /**
   * The hero figure plus three supporting stat tiles.
   * Hero = the single number the page leads with. Everything else is support.
   */
  function renderSummary(root, modules, summaries) {
    const masteredCount = summaries.filter(function (s) { return s.mastered; }).length;

    const totalAttempts = summaries.reduce(function (sum, s) {
      return sum + s.attemptCount;
    }, 0);

    // Per-question rollups across every module.
    let masteredQuestions = 0;
    let reviewQuestions = 0;
    modules.forEach(function (m) {
      masteredQuestions += window.Progress.getMasteredQuestions(m.id, { minStreak: 3 }).length;
      reviewQuestions += window.Progress.getStrugglingQuestions(m.id).length;
    });

    // --- hero ---
    const hero = el("div", "dash-hero");
    hero.appendChild(el("p", "dash-hero-value", masteredCount));
    hero.appendChild(
      el("p", "dash-hero-label", "of " + modules.length + " modules mastered")
    );
    hero.appendChild(
      el(
        "p",
        "dash-hero-sub",
        "A module is mastered at " + percent(masteryThreshold()) + " or better on a full attempt."
      )
    );
    root.appendChild(hero);

    // --- supporting tiles ---
    const tiles = el("div", "dash-tiles");
    [
      { label: "Quiz attempts", value: totalAttempts },
      { label: "Questions mastered", value: masteredQuestions },
      { label: "Questions to review", value: reviewQuestions }
    ].forEach(function (tile) {
      const node = el("div", "dash-tile");
      node.appendChild(el("p", "dash-tile-value", tile.value));
      node.appendChild(el("p", "dash-tile-label", tile.label));
      tiles.appendChild(node);
    });
    root.appendChild(tiles);
  }

  /**
   * One row per module: badge, name, meter, and the score in plain text.
   *
   * The meter is a <div role="progressbar"> rather than a native <progress>
   * element, because <progress> is close to unstylable across browsers. The
   * ARIA attributes give screen readers the same value the bar shows visually.
   */
  function renderModules(root, modules, summaries) {
    const list = el("div", "dash-modules");

    modules.forEach(function (module, i) {
      const summary = summaries[i];
      const status = classify(summary);

      const row = el("a", "dash-row");
      row.href = window.SiteModules.pageFor(module);

      /* Native tooltip on hover — extra detail without a tooltip library.
       * Everything in here is ALSO visible on the page, so the tooltip only
       * enhances; it never hides a value behind a hover. */
      row.title =
        module.title + " — " + status.label +
        "\nAttempts: " + summary.attemptCount +
        (summary.lastAttempt ? "\nLast: " + formatDate(summary.lastAttempt.completedAt) : "");

      const badge = el("span", "badge", module.badge);

      const body = el("div", "dash-row-body");

      const head = el("div", "dash-row-head");
      head.appendChild(el("span", "dash-row-title", module.title));
      head.appendChild(el("span", "dash-row-value", status.label));
      body.appendChild(head);

      // The meter itself.
      const meter = el("div", "dash-meter is-" + status.state);
      meter.setAttribute("role", "progressbar");
      meter.setAttribute("aria-valuemin", "0");
      meter.setAttribute("aria-valuemax", "100");
      meter.setAttribute("aria-valuenow", String(Math.round(status.fraction * 100)));
      meter.setAttribute("aria-label", module.title + " best score");

      const fill = el("div", "dash-meter-fill");
      fill.style.width = Math.round(status.fraction * 100) + "%";
      meter.appendChild(fill);
      body.appendChild(meter);

      const foot = el("div", "dash-row-foot");
      foot.appendChild(
        el("span", "dash-row-meta",
          summary.attemptCount === 0
            ? "No attempts yet"
            : summary.attemptCount + (summary.attemptCount === 1 ? " attempt" : " attempts"))
      );
      if (summary.mastered) {
        foot.appendChild(el("span", "mastery-badge", "Mastered"));
      }
      body.appendChild(foot);

      row.appendChild(badge);
      row.appendChild(body);
      list.appendChild(row);
    });

    root.appendChild(list);
  }

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
      window.Progress.getStrugglingQuestions(module.id).forEach(function (entry) {
        const question = data
          ? data.questions.filter(function (q) { return q.id === entry.questionId; })[0]
          : null;
        rows.push({
          module: module,
          stat: entry.stat,
          text: question ? question.question : entry.questionId
        });
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
    const summaryRoot = document.querySelector("[data-dash-summary]");
    if (!summaryRoot) return;

    if (typeof window.Progress === "undefined" || !window.SiteModules) {
      console.warn("SkillUp: dashboard needs progress.js and modules.js.");
      return;
    }

    const modules = window.SiteModules.all();
    const summaries = modules.map(function (m) {
      return window.Progress.getModuleSummary(m.id);
    });

    // Be honest when nothing can be saved.
    if (!window.Progress.isAvailable()) {
      const warning = document.querySelector("[data-dash-storage-warning]");
      if (warning) warning.hidden = false;
    }

    renderSummary(summaryRoot, modules, summaries);

    const modulesRoot = document.querySelector("[data-dash-modules]");
    if (modulesRoot) renderModules(modulesRoot, modules, summaries);

    const recentRoot = document.querySelector("[data-dash-recent]");
    if (recentRoot && !renderRecent(recentRoot, modules, 10)) hideSection(recentRoot);

    const reviewRoot = document.querySelector("[data-dash-review]");
    if (reviewRoot && !renderReview(reviewRoot, modules, 10)) hideSection(reviewRoot);

    // Nothing recorded at all? Point them at a module rather than showing
    // three empty tables.
    const totalAttempts = summaries.reduce(function (sum, s) { return sum + s.attemptCount; }, 0);
    const empty = document.querySelector("[data-dash-empty]");
    if (empty && totalAttempts === 0) empty.hidden = false;
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
