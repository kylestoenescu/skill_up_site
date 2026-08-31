/*
 * The three-stage JavaScript module.
 *
 * The dangerous part is NOT the rendering, it's the scoring. Before this phase,
 * progress.js had one bestScore per module. Three stages recording under the
 * same module id would share it, so passing the 6-question trace stage would
 * have registered as mastering the whole module — and unlocked everything.
 * These tests exist mostly to prove that can't happen.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function newSandbox() {
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
  vm.runInContext(fs.readFileSync(ROOT + "/js/modules.js", "utf8"), sb);
  vm.runInContext(fs.readFileSync(ROOT + "/js/data/javascript.js", "utf8"), sb);
  return sb;
}

let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

const STAGES = ["trace", "parsons", "free"];

/** Record a full-marks (or given-score) attempt on one stage. */
function attempt(P, stage, score, total) {
  P.recordAttempt("javascript", { mode: "full", stage: stage, score: score, total: total, answers: [] });
}

// =====================================================================
// 1. Data shape
// =====================================================================
{
  const sb = newSandbox();
  const data = sb.QUIZ_DATA["javascript"];

  check("javascript declares three stages", Array.isArray(data.stages) && data.stages.length === 3);
  check("stage ids match the manifest",
    data.stages.map((s) => s.id).join(",") === sb.SiteModules.stagesFor("javascript").join(","));
  check("stage types are trace/parsons/free",
    data.stages.map((s) => s.type).join(",") === "trace,parsons,free");

  const trace = data.stages[0];
  check("every trace question carries a code snippet",
    trace.questions.every((q) => typeof q.code === "string" && q.code.length > 0));
  check("every trace correctIndex is in range",
    trace.questions.every((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length));

  /* The original five questions were reworded into trace form but kept their
   * ids, so a learner's existing answer history still applies. */
  const ids = trace.questions.map((q) => q.id);
  check("original question ids js-1..js-5 all survived",
    ["js-1", "js-2", "js-3", "js-4", "js-5"].every((id) => ids.indexOf(id) !== -1));
  check("js-2 (typeof null) kept its original wording",
    trace.questions.filter((q) => q.id === "js-2")[0].code.indexOf("typeof null") !== -1);

  const parsons = data.stages[1];
  check("every parsons puzzle has at least 3 lines",
    parsons.puzzles.every((p) => Array.isArray(p.lines) && p.lines.length >= 3));
  check("parsons lines are stored in CORRECT order (answer key lives in data)",
    parsons.puzzles[0].lines[0].indexOf("function makeCounter") !== -1);

  const free = data.stages[2];
  check("every free-write task states an expected output",
    free.tasks.every((t) => typeof t.expected === "string" && t.expected.length > 0));
  check("every free-write task ships a worked solution",
    free.tasks.every((t) => typeof t.solution === "string" && t.solution.length > 0));

  // ids must be unique across the whole module, stages included
  const allIds = [].concat(
    trace.questions.map((q) => q.id),
    parsons.puzzles.map((p) => p.id),
    free.tasks.map((t) => t.id)
  );
  check("all item ids unique across the three stages", new Set(allIds).size === allIds.length);

  check("flat `questions` exposes the trace stage for flashcards",
    data.questions === trace.questions);
}

// =====================================================================
// 2. Stages score INDEPENDENTLY — the bug this phase could have caused
// =====================================================================
{
  const sb = newSandbox();
  const P = sb.Progress;

  attempt(P, "trace", 6, 6); // perfect on stage 1 only

  check("trace stage records its own best", P.getModuleSummary("javascript", { stage: "trace" }).bestScore === 6);
  check("parsons stage is untouched", P.getModuleSummary("javascript", { stage: "parsons" }).bestScore === null);
  check("free stage is untouched", P.getModuleSummary("javascript", { stage: "free" }).bestScore === null);

  check("acing ONE stage does not master the module",
    P.isModuleMastered("javascript", STAGES) === false);

  attempt(P, "parsons", 3, 3);
  check("two of three stages still isn't mastery",
    P.isModuleMastered("javascript", STAGES) === false);

  attempt(P, "free", 3, 3);
  check("all three stages passed = module mastered",
    P.isModuleMastered("javascript", STAGES) === true);
}

// =====================================================================
// 3. Progressive gating
// =====================================================================
{
  const sb = newSandbox();
  const P = sb.Progress;

  let gates = P.getStageGates("javascript", STAGES);
  check("stage 1 is open from the start", gates[0].unlocked === true);
  check("stage 2 starts locked", gates[1].unlocked === false);
  check("stage 3 starts locked", gates[2].unlocked === false);

  // Fail stage 1 (4/6 = 67%, under the 80% bar)
  attempt(P, "trace", 4, 6);
  gates = P.getStageGates("javascript", STAGES);
  check("failing stage 1 does not unlock stage 2", gates[1].unlocked === false);

  // Pass it (5/6 = 83%)
  attempt(P, "trace", 5, 6);
  gates = P.getStageGates("javascript", STAGES);
  check("passing stage 1 unlocks stage 2", gates[1].unlocked === true);
  check("stage 3 is still locked", gates[2].unlocked === false);
  check("stage 1 shows as mastered", gates[0].mastered === true);

  attempt(P, "parsons", 3, 3);
  gates = P.getStageGates("javascript", STAGES);
  check("passing stage 2 unlocks stage 3", gates[2].unlocked === true);

  /* The gate is derived, never stored — so wiping progress must re-lock it
   * rather than leaving a stale "unlocked" flag behind. */
  P.reset("javascript");
  gates = P.getStageGates("javascript", STAGES);
  check("clearing progress re-locks the later stages",
    gates[0].unlocked === true && gates[1].unlocked === false && gates[2].unlocked === false);
}

// =====================================================================
// 4. The 80% boundary, per stage size
// =====================================================================
{
  const sb = newSandbox();
  const P = sb.Progress;

  attempt(P, "trace", 5, 6); // 83%
  check("5/6 on a 6-question stage passes", P.getModuleSummary("javascript", { stage: "trace" }).mastered === true);

  const sb2 = newSandbox();
  attempt(sb2.Progress, "trace", 4, 6); // 67%
  check("4/6 does not pass", sb2.Progress.getModuleSummary("javascript", { stage: "trace" }).mastered === false);

  const sb3 = newSandbox();
  attempt(sb3.Progress, "parsons", 2, 3); // 67%
  check("2/3 on a 3-puzzle stage does not pass",
    sb3.Progress.getModuleSummary("javascript", { stage: "parsons" }).mastered === false);

  const sb4 = newSandbox();
  attempt(sb4.Progress, "parsons", 3, 3);
  check("3/3 passes", sb4.Progress.getModuleSummary("javascript", { stage: "parsons" }).mastered === true);
}

// =====================================================================
// 5. Staged attempts must not corrupt anything else
// =====================================================================
{
  const sb = newSandbox();
  const P = sb.Progress;

  attempt(P, "trace", 6, 6);

  /* An unstaged read sees every attempt, which is exactly why callers must pass
   * a stage for staged modules. Asserted so the behaviour is deliberate and
   * documented rather than a surprise. */
  check("an unstaged read still returns something (callers must scope)",
    P.getModuleSummary("javascript").bestScore === 6);

  // A flat module is completely unaffected by the new field.
  P.recordAttempt("sql", { mode: "full", score: 4, total: 5, answers: [] });
  check("a flat module's attempt stores stage:null", P.getAttempts("sql")[0].stage === null);
  check("a flat module's summary is unchanged", P.getModuleSummary("sql").bestScore === 4);

  // Stage survives an export/import round trip.
  const dump = P.exportJSON();
  P.reset();
  P.importJSON(dump);
  check("stage survives export/import",
    P.getModuleSummary("javascript", { stage: "trace" }).bestScore === 6);
}

// =====================================================================
// 6. Page wiring
// =====================================================================
{
  const html = fs.readFileSync(ROOT + "/modules/javascript.html", "utf8");
  check("javascript.html mounts the stage engine", /initStages\("stages", "javascript"\)/.test(html));
  check("javascript.html has the stages container", /id="stages"/.test(html));
  check("javascript.html no longer loads quiz.js", !/js\/quiz\.js/.test(html));

  const stagesSrc = fs.readFileSync(ROOT + "/js/stages.js", "utf8");
  check("stages.js records every attempt with a stage id", /stage: stage\.id/.test(stagesSrc));
  check("stages.js derives gates rather than storing them", /getStageGates/.test(stagesSrc));
  check("parsons uses buttons, not drag events",
    !/dragstart|dragover|draggable/.test(stagesSrc));
}

console.log(failures === 0 ? "\nALL STAGE TESTS PASSED" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
