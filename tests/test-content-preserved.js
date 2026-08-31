/*
 * Proves the quiz content was MOVED, not changed.
 * Pulls the old inline quizData out of the pre-refactor commit and
 * compares it question-by-question against the new js/data/*.js files.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");

const ROOT = require("path").resolve(__dirname, "..");

/* The commit BEFORE the Phase 1 refactor — the last one where quiz data still
 * lived inline in the module pages. Pinned rather than using HEAD, so this
 * check keeps working after the refactor is committed. */
const BASELINE = "df4817d";
const PAGES = {
  javascript: "javascript",
  sql: "sql",
  python: "python",
  fhir: "fhir",
  soap: "soap",
  oauth: "oauth",
  "rest-apis": "restApis"
};

// Load the NEW data files.
const sb = { window: {} };
sb.window = sb;
vm.createContext(sb);
for (const f of fs.readdirSync(ROOT + "/js/data")) {
  vm.runInContext(fs.readFileSync(ROOT + "/js/data/" + f, "utf8"), sb);
}

let problems = 0;
let compared = 0;

for (const [page, key] of Object.entries(PAGES)) {
  // Old inline data, straight from the last commit.
  const oldHtml = execSync(`git show ${BASELINE}:modules/${page}.html`, { cwd: ROOT }).toString();
  const match = oldHtml.match(/const quizData = ([\s\S]*?);\s*\n\s*initQuiz/);
  if (!match) { console.log(`could not find inline data in old ${page}.html`); problems++; continue; }

  const oldBox = {};
  vm.createContext(oldBox);
  const oldData = vm.runInContext("(" + match[1] + ")", oldBox);

  const newData = sb.window.QUIZ_DATA[key];

  if (oldData.questions.length !== newData.questions.length) {
    console.log(`${page}: question COUNT changed ${oldData.questions.length} -> ${newData.questions.length}`);
    problems++;
    continue;
  }

  oldData.questions.forEach((oldQ, i) => {
    const newQ = newData.questions[i];
    compared++;

    if (oldQ.question !== newQ.question) {
      console.log(`${page} q${i + 1}: PROMPT changed\n  old: ${oldQ.question}\n  new: ${newQ.question}`);
      problems++;
    }
    if (JSON.stringify(oldQ.options) !== JSON.stringify(newQ.options)) {
      console.log(`${page} q${i + 1}: OPTIONS changed\n  old: ${JSON.stringify(oldQ.options)}\n  new: ${JSON.stringify(newQ.options)}`);
      problems++;
    }
    if (oldQ.correctIndex !== newQ.correctIndex) {
      console.log(`${page} q${i + 1}: correctIndex changed ${oldQ.correctIndex} -> ${newQ.correctIndex}`);
      problems++;
    }
    // The ONLY intended change: the leading space is stripped.
    if (oldQ.explanation.trim() !== newQ.explanation.trim()) {
      console.log(`${page} q${i + 1}: EXPLANATION text changed\n  old: ${oldQ.explanation}\n  new: ${newQ.explanation}`);
      problems++;
    }
    if (newQ.explanation !== newQ.explanation.trimStart()) {
      console.log(`${page} q${i + 1}: new explanation still has a leading space`);
      problems++;
    }
  });
}

console.log(`\ncompared ${compared} questions across ${Object.keys(PAGES).length} modules`);
console.log(problems === 0
  ? `RESULT: content identical to ${BASELINE} (only leading spaces removed)`
  : `RESULT: ${problems} DIFFERENCE(S) — see above`);
process.exit(problems === 0 ? 0 : 1);
