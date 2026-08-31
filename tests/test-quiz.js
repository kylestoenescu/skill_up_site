/*
 * Runs the REAL js/quiz.js + js/progress.js against the REAL data files,
 * over many randomised rounds, to prove the shuffle never breaks grading.
 */
const fs = require("fs");
const vm = require("vm");
const { El, makeDocument } = require("./dom-shim.js");

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

const ROOT = require("path").resolve(__dirname, "..") + "/";

function newSandbox() {
  const document = makeDocument();
  const sb = {
    console, Date, Math, JSON, Object, Array, isFinite, String, Number, Promise, Set, Map,
    document,
    localStorage: makeLocalStorage(),
    Blob: function () {},
    FileReader: function () {},
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(ROOT + "js/progress.js", "utf8"), sb);
  vm.runInContext(fs.readFileSync(ROOT + "js/quiz.js", "utf8"), sb);
  for (const f of fs.readdirSync(ROOT + "js/data")) {
    vm.runInContext(fs.readFileSync(ROOT + "js/data/" + f, "utf8"), sb);
  }
  return sb;
}

let failures = 0;
let totalFailures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log("FAIL  " + label); }
}
function report(label) {
  console.log((failures === 0 ? "PASS  " : "FAIL  ") + label);
  totalFailures += failures;
  failures = 0;
}

const sb0 = newSandbox();
const DATA_KEYS = Object.keys(sb0.QUIZ_DATA);
console.log("data files loaded: " + DATA_KEYS.join(", ") + "\n");

/* Mount a quiz into a fresh container and return it. */
function mount(sb, quizData) {
  const container = new El("div");
  container.setAttribute("id", "quiz");
  sb.document.body.children = [];
  sb.document.body.appendChild(container);
  sb.initQuiz("quiz", quizData);
  return container;
}

/*
 * Answer every question in the currently-rendered form.
 * pick(question) -> the ORIGINAL option index the "user" wants.
 * The user only ever sees option TEXT, so we find the on-screen radio by the
 * text of its sibling span - exactly how a real person would.
 */
function answerAll(container, allQuestions, pick) {
  const form = container.querySelectorAll("form")[0];
  const fieldsets = form.querySelectorAll(".quiz-question");

  fieldsets.forEach((fset) => {
    const legend = fset.querySelectorAll("legend")[0].textContent;
    const prompt = legend.replace(/^\d+\.\s/, "");
    const q = allQuestions.find((x) => x.question === prompt);
    if (!q) throw new Error("rendered a question not in the data: " + prompt);

    const wantedIndex = pick(q);
    const wantedText = q.options[wantedIndex];

    let hit = null;
    fset.querySelectorAll(".quiz-option").forEach((label) => {
      if (label.querySelectorAll("span")[0].textContent === wantedText) hit = label;
    });
    if (!hit) throw new Error("option text not on screen: " + wantedText);

    fset.querySelectorAll('input[type="radio"]').forEach((i) => { i.checked = false; });
    hit.querySelectorAll("input")[0].checked = true;
  });

  return { form, questionCount: fieldsets.length };
}

// ===================================================================
// TEST 1: a user who always knows the answer must always score 100%,
// no matter how questions and options got shuffled.
// ===================================================================
for (let round = 0; round < 210; round++) {
  const sb = newSandbox();
  const key = DATA_KEYS[round % DATA_KEYS.length];
  const data = sb.QUIZ_DATA[key];
  const container = mount(sb, data);
  const { form, questionCount } = answerAll(container, data.questions, (q) => q.correctIndex);

  check(key + ": all questions rendered", questionCount === data.questions.length);
  form._fire("submit");

  const attempt = sb.Progress.getLastAttempt(data.moduleId);
  check(key + ": perfect knowledge scores full marks", attempt.score === data.questions.length);
  check(key + ": mastered after perfect run", sb.Progress.isMastered(data.moduleId) === true);
  check(key + ": every answer flagged correct", attempt.answers.every((a) => a.correct === true));
  check(key + ": chosenIndex equals correctIndex", attempt.answers.every((a) => a.chosenIndex === a.correctIndex));
  attempt.answers.forEach((a) => {
    const q = data.questions.find((x) => x.id === a.questionId);
    check(key + ": chosenText matches data", a.chosenText === q.options[q.correctIndex]);
  });
}
report("210 rounds: knowing the answer always scores 100% despite shuffling");

// ===================================================================
// TEST 2: always picking a WRONG option must always score 0, and the
// recorded chosenIndex/chosenText must match what was actually clicked.
// ===================================================================
for (let round = 0; round < 210; round++) {
  const sb = newSandbox();
  const key = DATA_KEYS[round % DATA_KEYS.length];
  const data = sb.QUIZ_DATA[key];
  const container = mount(sb, data);

  const intended = new Map();
  const { form } = answerAll(container, data.questions, (q) => {
    const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
    const pickIdx = wrong[Math.floor(Math.random() * wrong.length)];
    intended.set(q.id, pickIdx);
    return pickIdx;
  });
  form._fire("submit");

  const attempt = sb.Progress.getLastAttempt(data.moduleId);
  check(key + ": all-wrong scores 0", attempt.score === 0);
  check(key + ": not mastered", sb.Progress.isMastered(data.moduleId) === false);
  attempt.answers.forEach((a) => {
    const q = data.questions.find((x) => x.id === a.questionId);
    check(key + ": recorded the option actually clicked", a.chosenIndex === intended.get(a.questionId));
    check(key + ": chosenText matches chosenIndex", a.chosenText === q.options[a.chosenIndex]);
    check(key + ": marked incorrect", a.correct === false);
  });
}
report("210 rounds: wrong answers graded and recorded correctly");

// ===================================================================
// TEST 3: highlighting follows the option, not the screen position.
// ===================================================================
for (let round = 0; round < 70; round++) {
  const sb = newSandbox();
  const key = DATA_KEYS[round % DATA_KEYS.length];
  const data = sb.QUIZ_DATA[key];
  const container = mount(sb, data);
  const { form } = answerAll(container, data.questions, (q) => (q.correctIndex + 1) % q.options.length);
  form._fire("submit");

  form.querySelectorAll(".quiz-question").forEach((fset) => {
    const prompt = fset.querySelectorAll("legend")[0].textContent.replace(/^\d+\.\s/, "");
    const q = data.questions.find((x) => x.question === prompt);
    const correctText = q.options[q.correctIndex];

    const green = fset.querySelectorAll(".quiz-option").filter((l) => l.classList.contains("is-correct"));
    check("exactly one option flagged correct", green.length === 1);
    check("the green option holds the correct TEXT", green[0].querySelectorAll("span")[0].textContent === correctText);

    const red = fset.querySelectorAll(".quiz-option").filter((l) => l.classList.contains("is-incorrect"));
    check("exactly one option flagged incorrect", red.length === 1);
    check("the red option is not the correct one", red[0].querySelectorAll("span")[0].textContent !== correctText);
  });
}
report("70 rounds: green/red highlighting follows the option, not the position");

// ===================================================================
// TEST 4: retry flow presents ONLY the missed questions.
// ===================================================================
{
  const sb = newSandbox();
  const data = sb.QUIZ_DATA.sql;
  const container = mount(sb, data);
  const missIds = new Set(["sql-2", "sql-4"]);
  const { form } = answerAll(container, data.questions, (q) =>
    missIds.has(q.id) ? (q.correctIndex + 1) % q.options.length : q.correctIndex
  );
  form._fire("submit");

  const attempt = sb.Progress.getLastAttempt("sql");
  check("scored 3/5", attempt.score === 3 && attempt.total === 5);
  check("not mastered at 60%", sb.Progress.isMastered("sql") === false);
  check("score block marked as a fail", container.querySelectorAll(".quiz-score")[0].classList.contains("is-fail"));

  const missedList = container.querySelectorAll(".quiz-missed")[0];
  check("missed list rendered", !!missedList);
  check("missed list has 2 entries", missedList && missedList.querySelectorAll("li").length === 2);

  const retryBtn = container.querySelectorAll("button").find((b) => /Retry the 2 questions/.test(b.textContent));
  check("retry button offered with a count", !!retryBtn);

  retryBtn.click();

  const retryFieldsets = container.querySelectorAll(".quiz-question");
  check("retry round shows only 2 questions", retryFieldsets.length === 2);
  const shown = retryFieldsets.map((f) => f.querySelectorAll("legend")[0].textContent.replace(/^\d+\.\s/, "")).sort();
  const expected = data.questions.filter((q) => missIds.has(q.id)).map((q) => q.question).sort();
  check("retry shows exactly the missed questions", shown.join("|") === expected.join("|"));
  check("retry banner explains it doesn't count", /best score/.test(container.querySelectorAll(".quiz-stats")[0].textContent));

  const r = answerAll(container, data.questions, (q) => q.correctIndex);
  r.form._fire("submit");

  const retryAttempt = sb.Progress.getLastAttempt("sql");
  check("retry recorded with mode=retry", retryAttempt.mode === "retry");
  check("retry scored 2/2", retryAttempt.score === 2 && retryAttempt.total === 2);
  check("perfect retry does NOT grant mastery", sb.Progress.isMastered("sql") === false);
  check("best score still 3", sb.Progress.getBestScore("sql") === 3);
  check("per-question history updated by retry", sb.Progress.getQuestionStat("sql", "sql-2").seen === 2);
  check("sql-2 streak reset then rebuilt to 1", sb.Progress.getQuestionStat("sql", "sql-2").streak === 1);

  const retakeBtn = container.querySelectorAll("button").find((b) => /Retake full quiz/.test(b.textContent));
  check("retake button offered", !!retakeBtn);
  retakeBtn.click();
  check("retake shows all 5 questions again", container.querySelectorAll(".quiz-question").length === 5);

  const a2 = answerAll(container, data.questions, (q) => q.correctIndex);
  a2.form._fire("submit");
  check("full retake at 5/5 grants mastery", sb.Progress.isMastered("sql") === true);
}
report("retry flow routes back into only the missed material");

// ===================================================================
// TEST 5: incomplete submission is blocked and records nothing.
// ===================================================================
{
  const sb = newSandbox();
  const data = sb.QUIZ_DATA.oauth;
  const container = mount(sb, data);
  const form = container.querySelectorAll("form")[0];
  form.querySelectorAll(".quiz-question")[0].querySelectorAll("input")[0].checked = true;
  form._fire("submit");

  check("nothing recorded on incomplete submit", sb.Progress.getAttemptCount("oauth") === 0);
  check("nag shown", container.querySelectorAll(".quiz-note")[0].classList.contains("is-visible"));
  check("score stays hidden", !container.querySelectorAll(".quiz-score")[0].classList.contains("is-visible"));
}
report("incomplete submissions are blocked, nothing recorded");

// ===================================================================
// TEST 6: banner shows previous best + attempt count on a later load.
// ===================================================================
{
  const sb = newSandbox();
  const data = sb.QUIZ_DATA.python;
  let container = mount(sb, data);
  check("first visit banner says first time", /First time through/.test(container.querySelectorAll(".quiz-stats")[0].textContent));

  const a = answerAll(container, data.questions, (q) => q.correctIndex);
  a.form._fire("submit");

  container = mount(sb, data); // simulate a page reload against the same storage
  const banner = container.querySelectorAll(".quiz-stats")[0].textContent;
  check("banner shows best score", /Best: 5 \/ 5 \(100%\)/.test(banner));
  check("banner shows attempt count", /1 attempt/.test(banner));
  check("banner shows mastery badge", /Mastered/.test(banner));
}
report("banner reports previous best, attempt count and mastery on load");

// ===================================================================
// TEST 7: quiz survives progress.js being absent entirely.
// ===================================================================
{
  const document = makeDocument();
  const sb = { console, Date, Math, JSON, Object, Array, String, Number, Set, Map, document };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(ROOT + "js/quiz.js", "utf8"), sb);
  vm.runInContext(fs.readFileSync(ROOT + "js/data/fhir.js", "utf8"), sb);

  const container = new El("div");
  container.setAttribute("id", "quiz");
  sb.document.body.appendChild(container);
  let threw = null;
  try {
    sb.initQuiz("quiz", sb.QUIZ_DATA.fhir);
    const { form } = answerAll(container, sb.QUIZ_DATA.fhir.questions, (q) => q.correctIndex);
    form._fire("submit");
  } catch (e) {
    threw = e;
  }
  check("no crash without progress.js", threw === null);
  check("still grades and shows a score", /You scored 5 \/ 5/.test(container.querySelectorAll(".quiz-score")[0].textContent));
}
report("quiz still works when progress.js is missing (graceful degradation)");

// ===================================================================
// TEST 8: data-file hygiene.
// ===================================================================
DATA_KEYS.forEach((key) => {
  sb0.QUIZ_DATA[key].questions.forEach((q) => {
    check(key + "/" + q.id + ": no leading space in explanation", q.explanation === q.explanation.trimStart());
    check(key + "/" + q.id + ": has a stable id", typeof q.id === "string" && q.id.length > 0);
    check(key + "/" + q.id + ": correctIndex in range", q.correctIndex >= 0 && q.correctIndex < q.options.length);
  });
  check(key + ": has a moduleId", typeof sb0.QUIZ_DATA[key].moduleId === "string");
});
const allIds = DATA_KEYS.flatMap((k) => sb0.QUIZ_DATA[k].questions.map((q) => q.id));
check("all question ids unique site-wide", new Set(allIds).size === allIds.length);
report("data files: no leading spaces, unique ids, valid correctIndex (" + allIds.length + " questions)");

// ===================================================================
// TEST 9: double-submit must not record two attempts.
// ===================================================================
{
  const sb = newSandbox();
  const data = sb.QUIZ_DATA.soap;
  const container = mount(sb, data);
  const { form } = answerAll(container, data.questions, (q) => q.correctIndex);
  form._fire("submit");
  form._fire("submit");
  form._fire("submit");
  check("only one attempt recorded", sb.Progress.getAttemptCount("soap") === 1);
  check("question seen count is 1", sb.Progress.getQuestionStat("soap", "soap-1").seen === 1);
}
report("double-submit guarded");

console.log(totalFailures === 0 ? "\nALL QUIZ TESTS PASSED" : "\n" + totalFailures + " FAILURE(S)");
process.exit(totalFailures === 0 ? 0 : 1);
