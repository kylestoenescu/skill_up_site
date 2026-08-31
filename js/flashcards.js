/*
 * flashcards.js — targeted drilling of the questions you keep getting wrong.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS DIFFERS FROM THE QUIZ
 * ---------------------------------------------------------------------------
 * The quiz tests a module: five questions, a score, a mastery gate. Flashcards
 * do the opposite job — they ignore module boundaries and drill whatever you're
 * weakest on, one card at a time, with no score and no pass/fail. You can stop
 * after three cards and it still counted.
 *
 *   quiz         all questions in one module   ->  scored, gated at 80%
 *   flashcards   your weak questions anywhere  ->  unscored, ends when you stop
 *
 * ---------------------------------------------------------------------------
 * WHERE THE DECK COMES FROM
 * ---------------------------------------------------------------------------
 * Progress.getReviewQueue() does the selecting and the ordering; this file only
 * renders it. That deliberately keeps the scheduling rules in the data layer,
 * where the dashboard (and anything later) can use them too.
 *
 * A card leaves the deck for good once you've answered it correctly three times
 * in a row — that's the "retire questions I've mastered" behaviour. Between
 * those, a Leitner schedule holds it back for a day, then three days, so you
 * aren't re-drilling something you answered correctly ten minutes ago.
 *
 * ---------------------------------------------------------------------------
 * A TRADEOFF WORTH KNOWING
 * ---------------------------------------------------------------------------
 * These are recognition cards, not recall cards: the options are on screen, so
 * you pick rather than retrieve from memory. Free recall is the stronger study
 * method, but every question in js/data/ is authored as multiple choice, and
 * inventing recall prompts would mean writing new content. Recognition plus
 * honest scheduling is the most this data supports. If you want true recall
 * later, the cheap version is a "Show answer" button with a self-rating — say
 * the word and I'll add it as a mode.
 */

(function () {
  "use strict";

  /** How many cards a single session offers before suggesting a break. */
  const SESSION_LIMIT = 12;

  // Session state. Deliberately plain — this page is one screen, not an app.
  let deck = [];          // cards queued for this session
  let position = 0;       // index into deck
  let answered = [];      // { card, correct } for the summary
  let pendingByModule = {}; // moduleId -> answers, flushed to storage on record

  // --- helpers -------------------------------------------------------------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function shuffle(array) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  /**
   * Looks up the authored question behind a queue entry. The queue stores only
   * ids, because progress.js has no idea what a question says.
   * @returns {object|null}
   */
  function questionFor(card) {
    const data = (window.QUIZ_DATA || {})[card.moduleId];
    if (!data) return null;
    return data.questions.filter(function (q) { return q.id === card.questionId; })[0] || null;
  }

  function moduleTitle(moduleId) {
    const module = window.SiteModules.byId(moduleId);
    return module ? module.title : moduleId;
  }

  // --- deck building -------------------------------------------------------

  /**
   * @param {string} moduleFilter a module id, or "all"
   * @param {boolean} includeNotDue study-ahead mode
   * @returns {Array<object>} queue entries that have a real question behind them
   */
  function buildDeck(moduleFilter, includeNotDue) {
    const ids = moduleFilter === "all" ? window.SiteModules.ids() : [moduleFilter];

    return window.Progress
      .getReviewQueue(ids, { includeNotDue: includeNotDue })
      /* Drop anything whose question no longer exists — a stat can outlive its
       * question if one is deleted from a data file. */
      .filter(function (card) { return questionFor(card) !== null; });
  }

  // --- rendering -----------------------------------------------------------

  const stage = function () { return document.querySelector("[data-fc-stage]"); };

  function renderProgressLine() {
    const line = document.querySelector("[data-fc-progress]");
    if (!line) return;
    line.textContent =
      deck.length === 0 ? "" : "Card " + Math.min(position + 1, deck.length) + " of " + deck.length;
  }

  /** Renders the current card, front side (question + options, unanswered). */
  function renderCard() {
    const root = stage();
    root.textContent = "";
    renderProgressLine();

    const card = deck[position];
    const question = questionFor(card);

    const wrap = el("div", "fc-card");

    const meta = el("div", "fc-card-meta");
    meta.appendChild(el("span", "fc-module", moduleTitle(card.moduleId)));

    /* Say why this card is here. A drill that shows its reasoning is easier to
     * trust than one that just serves cards. */
    const reason =
      card.stat.incorrect > 0
        ? "Missed " + card.stat.incorrect + (card.stat.incorrect === 1 ? " time" : " times")
        : "Scheduled review";
    meta.appendChild(el("span", "fc-reason", reason));

    if (card.stat.streak > 0) {
      meta.appendChild(
        el("span", "fc-streak", card.stat.streak + " in a row — " +
          (window.Progress.RETIRE_STREAK - card.stat.streak) + " more to retire it")
      );
    }
    wrap.appendChild(meta);

    wrap.appendChild(el("p", "fc-question", question.question));

    const options = el("div", "fc-options");

    /* Same shuffle discipline as the quiz: shuffle a list of ORIGINAL indices
     * and keep each button's original index on it, so the correct answer is
     * compared original-to-original and never remapped. */
    const order = shuffle(question.options.map(function (_, i) { return i; }));

    order.forEach(function (originalIndex) {
      const button = el("button", "fc-option", question.options[originalIndex]);
      button.type = "button";
      button.dataset.index = String(originalIndex);
      button.addEventListener("click", function () {
        revealCard(originalIndex);
      });
      options.appendChild(button);
    });

    wrap.appendChild(options);
    root.appendChild(wrap);
  }

  /** Grades the answer, shows the explanation, and offers the next card. */
  function revealCard(chosenIndex) {
    const card = deck[position];
    const question = questionFor(card);
    const isCorrect = chosenIndex === question.correctIndex;

    answered.push({ card: card, correct: isCorrect });

    // Queue the result; written to storage when the session ends.
    if (!pendingByModule[card.moduleId]) pendingByModule[card.moduleId] = [];
    pendingByModule[card.moduleId].push({
      questionId: question.id,
      correct: isCorrect,
      chosenIndex: chosenIndex,
      chosenText: question.options[chosenIndex],
      correctIndex: question.correctIndex
    });

    const root = stage();
    const wrap = root.querySelector(".fc-card");

    // Lock the buttons and colour them.
    wrap.querySelectorAll(".fc-option").forEach(function (button) {
      const index = Number(button.dataset.index);
      button.disabled = true;
      if (index === question.correctIndex) button.classList.add("is-correct");
      else if (index === chosenIndex) button.classList.add("is-incorrect");
    });

    const feedback = el("div", "fc-feedback " + (isCorrect ? "correct" : "incorrect"));
    const label = el("span", "result-label", isCorrect ? "Correct." : "Not quite.");
    feedback.appendChild(label);
    feedback.appendChild(el("span", "result-explanation", question.explanation));
    wrap.appendChild(feedback);

    const actions = el("div", "fc-actions");
    const next = el(
      "button",
      "btn",
      position + 1 >= deck.length ? "Finish session" : "Next card"
    );
    next.type = "button";
    next.addEventListener("click", function () {
      position++;
      if (position >= deck.length) finishSession();
      else renderCard();
    });
    actions.appendChild(next);
    wrap.appendChild(actions);

    next.focus();
  }

  /** Writes the session to storage and shows what changed. */
  function finishSession() {
    // One write per module, rather than one per card.
    Object.keys(pendingByModule).forEach(function (moduleId) {
      window.Progress.recordReview(moduleId, pendingByModule[moduleId]);
    });

    const correct = answered.filter(function (a) { return a.correct; }).length;

    /* Which cards graduated? Read stats back AFTER recording, so this reflects
     * what was actually stored rather than what we predicted. */
    let retired = 0;
    answered.forEach(function (entry) {
      const stat = window.Progress.getQuestionStat(entry.card.moduleId, entry.card.questionId);
      if (stat.streak >= window.Progress.RETIRE_STREAK) retired++;
    });

    pendingByModule = {};

    const root = stage();
    root.textContent = "";
    document.querySelector("[data-fc-progress]").textContent = "";

    const summary = el("div", "fc-summary");
    summary.appendChild(el("h2", null, "Session complete"));
    summary.appendChild(
      el("p", "fc-summary-score", correct + " of " + answered.length + " correct")
    );

    if (retired > 0) {
      summary.appendChild(
        el("p", "fc-summary-retired",
          retired + (retired === 1 ? " question has" : " questions have") +
          " now been answered correctly " + window.Progress.RETIRE_STREAK +
          " times in a row and will drop out of your deck.")
      );
    }

    const wrong = answered.filter(function (a) { return !a.correct; });
    if (wrong.length > 0) {
      summary.appendChild(
        el("p", "fc-summary-note",
          wrong.length + (wrong.length === 1 ? " card" : " cards") +
          " will come back around — a miss resets that question's streak.")
      );
    }

    const actions = el("div", "fc-actions");
    const again = el("button", "btn", "Start another session");
    again.type = "button";
    again.addEventListener("click", startSession);
    actions.appendChild(again);

    const dash = el("a", "btn btn-secondary", "View dashboard");
    dash.href = "dashboard.html";
    actions.appendChild(dash);

    summary.appendChild(actions);
    root.appendChild(summary);
  }

  /** Nothing to review — explain why, and offer to study ahead. */
  function renderEmpty(moduleFilter) {
    const root = stage();
    root.textContent = "";
    document.querySelector("[data-fc-progress]").textContent = "";

    const aheadDeck = buildDeck(moduleFilter, true);
    const box = el("div", "fc-empty");

    if (aheadDeck.length > 0) {
      box.appendChild(el("h2", null, "Nothing due right now"));
      box.appendChild(
        el("p", null,
          "You've answered everything in this deck recently. " + aheadDeck.length +
          (aheadDeck.length === 1 ? " card is" : " cards are") +
          " scheduled to come back later — but you can drill them now if you want.")
      );
      const actions = el("div", "fc-actions");
      const ahead = el("button", "btn", "Study ahead anyway");
      ahead.type = "button";
      ahead.addEventListener("click", function () { startSession(true); });
      actions.appendChild(ahead);
      box.appendChild(actions);
    } else {
      box.appendChild(el("h2", null, "No cards yet"));
      box.appendChild(
        el("p", null,
          "Flashcards are built from questions you've already answered and " +
          "haven't yet mastered. Take a module quiz and anything you miss will " +
          "show up here.")
      );
      const actions = el("div", "fc-actions");
      const browse = el("a", "btn", "Browse modules");
      browse.href = "index.html";
      actions.appendChild(browse);
      box.appendChild(actions);
    }

    root.appendChild(box);
  }

  // --- session control -----------------------------------------------------

  function currentFilter() {
    const select = document.querySelector("[data-fc-filter]");
    return select ? select.value : "all";
  }

  function startSession(includeNotDue) {
    const filter = currentFilter();
    const full = buildDeck(filter, includeNotDue === true);

    if (full.length === 0) {
      renderEmpty(filter);
      return;
    }

    deck = full.slice(0, SESSION_LIMIT);
    position = 0;
    answered = [];
    pendingByModule = {};
    renderCard();
  }

  /** Populates the module dropdown from the manifest. */
  function buildFilter() {
    const select = document.querySelector("[data-fc-filter]");
    if (!select) return;

    select.appendChild(new Option("All modules", "all"));
    window.SiteModules.all().forEach(function (module) {
      select.appendChild(new Option(module.title, module.id));
    });

    select.addEventListener("change", function () { startSession(); });
  }

  function init() {
    if (!stage()) return;

    if (typeof window.Progress === "undefined" || !window.SiteModules) {
      console.warn("SkillUp: flashcards need progress.js and modules.js.");
      return;
    }

    if (!window.Progress.isAvailable()) {
      const warning = document.querySelector("[data-fc-storage-warning]");
      if (warning) warning.hidden = false;
    }

    buildFilter();
    startSession();
  }

  /*
   * The deck is useless without question text, and that comes from the data
   * files js/data-loader.js pulls in from the manifest. Those load
   * asynchronously, so wait for them — buildDeck() drops any card whose
   * question it can't resolve, so rendering early would show an empty deck.
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
