/*
 * Runs every test file and reports one overall result.
 *
 *   node tests/run-all.js
 *
 * Exits 0 if everything passed, 1 if anything failed — so it's safe to run
 * before a push, or to wire into CI later if this ever gets a CI.
 *
 * There are no dependencies. These tests run the real site files in Node using
 * a hand-written DOM stand-in (dom-shim.js), which is why the site itself can
 * stay dependency-free and build-step-free.
 */

const { spawnSync } = require("child_process");
const path = require("path");

const SUITES = [
  ["test-content-preserved.js", "quiz content matches the pre-refactor commit"],
  ["test-modules.js", "module manifest matches the files on disk"],
  ["test-progress.js", "progress.js storage layer"],
  ["test-quiz.js", "quiz.js engine, shuffling and grading"],
  ["test-stages.js", "three-stage JavaScript module: gating and per-stage scoring"],
  ["test-nav.js", "nav.js paths and page wiring"],
  ["test-flashcards.js", "flashcard scheduling and review recording"],
  ["test-cache-busting.js", "asset version stamps (stale-cache guard)"]
];

let failed = [];

SUITES.forEach(function (entry) {
  const file = entry[0];
  const label = entry[1];

  console.log("\n" + "=".repeat(66));
  console.log("RUNNING  " + file + "  —  " + label);
  console.log("=".repeat(66));

  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit"
  });

  if (result.status !== 0) failed.push(file);
});

console.log("\n" + "=".repeat(66));
if (failed.length === 0) {
  console.log("ALL SUITES PASSED (" + SUITES.length + "/" + SUITES.length + ")");
} else {
  console.log("FAILED: " + failed.join(", "));
}
console.log("=".repeat(66));

process.exit(failed.length === 0 ? 0 : 1);
