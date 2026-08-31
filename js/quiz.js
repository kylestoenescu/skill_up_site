/*
 * quiz.js — shared multiple-choice quiz engine.
 *
 * Usage from a module page:
 *   <script src="../js/progress.js"></script>
 *   <script src="../js/quiz.js"></script>
 *   <script src="../js/data/sql.js"></script>
 *   <script>initQuiz("quiz", QUIZ_DATA.sql);</script>
 *
 * See js/data/javascript.js for the question data shape.
 *
 * ===========================================================================
 * THE SHUFFLE, AND WHY IT DOESN'T BREAK correctIndex
 * ===========================================================================
 * You flagged this as the most likely thing to break, and you were right to —
 * it's the classic bug in shuffled quizzes. Here's how it's avoided.
 *
 * The naive approach is to shuffle the options array itself and then recompute
 * a new correctIndex to match. That works, but now there are two sources of
 * truth (the authored index and the shuffled one) and every later step has to
 * remember which one it's holding. One slip and the quiz marks the wrong answer
 * right — silently, and only sometimes, because it depends on the shuffle.
 *
 * So this engine never renumbers anything. Instead:
 *
 *   - The options array in the data file is left completely alone.
 *   - What gets shuffled is a list of INDEX NUMBERS: [0,1,2,3] becomes maybe
 *     [2,0,3,1]. That list is the display order.
 *   - Each radio button is rendered in display order, but its `value` is set
 *     to its ORIGINAL index — the position it occupies in the data file.
 *
 * So the third button on screen might carry value="0". When grading:
 *
 *     chosenIndex = Number(selectedInput.value);      // original index
 *     isCorrect   = chosenIndex === question.correctIndex;
 *
 * The comparison is always original-index vs original-index. Display position
 * never enters the arithmetic, which means there is no remapping step that
 * could be wrong. Highlighting the right answer works the same way: find the
 * input whose value equals correctIndex, wherever it happens to sit on screen.
 *
 * The same trick applies to question order: the questions are shuffled into a
 * "plan" array, and each entry keeps a direct reference to both its question
 * object and its rendered <fieldset>. Nothing is ever looked up by a numeric
 * index into the original array after the shuffle, so display order and data
 * order can't get crossed.
 * ===========================================================================
 */

/**
 * Fisher–Yates shuffle. Returns a NEW array — the input is not modified, which
 * matters here because the input is the shared question data that other
 * attempts (and later, other features) will read.
 *
 * The algorithm walks backwards, swapping each item with a random item at or
 * before it. That's the standard unbiased shuffle; sorting by Math.random() is
 * the common shortcut and it is measurably biased, so don't.
 *
 * @param {Array} array
 * @returns {Array} a shuffled copy
 */
function shuffleArray(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = out[i];
    out[i] = out[j];
    out[j] = temp;
  }
  return out;
}

/** @param {number} fraction 0..1 @returns {string} e.g. "80%" */
function formatPercent(fraction) {
  return Math.round(fraction * 100) + "%";
}

/** @param {number} n @param {string} word @returns {string} e.g. "3 attempts" */
function pluralise(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

/**
 * Builds and mounts a quiz into a container element.
 *
 * @param {string} containerId id of the element to render into
 * @param {object} quizData the module's data object (see js/data/*.js)
 */
function initQuiz(containerId, quizData) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) return;

  const moduleId = quizData.moduleId;

  /* progress.js is optional as far as this engine is concerned. If it failed to
   * load, the quiz still runs — it just can't show history or save results.
   * Everything below goes through this flag rather than assuming Progress. */
  const hasProgress = typeof window.Progress !== "undefined";
  const passMark = hasProgress ? window.Progress.MASTERY_THRESHOLD : 0.8;

  // Kick off the first attempt with the full question set.
  startAttempt(quizData.questions, "full");

  /**
   * Renders one attempt from scratch. Called again for a retry round or a
   * retake, which is why it clears the container first — each attempt is a
   * fresh render with a fresh shuffle, and there's no stale state to reset.
   *
   * @param {Array<object>} questions the questions to ask this round
   * @param {"full"|"retry"} mode "retry" = only the ones missed last round
   */
  function startAttempt(questions, mode) {
    container.textContent = "";

    /* --- the shuffle plan -------------------------------------------------
     * One entry per question, in DISPLAY order. `optionOrder` holds original
     * option indices in display order. `fieldset` is filled in during render
     * so grading can go straight to the right element without index lookups. */
    const plan = shuffleArray(questions).map(function (question) {
      return {
        question: question,
        optionOrder: shuffleArray(question.options.map(function (_, i) { return i; })),
        fieldset: null
      };
    });

    // --- header: previous best / attempt count / retry notice --------------
    const statsEl = buildStatsBanner(mode, questions.length);
    if (statsEl) container.appendChild(statsEl);

    // --- score readout (hidden until graded) -------------------------------
    const scoreEl = document.createElement("div");
    scoreEl.className = "quiz-score";
    scoreEl.setAttribute("role", "status");

    // --- "you missed one" nag ---------------------------------------------
    const noteEl = document.createElement("p");
    noteEl.className = "quiz-note";
    noteEl.textContent = "Please answer every question before submitting.";

    const form = document.createElement("form");
    form.noValidate = true;

    plan.forEach(function (item, displayIndex) {
      const q = item.question;

      const fieldset = document.createElement("fieldset");
      fieldset.className = "quiz-question";
      item.fieldset = fieldset; // direct reference — no index lookups later

      const legend = document.createElement("legend");
      legend.textContent = displayIndex + 1 + ". " + q.question;
      fieldset.appendChild(legend);

      const optionsWrap = document.createElement("div");
      optionsWrap.className = "quiz-options";

      /* Radio groups are tied together by their `name`. Using the question's
       * stable id (rather than a loop counter) means the grouping survives the
       * shuffle and stays meaningful if you ever inspect the DOM. */
      const groupName = "q-" + q.id;

      item.optionOrder.forEach(function (originalIndex) {
        const label = document.createElement("label");
        label.className = "quiz-option";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = groupName;
        // THE KEY LINE: the value is the option's index in the data file,
        // not its position on screen. See the header comment.
        input.value = String(originalIndex);

        const span = document.createElement("span");
        span.textContent = q.options[originalIndex];

        label.appendChild(input);
        label.appendChild(span);
        optionsWrap.appendChild(label);
      });

      fieldset.appendChild(optionsWrap);

      const feedback = document.createElement("div");
      feedback.className = "quiz-feedback";
      feedback.dataset.role = "feedback";
      fieldset.appendChild(feedback);

      form.appendChild(fieldset);
    });

    // --- actions -----------------------------------------------------------
    const actions = document.createElement("div");
    actions.className = "quiz-actions";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "btn";
    submitBtn.textContent = "Check answers";
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    // Results block: filled in after grading (missed list + next-step buttons).
    const resultsEl = document.createElement("div");
    resultsEl.className = "quiz-results";
    form.appendChild(resultsEl);

    container.appendChild(scoreEl);
    container.appendChild(noteEl);
    container.appendChild(form);

    // --- grading -----------------------------------------------------------

    /* Guards against grading the same attempt twice — e.g. an Enter keypress
     * landing on the form after the results are already showing. A double
     * grade would write a duplicate attempt into progress storage. */
    let graded = false;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (graded) return;

      const unanswered = plan.filter(function (item) {
        return !item.fieldset.querySelector('input[type="radio"]:checked');
      });

      if (unanswered.length > 0) {
        noteEl.classList.add("is-visible");
        // Send focus to the first gap so the nag is actionable, not just text.
        unanswered[0].fieldset.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      noteEl.classList.remove("is-visible");
      graded = true;

      let correctCount = 0;
      const answers = []; // what gets handed to progress.js
      const missed = []; // question objects, for the retry round

      plan.forEach(function (item) {
        const q = item.question;
        const inputs = item.fieldset.querySelectorAll('input[type="radio"]');
        const selected = item.fieldset.querySelector('input[type="radio"]:checked');

        const chosenIndex = Number(selected.value); // original index
        const isCorrect = chosenIndex === q.correctIndex;

        if (isCorrect) {
          correctCount++;
        } else {
          missed.push(q);
        }

        answers.push({
          questionId: q.id,
          correct: isCorrect,
          chosenIndex: chosenIndex,
          chosenText: q.options[chosenIndex],
          correctIndex: q.correctIndex
        });

        // Colour the options. Again: compare values (original indices), never
        // on-screen positions.
        inputs.forEach(function (input) {
          const optionIndex = Number(input.value);
          const optionLabel = input.closest(".quiz-option");
          input.disabled = true;

          if (optionIndex === q.correctIndex) {
            optionLabel.classList.add("is-correct");
          } else if (optionIndex === chosenIndex) {
            optionLabel.classList.add("is-incorrect");
          }
        });

        // Feedback line: bold label + explanation. The gap between them comes
        // from CSS (.quiz-feedback .result-label { margin-right }), which is why
        // the explanation strings no longer start with a space.
        const feedback = item.fieldset.querySelector('[data-role="feedback"]');
        feedback.textContent = "";
        feedback.classList.add("is-visible", isCorrect ? "correct" : "incorrect");

        const label = document.createElement("span");
        label.className = "result-label";
        label.textContent = isCorrect ? "Correct." : "Not quite.";

        const explanation = document.createElement("span");
        explanation.className = "result-explanation";
        explanation.textContent = q.explanation;

        feedback.appendChild(label);
        feedback.appendChild(explanation);
      });

      const total = plan.length;
      const percent = correctCount / total;
      const passed = percent >= passMark;

      // Save before rendering the summary, so the summary can read back fresh
      // numbers (e.g. an updated best score).
      if (hasProgress) {
        window.Progress.recordAttempt(moduleId, {
          score: correctCount,
          total: total,
          mode: mode,
          answers: answers
        });
      }

      renderScore(scoreEl, correctCount, total, percent, passed, mode);
      renderResults(resultsEl, missed, passed, mode);

      submitBtn.style.display = "none";
      scoreEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  /**
   * The banner above the quiz: previous best, attempt count, mastery flag —
   * or, on a retry round, an explanation of what this round counts for.
   *
   * @param {"full"|"retry"} mode
   * @param {number} questionCount
   * @returns {HTMLElement|null} null when there's nothing worth saying
   */
  function buildStatsBanner(mode, questionCount) {
    const el = document.createElement("div");
    el.className = "quiz-stats";

    if (mode === "retry") {
      el.classList.add("is-retry");
      const line = document.createElement("p");
      line.className = "quiz-stats-line";
      line.textContent =
        "Retry round — just the " + pluralise(questionCount, "question") + " you missed.";
      const sub = document.createElement("p");
      sub.className = "quiz-stats-sub";
      sub.textContent =
        "This round updates your per-question history, but only a full run counts toward your best score and mastery.";
      el.appendChild(line);
      el.appendChild(sub);
      return el;
    }

    if (!hasProgress) return null;

    const summary = window.Progress.getModuleSummary(moduleId);
    const line = document.createElement("p");
    line.className = "quiz-stats-line";

    if (summary.bestScore === null) {
      line.textContent =
        "First time through. Questions and answer options are shuffled on every attempt.";
      el.appendChild(line);
    } else {
      const parts = [
        "Best: " +
          summary.bestScore +
          " / " +
          summary.bestTotal +
          " (" +
          formatPercent(summary.bestPercent) +
          ")",
        pluralise(summary.attemptCount, "attempt")
      ];
      line.textContent = parts.join(" · ");
      el.appendChild(line);

      if (summary.mastered) {
        const badge = document.createElement("span");
        badge.className = "mastery-badge";
        badge.textContent = "Mastered";
        line.appendChild(document.createTextNode(" "));
        line.appendChild(badge);
      }
    }

    // Be honest when nothing is being saved, rather than quietly losing data.
    if (!window.Progress.isAvailable()) {
      const warn = document.createElement("p");
      warn.className = "quiz-stats-sub";
      warn.textContent =
        "Heads up: this browser isn't allowing local storage, so results won't be saved between visits.";
      el.appendChild(warn);
    }

    return el;
  }

  /**
   * Fills in the score readout at the top of the quiz.
   */
  function renderScore(scoreEl, correctCount, total, percent, passed, mode) {
    scoreEl.textContent = "";
    scoreEl.classList.add("is-visible", passed ? "is-pass" : "is-fail");

    const headline = document.createElement("p");
    headline.className = "quiz-score-headline";
    headline.textContent =
      "You scored " + correctCount + " / " + total + " (" + formatPercent(percent) + ").";

    const verdict = document.createElement("p");
    verdict.className = "quiz-score-verdict";

    if (mode === "retry") {
      verdict.textContent = passed
        ? "Good — that's " + formatPercent(passMark) + "+ on the retry. Take the full quiz to lock in mastery."
        : "Still some gaps. Work through the explanations below and go again.";
    } else if (passed) {
      verdict.textContent =
        "Mastered — you're at or above the " + formatPercent(passMark) + " threshold for this module.";
    } else {
      const needed = Math.ceil(passMark * total);
      verdict.textContent =
        "Not mastered yet — you need " + needed + " / " + total + " (" + formatPercent(passMark) + ") to pass.";
    }

    scoreEl.appendChild(headline);
    scoreEl.appendChild(verdict);
  }

  /**
   * The block under the quiz after grading: what you missed, and where to go
   * next. The point here is to never end on a dead "no" — a failed attempt
   * always offers a concrete, smaller next step.
   */
  function renderResults(resultsEl, missed, passed, mode) {
    resultsEl.textContent = "";
    resultsEl.classList.add("is-visible");

    if (missed.length > 0) {
      const heading = document.createElement("h3");
      heading.className = "quiz-results-heading";
      heading.textContent = "To review (" + missed.length + ")";
      resultsEl.appendChild(heading);

      const list = document.createElement("ul");
      list.className = "quiz-missed";
      missed.forEach(function (q) {
        const li = document.createElement("li");
        li.textContent = q.question;
        list.appendChild(li);
      });
      resultsEl.appendChild(list);
    }

    const actions = document.createElement("div");
    actions.className = "quiz-actions";

    /* The primary action depends on where you are:
     *  - missed something  -> drill just those (smallest useful next step)
     *  - passed            -> retake the whole thing to confirm it stuck */
    if (missed.length > 0) {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn";
      retryBtn.textContent = "Retry the " + pluralise(missed.length, "question") + " you missed";
      retryBtn.addEventListener("click", function () {
        startAttempt(missed, "retry");
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      actions.appendChild(retryBtn);
    }

    const retakeBtn = document.createElement("button");
    retakeBtn.type = "button";
    retakeBtn.className = missed.length > 0 ? "btn btn-secondary" : "btn";
    retakeBtn.textContent = mode === "retry" || missed.length > 0 ? "Retake full quiz" : "Retake quiz";
    retakeBtn.addEventListener("click", function () {
      startAttempt(quizData.questions, "full");
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    actions.appendChild(retakeBtn);

    resultsEl.appendChild(actions);
  }
}
