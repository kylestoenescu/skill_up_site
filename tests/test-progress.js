// Harness: fake window + localStorage so progress.js can be exercised in node.
const fs = require("fs");
const vm = require("vm");
const ROOT = require("path").resolve(__dirname, "..");

function makeFakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

const sandbox = {
  console,
  Date, Math, JSON, Object, Array, isFinite, String, Number, Promise,
  localStorage: makeFakeLocalStorage(),
  document: { createElement: () => ({ click() {} }), body: { appendChild(){}, removeChild(){} } },
  Blob: function () {},
  URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
  FileReader: function () {}
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ROOT + "/js/progress.js", "utf8"), sandbox);

const P = sandbox.Progress;
let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

check("storage detected as available", P.isAvailable() === true);

// --- empty state ---
let s = P.getModuleSummary("sql");
check("empty: bestScore null", s.bestScore === null);
check("empty: not mastered", s.mastered === false);
check("empty: 0 attempts", s.attemptCount === 0);

// --- record a failing full attempt (3/5 = 60%) ---
P.recordAttempt("sql", {
  score: 3, total: 5, mode: "full",
  answers: [
    { questionId: "sql-1", correct: true,  chosenIndex: 0, chosenText: "WHERE", correctIndex: 0 },
    { questionId: "sql-2", correct: true,  chosenIndex: 1, chosenText: "LEFT JOIN", correctIndex: 1 },
    { questionId: "sql-3", correct: true,  chosenIndex: 0, chosenText: "unique", correctIndex: 0 },
    { questionId: "sql-4", correct: false, chosenIndex: 1, chosenText: "DROP TABLE", correctIndex: 0 },
    { questionId: "sql-5", correct: false, chosenIndex: 3, chosenText: "Joins", correctIndex: 0 }
  ]
});

s = P.getModuleSummary("sql");
check("after 3/5: best 3", s.bestScore === 3);
check("after 3/5: 60%", Math.round(s.bestPercent * 100) === 60);
check("after 3/5: not mastered", s.mastered === false);
check("after 3/5: 1 attempt", s.attemptCount === 1);

// --- retry attempt scoring 2/2 (100%) must NOT create mastery ---
P.recordAttempt("sql", {
  score: 2, total: 2, mode: "retry",
  answers: [
    { questionId: "sql-4", correct: true, chosenIndex: 0, chosenText: "DELETE FROM", correctIndex: 0 },
    { questionId: "sql-5", correct: true, chosenIndex: 0, chosenText: "Groups rows", correctIndex: 0 }
  ]
});
s = P.getModuleSummary("sql");
check("retry 2/2 does NOT become best score", s.bestScore === 3);
check("retry 2/2 does NOT grant mastery", s.mastered === false);
check("retry still counts as an attempt", s.attemptCount === 2);
check("fullAttemptCount stays 1", s.fullAttemptCount === 1);

// --- retry DID update per-question history ---
const q4 = P.getQuestionStat("sql", "sql-4");
check("sql-4 seen twice", q4.seen === 2);
check("sql-4 correct once", q4.correct === 1);
check("sql-4 incorrect once", q4.incorrect === 1);
check("sql-4 streak is 1 (miss then hit)", q4.streak === 1);
check("sql-4 lastResult correct", q4.lastResult === "correct");

// --- passing full attempt grants mastery ---
P.recordAttempt("sql", {
  score: 5, total: 5, mode: "full",
  answers: ["sql-1","sql-2","sql-3","sql-4","sql-5"].map(id => (
    { questionId: id, correct: true, chosenIndex: 0, chosenText: "x", correctIndex: 0 }
  ))
});
s = P.getModuleSummary("sql");
check("5/5 full -> best 5", s.bestScore === 5);
check("5/5 full -> mastered", s.mastered === true);

// --- a later WORSE attempt must not lower the best ---
P.recordAttempt("sql", {
  score: 1, total: 5, mode: "full",
  answers: [{ questionId: "sql-1", correct: false, chosenIndex: 1, chosenText: "y", correctIndex: 0 }]
});
s = P.getModuleSummary("sql");
check("worse later attempt keeps best at 5", s.bestScore === 5);
check("mastery is sticky once earned", s.mastered === true);
check("lastAttempt is the newest one", s.lastAttempt.score === 1);

// --- exactly 80% is a pass (boundary) ---
P.recordAttempt("fhir", {
  score: 4, total: 5, mode: "full",
  answers: [{ questionId: "fhir-1", correct: true, chosenIndex: 0, chosenText: "x", correctIndex: 0 }]
});
check("exactly 80% counts as mastered", P.isMastered("fhir") === true);

// --- struggling / mastered question queries ---
const struggling = P.getStrugglingQuestions("sql");
check("struggling list finds missed questions", struggling.length >= 2);
check("struggling sorted worst-first", struggling[0].stat.incorrect >= struggling[struggling.length-1].stat.incorrect);
const masteredQs = P.getMasteredQuestions("sql", { minStreak: 2 });
check("mastered-question query returns streaked ids", masteredQs.some(m => m.questionId === "sql-2"));

// --- export / import round trip ---
const exported = P.exportJSON();
P.reset();
check("reset clears everything", P.getModuleSummary("sql").attemptCount === 0);
const imp = P.importJSON(exported);
check("import reports ok", imp.ok === true);
check("import restores best score", P.getBestScore("sql") === 5);
check("import restores question stats", P.getQuestionStat("sql", "sql-4").seen === 3);

// --- malformed input handling ---
check("import rejects non-JSON", P.importJSON("{not json").ok === false);
check("import rejects wrong-shape JSON", P.importJSON('{"hello":"world"}').ok === false);

// --- corrupted storage recovers instead of throwing ---
sandbox.localStorage.setItem("skillup:v1", "}}}garbage{{{");
let recovered;
try { recovered = P.dump(); } catch (e) { recovered = null; }
check("corrupt store does not throw", recovered !== null);
check("corrupt store yields empty modules", Object.keys(recovered.modules).length === 0);
check("corrupt store backed up", sandbox.localStorage.getItem("skillup:v1:corrupt-backup") === "}}}garbage{{{");

// --- attempt log is capped ---
P.reset();
for (let i = 0; i < 60; i++) {
  P.recordAttempt("python", { score: i % 6, total: 5, mode: "full", answers: [] });
}
check("attempt log capped at 50", P.getAttempts("python").length === 50);
check("newest attempts survive the cap", P.getAttempts("python").slice(-1)[0].score === 59 % 6);

console.log(failures === 0 ? "\nALL PROGRESS TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
