/*
 * stages.js — the three-stage module engine, used by modules/javascript.html.
 *
 * ===========================================================================
 * WHAT THIS IS
 * ===========================================================================
 * The other six modules are a single flat quiz (js/quiz.js). This engine runs a
 * module that has been broken into three gated stages:
 *
 *   trace    predict what a snippet prints        (multiple choice)
 *   parsons  reorder the lines of a solution      (no typing)
 *   free     write the code yourself              (self-assessed)
 *
 * Stage 2 unlocks at 80% on stage 1, stage 3 at 80% on stage 2. The gate is
 * NOT stored anywhere — Progress.getStageGates() recomputes it from the
 * recorded scores each time. That means it can never drift out of sync with
 * the data, and clearing your progress correctly re-locks the later stages.
 *
 * ===========================================================================
 * THE PARSONS INTERACTION — why up/down buttons, not drag-and-drop
 * ===========================================================================
 * Three ways to let someone reorder lines:
 *
 *   drag and drop        feels the best, costs the most. HTML5 drag events do
 *                        not fire on touch devices, so phones need a second
 *                        pointer-event implementation. Worse, dragging is
 *                        invisible to a keyboard, so an accessible version
 *                        needs a parallel keyboard interface anyway — at which
 *                        point you have built the buttons AND the dragging.
 *
 *   numbered selectors   a dropdown per line ("this is line 3"). Accessible,
 *                        but it permits invalid states: two lines can both
 *                        claim position 3, so you need conflict resolution
 *                        rules and a way to explain them.
 *
 *   up/down buttons      what this uses. A <button> is keyboard-operable and
 *                        announced by screen readers for free, works on touch
 *                        with no extra code, and the state is one array of
 *                        indices that can only ever hold a valid permutation.
 *
 * The brief said to favour simplicity and accessibility over polish, and the
 * buttons win on both. The cost is real: reordering seven lines takes more
 * clicks than dragging would, and a long puzzle is tedious. If that becomes
 * the thing you hate, drag-and-drop can be added ON TOP of the buttons later
 * as an enhancement — the buttons stay as the accessible path.
 *
 * ===========================================================================
 * HOW FREE-WRITE IS CHECKED
 * ===========================================================================
 * Self-assessment against a displayed expected output and a worked solution.
 * Your code is never executed.
 *
 * Running it would be better feedback, and it is genuinely possible client-side
 * with `new Function`. It is deliberately not done here for two reasons: an
 * accidental `while (true)` would hang the tab with no way out (the safe fix is
 * a Web Worker with a timeout, and Workers created from blob: URLs are blocked
 * on file://, which this site has to keep working), and executing user code is
 * squarely the "code sandbox" work that was scoped to a later phase. Marking
 * your own work is weaker, but it is honest about what it is, and it is the
 * approach the brief named as a fine first pass.
 */

(function (global) {
  "use strict";

  /** Fisher-Yates. Returns a new array; the input is shared data. */
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

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /** How many items are needed to clear the 80% gate. */
  function requiredToPass(total, threshold) {
    return Math.ceil(threshold * total);
  }

  function formatPercent(fraction) {
    return Math.round(fraction * 100) + "%";
  }

  /**
   * @param {string} containerId
   * @param {string|object} module module id, or the data object itself
   */
  global.initStages = function (containerId, module) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const data = typeof module === "string" ? (global.QUIZ_DATA || {})[module] : module;
    if (!data || !Array.isArray(data.stages)) {
      console.warn("SkillUp: no staged data found for", module);
      return;
    }

    const moduleId = data.moduleId;
    const stages = data.stages;
    const stageIds = stages.map(function (s) { return s.id; });
    const hasProgress = typeof global.Progress !== "undefined";
    const threshold = hasProgress ? global.Progress.MASTERY_THRESHOLD : 0.8;

    /* Which stage panel is open. Starts on the furthest unlocked stage, so
     * returning to the page drops you where you left off rather than back at
     * stage 1. */
    let activeIndex = 0;

    function gates() {
      if (!hasProgress) {
        // No storage: everything open, nothing recorded.
        return stageIds.map(function (id) {
          return { stage: id, unlocked: true, mastered: false, summary: {} };
        });
      }
      return global.Progress.getStageGates(moduleId, stageIds);
    }

    function furthestUnlocked(list) {
      let index = 0;
      list.forEach(function (gate, i) { if (gate.unlocked) index = i; });
      return index;
    }

    // --- chrome ------------------------------------------------------------

    /** The row of stage buttons, showing lock state and best score. */
    function renderPicker(list) {
      const picker = el("div", "stage-picker");
      picker.setAttribute("role", "tablist");

      stages.forEach(function (stage, i) {
        const gate = list[i];
        const button = el("button", "stage-tab");
        button.type = "button";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(i === activeIndex));

        if (!gate.unlocked) {
          button.classList.add("is-locked");
          button.disabled = true;
          button.title = "Pass " + stages[i - 1].title + " to unlock this stage.";
        }
        if (gate.mastered) button.classList.add("is-mastered");
        if (i === activeIndex) button.classList.add("is-active");

        const step = el("span", "stage-tab-step", "Stage " + (i + 1));
        const name = el("span", "stage-tab-title", stage.title);
        button.appendChild(step);
        button.appendChild(name);

        const meta = el("span", "stage-tab-meta");
        if (!gate.unlocked) {
          meta.textContent = "Locked";
        } else if (gate.mastered) {
          meta.textContent = "Passed · best " + gate.summary.bestScore + "/" + gate.summary.bestTotal;
        } else if (gate.summary && gate.summary.bestScore !== null && gate.summary.bestScore !== undefined) {
          meta.textContent = "Best " + gate.summary.bestScore + "/" + gate.summary.bestTotal;
        } else {
          meta.textContent = "Not attempted";
        }
        button.appendChild(meta);

        button.addEventListener("click", function () {
          activeIndex = i;
          render();
        });

        picker.appendChild(button);
      });

      return picker;
    }

    /* The live picker node, kept so it can be refreshed on its own after a
     * stage is recorded — see refreshPicker(). */
    let pickerEl = null;

    /**
     * Swaps the stage picker for a freshly-computed one, leaving the graded
     * panel below it untouched.
     *
     * Without this the tab strip goes stale the moment you pass a stage: you
     * would see "6 / 6 — Build is now unlocked" in the results while the Build
     * tab above still read "Locked" and refused to be clicked. Re-rendering the
     * whole view instead would be simpler, but it would wipe the results you
     * just earned before you had read them.
     */
    function refreshPicker() {
      if (!pickerEl || !pickerEl.parentNode) return;
      const fresh = renderPicker(gates());
      pickerEl.parentNode.replaceChild(fresh, pickerEl);
      pickerEl = fresh;
    }

    /** Re-render everything. Cheap, and removes any chance of stale state. */
    function render() {
      const list = gates();
      container.textContent = "";
      pickerEl = renderPicker(list);
      container.appendChild(pickerEl);

      const panel = el("section", "stage-panel");
      panel.setAttribute("role", "tabpanel");

      const stage = stages[activeIndex];
      const gate = list[activeIndex];

      panel.appendChild(el("h3", "stage-heading", stage.title));
      panel.appendChild(el("p", "stage-blurb", stage.blurb));

      if (!gate.unlocked) {
        const locked = el("div", "stage-locked");
        locked.appendChild(
          el("p", null,
            "This stage unlocks once you score " + formatPercent(threshold) +
            " or better on " + stages[activeIndex - 1].title + ".")
        );
        panel.appendChild(locked);
        container.appendChild(panel);
        return;
      }

      if (stage.type === "trace") renderTrace(stage, panel);
      else if (stage.type === "parsons") renderParsons(stage, panel);
      else if (stage.type === "free") renderFree(stage, panel);

      container.appendChild(panel);
    }

    /**
     * Records one stage attempt. Everything routes through here so the `stage`
     * field can never be forgotten — without it all three stages would share a
     * single bestScore and passing the trace stage would look like mastering
     * the whole module.
     */
    function record(stage, score, total, answers) {
      if (!hasProgress) return;
      global.Progress.recordAttempt(moduleId, {
        mode: "full",
        stage: stage.id,
        score: score,
        total: total,
        answers: answers || []
      });

      /* Immediately reflect the new scores in the tab strip. Doing it here —
       * the one place every stage records — means a new stage type can't forget
       * to unlock its successor. */
      refreshPicker();
    }

    /** The shared "you scored X, here's what happens next" block. */
    function renderOutcome(panel, stage, score, total, onRetry) {
      const passed = total > 0 && score / total >= threshold;
      const needed = requiredToPass(total, threshold);

      const box = el("div", "stage-result " + (passed ? "is-pass" : "is-fail"));
      box.setAttribute("role", "status");
      box.appendChild(
        el("p", "stage-result-score", score + " / " + total + " (" + formatPercent(total ? score / total : 0) + ")")
      );

      const isLast = stages.indexOf(stage) === stages.length - 1;
      let message;
      if (passed && isLast) {
        message = "That's the whole module. Every stage passed.";
      } else if (passed) {
        message = "Passed — " + stages[stages.indexOf(stage) + 1].title + " is now unlocked.";
      } else {
        message = "You need " + needed + " of " + total + " (" + formatPercent(threshold) + ") to move on.";
      }
      box.appendChild(el("p", "stage-result-note", message));

      const actions = el("div", "stage-actions");
      const retry = el("button", "btn" + (passed ? " btn-secondary" : ""), "Try this stage again");
      retry.type = "button";
      retry.addEventListener("click", onRetry);
      actions.appendChild(retry);

      if (passed && !isLast) {
        const next = el("button", "btn", "Go to " + stages[stages.indexOf(stage) + 1].title);
        next.type = "button";
        next.addEventListener("click", function () {
          activeIndex = stages.indexOf(stage) + 1;
          render();
        });
        actions.appendChild(next);
      }

      box.appendChild(actions);
      panel.appendChild(box);
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // --- stage 1: trace ----------------------------------------------------

    function renderTrace(stage, panel) {
      const plan = shuffle(stage.questions).map(function (question) {
        return {
          question: question,
          // Shuffle ORIGINAL option indices; each input keeps its original
          // index as its value, so grading never remaps anything.
          order: shuffle(question.options.map(function (_, i) { return i; })),
          fieldset: null
        };
      });

      const form = document.createElement("form");
      form.noValidate = true;

      const note = el("p", "quiz-note", "Answer every question before checking.");

      plan.forEach(function (item, index) {
        const q = item.question;
        const fieldset = el("fieldset", "quiz-question");
        item.fieldset = fieldset;

        const legend = el("legend", null, index + 1 + ". " + q.question);
        fieldset.appendChild(legend);

        // The snippet. <pre> preserves the newlines authored in the data file.
        const pre = el("pre", "stage-code");
        pre.appendChild(el("code", null, q.code));
        fieldset.appendChild(pre);

        const options = el("div", "quiz-options");
        item.order.forEach(function (originalIndex) {
          const label = el("label", "quiz-option");
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "q-" + q.id;
          input.value = String(originalIndex);
          label.appendChild(input);
          label.appendChild(el("span", null, q.options[originalIndex]));
          options.appendChild(label);
        });
        fieldset.appendChild(options);
        fieldset.appendChild(el("div", "quiz-feedback"));
        fieldset.lastChild.dataset.role = "feedback";

        form.appendChild(fieldset);
      });

      const actions = el("div", "quiz-actions");
      const submit = el("button", "btn", "Check answers");
      submit.type = "submit";
      actions.appendChild(submit);
      form.appendChild(actions);

      panel.appendChild(note);
      panel.appendChild(form);

      let graded = false;
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (graded) return;

        const unanswered = plan.filter(function (item) {
          return !item.fieldset.querySelector("input:checked");
        });
        if (unanswered.length > 0) {
          note.classList.add("is-visible");
          unanswered[0].fieldset.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        note.classList.remove("is-visible");
        graded = true;

        let score = 0;
        const answers = [];

        plan.forEach(function (item) {
          const q = item.question;
          const chosen = Number(item.fieldset.querySelector("input:checked").value);
          const correct = chosen === q.correctIndex;
          if (correct) score++;

          answers.push({
            questionId: q.id,
            correct: correct,
            chosenIndex: chosen,
            chosenText: q.options[chosen],
            correctIndex: q.correctIndex
          });

          item.fieldset.querySelectorAll("input").forEach(function (input) {
            const index = Number(input.value);
            input.disabled = true;
            const label = input.closest(".quiz-option");
            if (index === q.correctIndex) label.classList.add("is-correct");
            else if (index === chosen) label.classList.add("is-incorrect");
          });

          const feedback = item.fieldset.querySelector('[data-role="feedback"]');
          feedback.classList.add("is-visible", correct ? "correct" : "incorrect");
          feedback.appendChild(el("span", "result-label", correct ? "Correct." : "Not quite."));
          feedback.appendChild(el("span", "result-explanation", q.explanation));
        });

        submit.style.display = "none";
        record(stage, score, plan.length, answers);
        renderOutcome(panel, stage, score, plan.length, render);
      });
    }

    // --- stage 2: parsons --------------------------------------------------

    function renderParsons(stage, panel) {
      /* Per puzzle, `order` holds indices into the puzzle's correct line array,
       * in current display order. Solved when order is [0,1,2,…]. Storing
       * indices rather than the strings themselves means the answer key stays
       * in the data file and the DOM only ever holds a permutation. */
      const state = stage.puzzles.map(function (puzzle) {
        let order = shuffle(puzzle.lines.map(function (_, i) { return i; }));
        // Never open on the finished answer.
        let guard = 0;
        while (isSolved(order) && puzzle.lines.length > 1 && guard++ < 20) {
          order = shuffle(order);
        }
        return { puzzle: puzzle, order: order, listEl: null, feedbackEl: null };
      });

      function isSolved(order) {
        return order.every(function (value, i) { return value === i; });
      }

      const wrap = el("div", "parsons-set");

      state.forEach(function (item, index) {
        const box = el("div", "parsons-puzzle");
        box.appendChild(el("p", "parsons-prompt", index + 1 + ". " + item.puzzle.prompt));

        const list = el("ol", "parsons-lines");
        item.listEl = list;
        box.appendChild(list);

        const feedback = el("div", "quiz-feedback");
        item.feedbackEl = feedback;
        box.appendChild(feedback);

        wrap.appendChild(box);
        drawLines(item);
      });

      /**
       * Redraws one puzzle's lines. `focusLine`/`focusDir` restore keyboard
       * focus to the button the user just pressed — without this, every move
       * would dump a keyboard user back to the top of the page.
       */
      function drawLines(item, focusLine, focusDir) {
        const list = item.listEl;
        list.textContent = "";

        item.order.forEach(function (lineIndex, position) {
          const li = el("li", "parsons-line");

          const code = el("code", "parsons-code", item.puzzle.lines[lineIndex]);
          li.appendChild(code);

          const controls = el("div", "parsons-controls");

          const up = el("button", "parsons-move", "↑");
          up.type = "button";
          up.disabled = position === 0;
          up.setAttribute("aria-label", "Move up: " + item.puzzle.lines[lineIndex]);
          up.addEventListener("click", function () { move(item, position, -1); });

          const down = el("button", "parsons-move", "↓");
          down.type = "button";
          down.disabled = position === item.order.length - 1;
          down.setAttribute("aria-label", "Move down: " + item.puzzle.lines[lineIndex]);
          down.addEventListener("click", function () { move(item, position, 1); });

          controls.appendChild(up);
          controls.appendChild(down);
          li.appendChild(controls);
          list.appendChild(li);

          if (lineIndex === focusLine) {
            (focusDir === -1 ? up : down).focus();
          }
        });
      }

      function move(item, position, direction) {
        const target = position + direction;
        if (target < 0 || target >= item.order.length) return;
        const moved = item.order[position];
        item.order[position] = item.order[target];
        item.order[target] = moved;
        drawLines(item, moved, direction);
      }

      const actions = el("div", "quiz-actions");
      const check = el("button", "btn", "Check order");
      check.type = "button";
      actions.appendChild(check);

      panel.appendChild(wrap);
      panel.appendChild(actions);

      let graded = false;
      check.addEventListener("click", function () {
        if (graded) return;
        graded = true;

        let score = 0;
        const answers = [];

        state.forEach(function (item) {
          const solved = isSolved(item.order);
          if (solved) score++;

          answers.push({ questionId: item.puzzle.id, correct: solved });

          // Lock the controls and show the correct order.
          item.listEl.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
          item.listEl.classList.add(solved ? "is-correct" : "is-incorrect");

          const feedback = item.feedbackEl;
          feedback.classList.add("is-visible", solved ? "correct" : "incorrect");
          feedback.appendChild(el("span", "result-label", solved ? "Correct." : "Not quite."));
          feedback.appendChild(el("span", "result-explanation", item.puzzle.explanation));

          if (!solved) {
            const answer = el("pre", "stage-code parsons-answer");
            answer.appendChild(el("code", null, item.puzzle.lines.join("\n")));
            feedback.appendChild(answer);
          }
        });

        check.style.display = "none";
        record(stage, score, state.length, answers);
        renderOutcome(panel, stage, score, state.length, render);
      });
    }

    // --- stage 3: free-write ----------------------------------------------

    function renderFree(stage, panel) {
      const state = stage.tasks.map(function (task) {
        return { task: task, result: null };
      });

      const wrap = el("div", "free-set");

      state.forEach(function (item, index) {
        const task = item.task;
        const box = el("div", "free-task");

        box.appendChild(el("p", "free-prompt", index + 1 + ". " + task.prompt));

        const label = el("label", "free-label", "Your code");
        label.htmlFor = "free-" + task.id;
        box.appendChild(label);

        const area = document.createElement("textarea");
        area.className = "free-input";
        area.id = "free-" + task.id;
        area.rows = 8;
        area.spellcheck = false;
        area.value = task.starter;
        box.appendChild(area);

        const expected = el("p", "free-expected");
        expected.appendChild(el("span", "free-expected-label", "Expected output:"));
        expected.appendChild(el("code", null, task.expected));
        box.appendChild(expected);

        const reveal = el("button", "btn btn-secondary", "Reveal solution and self-mark");
        reveal.type = "button";
        box.appendChild(reveal);

        const answerBox = el("div", "free-answer");
        answerBox.hidden = true;
        box.appendChild(answerBox);

        reveal.addEventListener("click", function () {
          reveal.style.display = "none";
          answerBox.hidden = false;

          const solution = el("pre", "stage-code");
          solution.appendChild(el("code", null, task.solution));
          answerBox.appendChild(el("p", "free-answer-label", "One correct solution"));
          answerBox.appendChild(solution);

          if (task.hints && task.hints.length) {
            const hints = el("ul", "free-hints");
            task.hints.forEach(function (hint) { hints.appendChild(el("li", null, hint)); });
            answerBox.appendChild(hints);
          }

          const ask = el("p", "free-selfmark-q", "Does your version produce the same output?");
          answerBox.appendChild(ask);

          const choice = el("div", "free-selfmark");
          const yes = el("button", "btn", "Yes — mine works");
          const no = el("button", "btn btn-secondary", "Not yet");
          yes.type = "button";
          no.type = "button";

          function mark(correct) {
            item.result = correct;
            yes.classList.toggle("is-chosen", correct);
            no.classList.toggle("is-chosen", !correct);
            updateSubmitState();
          }
          yes.addEventListener("click", function () { mark(true); });
          no.addEventListener("click", function () { mark(false); });

          choice.appendChild(yes);
          choice.appendChild(no);
          answerBox.appendChild(choice);
        });

        wrap.appendChild(box);
      });

      const note = el("p", "quiz-note", "Reveal and mark every task before finishing.");
      const actions = el("div", "quiz-actions");
      const finish = el("button", "btn", "Finish stage");
      finish.type = "button";
      actions.appendChild(finish);

      panel.appendChild(wrap);
      panel.appendChild(note);
      panel.appendChild(actions);

      function updateSubmitState() {
        const done = state.every(function (item) { return item.result !== null; });
        if (done) note.classList.remove("is-visible");
      }

      let graded = false;
      finish.addEventListener("click", function () {
        if (graded) return;

        const unmarked = state.filter(function (item) { return item.result === null; });
        if (unmarked.length > 0) {
          note.classList.add("is-visible");
          return;
        }
        graded = true;

        const score = state.filter(function (item) { return item.result === true; }).length;
        const answers = state.map(function (item) {
          return { questionId: item.task.id, correct: item.result === true };
        });

        finish.style.display = "none";
        record(stage, score, state.length, answers);
        renderOutcome(panel, stage, score, state.length, render);
      });
    }

    // --- go ----------------------------------------------------------------

    activeIndex = furthestUnlocked(gates());
    render();
  };
})(window);
