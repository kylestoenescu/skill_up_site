/*
 * Guards the stale-cache failure that took the quizzes off the live site.
 *
 * WHAT HAPPENED
 * Cloudflare caches HTML for 10 minutes but JS/CSS for 4 hours. Phase 2 changed
 * the contract between a page and the engine it calls — initQuiz went from
 * taking a data object to taking a module id string. The HTML updated quickly,
 * quiz.js did not, and for hours browsers ran new HTML against old JS. The old
 * engine received a string where it expected an object, failed a guard clause,
 * and returned without rendering. No console error; the quizzes simply vanished.
 *
 * THE FIX these tests protect
 * Every local script/stylesheet URL carries ?v=N. A versioned URL cannot be
 * satisfied by a cached copy of a different version, so a page and its assets
 * always update together. tools/bump-assets.js stamps them.
 *
 * These checks fail loudly if a stamp is missing or if the versions drift apart
 * — either of which reopens the door to the bug.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

function htmlFiles() {
  const files = ["index.html"];
  fs.readdirSync(path.join(ROOT, "modules"))
    .filter(function (f) { return f.endsWith(".html"); })
    .forEach(function (f) { files.push("modules/" + f); });
  return files;
}

const versionsSeen = new Set();
let unstamped = [];

htmlFiles().forEach(function (rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");

  /* Every local .js / .css reference, with or without a version stamp. */
  const re = /\b(?:src|href)="(?!https?:|\/\/)([^"]+\.(?:js|css))(\?v=(\d+))?"/g;
  let m;
  let count = 0;

  while ((m = re.exec(html)) !== null) {
    count++;
    if (!m[2]) {
      unstamped.push(rel + " -> " + m[1]);
    } else {
      versionsSeen.add(m[3]);
    }
  }

  check(rel + ": references at least one local asset", count > 0);
});

check("every local script/stylesheet carries a ?v= stamp\n" +
      (unstamped.length ? "      unstamped: " + unstamped.join("\n                 ") : ""),
      unstamped.length === 0);

check("all pages agree on the same asset version (saw: " +
      Array.from(versionsSeen).join(", ") + ")",
      versionsSeen.size === 1);

/*
 * The contract that actually broke: a page calls initQuiz with a module id
 * string, which only the current engine understands. Assert the engine still
 * accepts a string, so a future refactor can't silently revert to object-only
 * while the pages keep passing ids.
 */
{
  const quizSrc = fs.readFileSync(path.join(ROOT, "js/quiz.js"), "utf8");
  check("quiz.js still resolves a module id string via QUIZ_DATA",
    /typeof\s+module\s*===\s*"string"/.test(quizSrc) &&
    /QUIZ_DATA/.test(quizSrc));
  check("quiz.js warns instead of failing silently when data is missing",
    /console\.warn/.test(quizSrc));
}

/*
 * nav.js and home.js locate their own <script> tag to work out the site root.
 * With ?v=N appended, a `src$=` (ends-with) selector no longer matches — it has
 * to be `src*=` (contains). This is the exact regression the version stamps
 * would otherwise have introduced.
 */
["js/nav.js", "js/home.js"].forEach(function (rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const hasEndsWith = /script\[src\$=/.test(src);
  check(rel + ": script-locating selector tolerates a ?v= query", !hasEndsWith);
});

console.log(failures === 0 ? "\nALL CACHE-BUSTING TESTS PASSED" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
