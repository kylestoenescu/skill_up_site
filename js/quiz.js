/*
 * Shared multiple-choice quiz engine.
 * Each module page defines a quizData object and calls initQuiz(containerId, quizData).
 *
 * quizData shape:
 * {
 *   questions: [
 *     {
 *       question: "string",
 *       options: ["string", "string", ...],
 *       correctIndex: 0,
 *       explanation: "string"
 *     }
 *   ]
 * }
 */

function initQuiz(containerId, quizData) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const scoreEl = document.createElement("div");
  scoreEl.className = "quiz-score";
  scoreEl.setAttribute("role", "status");

  const noteEl = document.createElement("p");
  noteEl.className = "quiz-note";
  noteEl.textContent = "Please answer every question before submitting.";

  const form = document.createElement("form");
  form.noValidate = true;

  quizData.questions.forEach((q, qIndex) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "quiz-question";

    const legend = document.createElement("legend");
    legend.textContent = `${qIndex + 1}. ${q.question}`;
    fieldset.appendChild(legend);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "quiz-options";

    q.options.forEach((optionText, oIndex) => {
      const label = document.createElement("label");
      label.className = "quiz-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q${qIndex}`;
      input.value = String(oIndex);

      const span = document.createElement("span");
      span.textContent = optionText;

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

  const actions = document.createElement("div");
  actions.className = "quiz-actions";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn";
  submitBtn.textContent = "Check answers";

  const retakeBtn = document.createElement("button");
  retakeBtn.type = "button";
  retakeBtn.className = "btn btn-secondary";
  retakeBtn.textContent = "Retake quiz";
  retakeBtn.style.display = "none";

  actions.appendChild(submitBtn);
  actions.appendChild(retakeBtn);
  form.appendChild(actions);

  container.appendChild(scoreEl);
  container.appendChild(noteEl);
  container.appendChild(form);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const allAnswered = quizData.questions.every(
      (_, qIndex) => form.querySelector(`input[name="q${qIndex}"]:checked`) !== null
    );

    if (!allAnswered) {
      noteEl.classList.add("is-visible");
      return;
    }
    noteEl.classList.remove("is-visible");

    let correctCount = 0;

    quizData.questions.forEach((q, qIndex) => {
      const fieldset = form.querySelectorAll(".quiz-question")[qIndex];
      const inputs = fieldset.querySelectorAll('input[type="radio"]');
      const selected = fieldset.querySelector(`input[name="q${qIndex}"]:checked`);
      const selectedIndex = Number(selected.value);
      const isCorrect = selectedIndex === q.correctIndex;

      if (isCorrect) correctCount++;

      inputs.forEach((input) => {
        const optIndex = Number(input.value);
        const optionLabel = input.closest(".quiz-option");
        input.disabled = true;

        if (optIndex === q.correctIndex) {
          optionLabel.classList.add("is-correct");
        } else if (optIndex === selectedIndex && !isCorrect) {
          optionLabel.classList.add("is-incorrect");
        }
      });

      const feedback = fieldset.querySelector('[data-role="feedback"]');
      feedback.classList.add("is-visible", isCorrect ? "correct" : "incorrect");
      const label = document.createElement("span");
      label.className = "result-label";
      label.textContent = isCorrect ? "Correct." : "Not quite.";
      feedback.textContent = "";
      feedback.appendChild(label);
      feedback.appendChild(document.createTextNode(q.explanation));
    });

    const total = quizData.questions.length;
    scoreEl.textContent = `You scored ${correctCount} / ${total}.`;
    scoreEl.classList.add("is-visible");

    submitBtn.style.display = "none";
    retakeBtn.style.display = "inline-block";
    scoreEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  retakeBtn.addEventListener("click", () => {
    form.reset();
    form.querySelectorAll(".quiz-option").forEach((el) => {
      el.classList.remove("is-correct", "is-incorrect");
    });
    form.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.disabled = false;
    });
    form.querySelectorAll('[data-role="feedback"]').forEach((el) => {
      el.classList.remove("is-visible", "correct", "incorrect");
      el.textContent = "";
    });
    scoreEl.classList.remove("is-visible");
    noteEl.classList.remove("is-visible");
    submitBtn.style.display = "inline-block";
    retakeBtn.style.display = "none";
  });
}
