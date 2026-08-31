# Tests

Run everything:

```
node tests/run-all.js
```

Exits `0` if all pass, `1` if anything fails. No dependencies — plain Node, no
npm install, nothing to build. Run it before pushing.

These tests live outside the site itself. GitHub Pages will serve this folder as
static files, but nothing on the site links to it and no page loads it.

## Why these exist as Node scripts

The site is deliberately dependency-free, so there's no test framework here. The
tests instead load the *real* `js/*.js` files into a Node VM context alongside
`dom-shim.js`, a small hand-written stand-in for the browser DOM (it implements
just enough of `createElement`, `querySelector`, `classList`, `closest`, and
event dispatch to run the actual quiz engine). That means these tests exercise
the shipped code, not a copy of it.

## What each file covers

| File | Covers |
| --- | --- |
| `test-content-preserved.js` | Pulls the old inline `quizData` out of the pre-refactor commit's HTML and compares it field-by-field against `js/data/*.js`. Proves the Phase 1 refactor **moved** the questions without changing them. |
| `test-progress.js` | `js/progress.js`: empty state, best-score tracking, the 80% mastery boundary, retry attempts being excluded from best/mastery, per-question streaks, export/import round trip, malformed-JSON rejection, corrupt-store recovery, and the attempt-log cap. |
| `test-quiz.js` | `js/quiz.js`: ~490 randomised rounds proving the question/option shuffle never breaks `correctIndex`, plus highlighting, the missed-question retry flow, incomplete-submit blocking, double-submit guarding, and graceful degradation when `progress.js` is absent. |
| `test-nav.js` | `js/nav.js`: correct link resolution and exactly one `aria-current` from the site root, `/modules/`, a bare `/` URL, a GitHub Pages project subpath, and `file://`. Also checks every HTML page carries the header placeholder and loads its data file. |
| `dom-shim.js` | The DOM stand-in. Not a test — shared by the others. |

## Note on `test-content-preserved.js`

It reads the old inline quiz data from commit `df4817d`, pinned as `BASELINE` at
the top of the file — the last commit before the Phase 1 refactor. It is a
one-time migration check, so it is safe to delete once you trust the move. If
you ever rewrite history and that hash disappears, this is the suite that breaks.
