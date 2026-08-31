/*
 * Tests the flashcard scheduling in progress.js.
 *
 * The risky parts here are NOT the rendering — they're:
 *   1. a "review" must never leak into best score, mastery, or attempt count
 *   2. the Leitner schedule must hold a card back for the right number of days
 *   3. a card must retire after 3 correct in a row, and come BACK after a miss
 *
 * The clock is injected (`now`) so none of this is time-flaky.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function newProgress() {
  const map = new Map();
  const sb = {
    console, Date, Math, JSON, Object, Array, isFinite, String, Number, Promise,
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    },
    document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } },
    Blob: function () {}, FileReader: function () {},
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(ROOT + "/js/progress.js", "utf8"), sb);
  return sb.Progress;
}

let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

const DAY = 24 * 60 * 60 * 1000;
function answer(id, correct) {
  return { questionId: id, correct: correct, chosenIndex: 0, chosenText: "x", correctIndex: correct ? 0 : 1 };
}

// =====================================================================
// 1. A review must not contaminate quiz scoring.
// =====================================================================
{
  const P = newProgress();

  P.recordAttempt("sql", { mode: "full", score: 3, total: 5, answers: [answer("sql-1", true)] });
  P.recordReview("sql", [answer("sql-2", true), answer("sql-3", true)]);

  const s = P.getModuleSummary("sql");
  check("review does not become the best score", s.bestScore === 3);
  check("review does not grant mastery", s.mastered === false);
  check("review is excluded from attemptCount", s.attemptCount === 1);
  check("review is counted separately", s.reviewCount === 1);
  check("lastAttempt is the quiz, not the review", s.lastAttempt.mode === "full");
  check("review still updated question stats", P.getQuestionStat("sql", "sql-2").seen === 1);
}

// =====================================================================
// 2. The mode whitelist — the bug this feature could have caused.
//    An unknown mode is coerced to "full", so "review" HAD to be added to
//    the list before recording one, or every review would have counted as a
//    perfect quiz run.
// =====================================================================
{
  const P = newProgress();
  P.recordAttempt("fhir", { mode: "review", score: 2, total: 2, answers: [] });
  const attempts = P.getAttempts("fhir");
  check("mode 'review' survives a round trip", attempts[0].mode === "review");
  check("a 2/2 review is NOT mastery", P.isMastered("fhir") === false);

  P.recordAttempt("fhir", { mode: "nonsense", score: 2, total: 2, answers: [] });
  check("an unknown mode still falls back to 'full'", P.getAttempts("fhir")[1].mode === "full");
}

// =====================================================================
// 3. Leitner intervals: streak 0 always due, 1 -> 1 day, 2 -> 3 days.
// =====================================================================
{
  const P = newProgress();
  const base = new Date("2026-09-01T12:00:00.000Z");

  const missed = { seen: 1, correct: 0, incorrect: 1, streak: 0, bestStreak: 0, lastResult: "incorrect", lastSeenAt: base.toISOString(), lastCorrectAt: null, lastIncorrectAt: base.toISOString() };
  check("streak 0 is due immediately", P.getReviewSchedule(missed, base).due === true);

  const streak1 = Object.assign({}, missed, { streak: 1, correct: 1, lastCorrectAt: base.toISOString() });
  check("streak 1 not due after 2 hours", P.getReviewSchedule(streak1, new Date(base.getTime() + 2 * 3600e3)).due === false);
  check("streak 1 due after 1 day", P.getReviewSchedule(streak1, new Date(base.getTime() + DAY + 1000)).due === true);

  const streak2 = Object.assign({}, missed, { streak: 2, correct: 2 });
  check("streak 2 not due after 1 day", P.getReviewSchedule(streak2, new Date(base.getTime() + DAY)).due === false);
  check("streak 2 due after 3 days", P.getReviewSchedule(streak2, new Date(base.getTime() + 3 * DAY + 1000)).due === true);

  const streak3 = Object.assign({}, missed, { streak: 3, correct: 3 });
  const sched = P.getReviewSchedule(streak3, new Date(base.getTime() + 400 * DAY));
  check("streak 3 is retired, never due again", sched.retired === true && sched.due === false);

  const unseen = { seen: 0, correct: 0, incorrect: 0, streak: 0, bestStreak: 0, lastResult: null, lastSeenAt: null, lastCorrectAt: null, lastIncorrectAt: null };
  check("a never-answered question is not in the review deck", P.getReviewSchedule(unseen, base).due === false);
}

// =====================================================================
// 4. The deck: retirement, resurrection after a miss, ordering.
// =====================================================================
{
  const P = newProgress();
  /* Anchor to the REAL clock, not a fixed date. recordAttempt stamps lastSeenAt
   * with the system clock, so a hardcoded `now` silently drifts relative to it
   * as real time passes — this test began failing when the calendar rolled past
   * the hardcoded date and a streak-1 card stopped being due. Any test that
   * records and then reads must derive its read clock from the write. */
  const t0 = new Date();
  const ids = ["sql"];

  // Miss sql-1 twice, sql-2 once.
  P.recordAttempt("sql", { mode: "full", score: 0, total: 2, answers: [answer("sql-1", false), answer("sql-2", false)] });
  P.recordAttempt("sql", { mode: "full", score: 1, total: 2, answers: [answer("sql-1", false), answer("sql-2", true)] });

  /* sql-1 was missed twice (streak 0, always due). sql-2 was missed then
   * answered correctly (streak 1), so the schedule correctly holds it back for
   * a day. The previous version of this test asserted BOTH were due now and
   * only passed because its hardcoded clock happened to sit two days in the
   * future — it was green for the wrong reason. Assert the real behaviour. */
  let queue = P.getReviewQueue(ids, { now: t0 });
  check("only the still-failing question is due right away",
    queue.length === 1 && queue[0].questionId === "sql-1");

  check("the one just answered correctly is held back, not dropped",
    P.getReviewQueue(ids, { now: t0, includeNotDue: true }).length === 2);

  const tomorrow = new Date(t0.getTime() + DAY + 1000);
  check("it comes back a day later", P.getReviewQueue(ids, { now: tomorrow }).length === 2);
  check("worst-first ordering: sql-1 (2 misses) leads",
    P.getReviewQueue(ids, { now: tomorrow })[0].questionId === "sql-1");

  // Answer sql-1 correctly three times -> retires.
  for (let i = 0; i < 3; i++) {
    P.recordReview("sql", [answer("sql-1", true)]);
  }
  check("3 correct in a row sets streak to the retire threshold",
    P.getQuestionStat("sql", "sql-1").streak === P.RETIRE_STREAK);

  queue = P.getReviewQueue(ids, { now: new Date(t0.getTime() + 400 * DAY), includeNotDue: true });
  check("a retired question leaves the deck",
    queue.filter((c) => c.questionId === "sql-1").length === 0);

  // Miss it again -> streak resets -> it comes straight back.
  P.recordReview("sql", [answer("sql-1", false)]);
  queue = P.getReviewQueue(ids, { now: new Date(t0.getTime() + 400 * DAY) });
  check("a miss resurrects a retired question",
    queue.filter((c) => c.questionId === "sql-1").length === 1);
  check("resurrected card is due immediately",
    queue.filter((c) => c.questionId === "sql-1")[0].due === true);
}

// =====================================================================
// 5. includeNotDue — the "study ahead" path.
//
// NOTE the clock here. `now` is injected into READS only; recordReview stamps
// lastSeenAt with the real system clock. So the read clock has to be anchored
// to the real time of the write, not to a hard-coded date — an earlier version
// of this test used a fixed date two days in the future, which made the card
// legitimately due and looked like a scheduling bug.
// =====================================================================
{
  const P = newProgress();
  P.recordAttempt("python", { mode: "full", score: 0, total: 1, answers: [answer("py-1", false)] });
  P.recordReview("python", [answer("py-1", true)]); // streak 1 -> held for a day

  const justAfterWriting = new Date();

  const dueNow = P.getReviewQueue(["python"], { now: justAfterWriting });
  const ahead = P.getReviewQueue(["python"], { now: justAfterWriting, includeNotDue: true });
  check("nothing is due right after answering it correctly", dueNow.length === 0);
  check("study-ahead still offers the card", ahead.length === 1);
  check("study-ahead marks it as not due", ahead[0].due === false);

  // ...and it really does come back a day later.
  const tomorrow = new Date(justAfterWriting.getTime() + DAY + 1000);
  check("the held card is due again a day later",
    P.getReviewQueue(["python"], { now: tomorrow }).length === 1);
}

// =====================================================================
// 6. Cross-module decks.
// =====================================================================
{
  const P = newProgress();
  const t0 = new Date(); // real clock — see the note in section 4
  P.recordAttempt("sql", { mode: "full", score: 0, total: 1, answers: [answer("sql-9", false)] });
  P.recordAttempt("oauth", { mode: "full", score: 0, total: 1, answers: [answer("oauth-1", false)] });

  const all = P.getReviewQueue(["sql", "oauth", "python"], { now: t0 });
  check("deck spans modules", all.length === 2);
  check("each card carries its moduleId",
    all.every((c) => c.moduleId === "sql" || c.moduleId === "oauth"));

  const justSql = P.getReviewQueue(["sql"], { now: t0 });
  check("filtering to one module works", justSql.length === 1 && justSql[0].moduleId === "sql");
}

// =====================================================================
// 7. Page wiring.
// =====================================================================
{
  const html = fs.readFileSync(ROOT + "/flashcards.html", "utf8");
  const manifestSb = { console };
  manifestSb.window = manifestSb;
  vm.createContext(manifestSb);
  vm.runInContext(fs.readFileSync(ROOT + "/js/modules.js", "utf8"), manifestSb);

  function scriptPos(file) {
    const re = /src="([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m[1].replace(/\?.*$/, "") === file) return m.index;
    }
    return -1;
  }

  check("flashcards.html loads progress.js before flashcards.js",
    scriptPos("js/progress.js") !== -1 &&
    scriptPos("js/progress.js") < scriptPos("js/flashcards.js"));

  /* Data files are no longer hand-listed here — js/data-loader.js pulls them
   * from the manifest. See test-modules.js for the loader's own coverage. */
  check("flashcards.html loads data-loader.js before flashcards.js",
    scriptPos("js/data-loader.js") !== -1 &&
    scriptPos("js/data-loader.js") < scriptPos("js/flashcards.js"));
  check("flashcards.html has no hard-coded js/data/ tags",
    (html.match(/src="[^"]*js\/data\/[^"]+"/g) || []).length === 0);

  const navSrc = fs.readFileSync(ROOT + "/js/nav.js", "utf8");
  check("Flashcards is in the nav", /flashcards\.html/.test(navSrc));
}

console.log(failures === 0 ? "\nALL FLASHCARD TESTS PASSED" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
